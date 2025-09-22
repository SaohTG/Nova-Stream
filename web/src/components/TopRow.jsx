// web/src/components/TopRow.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import PosterCard from "./PosterCard.jsx";
import { getJson } from "../lib/api";

function SkeletonCard() {
  return (
    <div className="w-40 md:w-44 xl:w-48 shrink-0 snap-start">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-800 skel" />
    </div>
  );
}

export default function TopRow() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // fetch TMDB tendances (top 15)
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const data = await getJson("/tmdb/trending-week-mapped", { signal: ac.signal });
        const top = Array.isArray(data) ? data.slice(0, 15).map((it, i) => ({ ...it, __rank: i + 1 })) : [];
        setItems(top);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  // swipe + inertie + flèches conditionnelles
  const trackRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  const rafRef = useRef(0);
  const startXRef = useRef(0);
  const startScrollRef = useRef(0);
  const lastXRef = useRef(0);
  const velRef = useRef(0);
  const movedRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const root = trackRef.current;
    const L = leftRef.current;
    const R = rightRef.current;
    if (!root || !L || !R) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === L) setCanLeft(!e.isIntersecting);
          if (e.target === R) setCanRight(!e.isIntersecting);
        }
      },
      { root, threshold: 0.99 }
    );
    io.observe(L);
    io.observe(R);

    const t = setTimeout(() => root.scrollBy({ left: 0, behavior: "auto" }), 0);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, [items, loading]);

  const recalc = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft < max - 1);
  }, []);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        recalc();
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", recalc);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", recalc);
    };
  }, [recalc, items]);

  useEffect(() => {
    document.body.style.userSelect = dragging ? "none" : "";
    return () => {
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  const stopInertia = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };
  const startDrag = (x) => {
    const el = trackRef.current; if (!el) return;
    stopInertia();
    setDragging(true);
    startXRef.current = x;
    lastXRef.current = x;
    startScrollRef.current = el.scrollLeft;
    velRef.current = 0;
    movedRef.current = 0;
  };
  const moveDrag = (x) => {
    if (!dragging) return;
    const el = trackRef.current; if (!el) return;
    const dx = x - lastXRef.current;
    el.scrollLeft = startScrollRef.current - (x - startXRef.current);
    velRef.current = dx;
    lastXRef.current = x;
    movedRef.current += Math.abs(dx);
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    const el = trackRef.current; if (!el) return;
    let v = velRef.current;
    const friction = 0.92;
    const step = () => {
      v *= friction;
      if (Math.abs(v) < 0.4) return;
      el.scrollLeft -= v;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startDrag(e.clientX);
  }, []);
  const onPointerMove = useCallback((e) => moveDrag(e.clientX), [dragging]);
  const onPointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    endDrag();
  }, [dragging]);

  const onTouchStart = useCallback((e) => startDrag(e.touches[0].clientX), []);
  const onTouchMove  = useCallback((e) => moveDrag(e.touches[0].clientX), [dragging]);
  const onTouchEnd   = useCallback(() => endDrag(), [dragging]);

  const onWheel = useCallback((e) => {
    const el = trackRef.current; if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    el.scrollBy({ left: dx, behavior: "auto" });
  }, []);

  const onClickCapture = useCallback((e) => {
    if (movedRef.current > 5) { e.preventDefault(); e.stopPropagation(); }
    movedRef.current = 0;
  }, []);

  const go = useCallback((dir) => {
    const el = trackRef.current; if (!el) return;
    stopInertia();
    const amount = Math.round(el.clientWidth * 0.9) * (dir > 0 ? 1 : -1);
    el.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  const showLeftBtn = canLeft && !loading && items.length > 0;
  const showRightBtn = canRight && !loading && items.length > 0;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-white">Tendances de la semaine</h2>
      </div>

      <div className="relative">
        {showLeftBtn && (
          <button
            aria-label="Précédent"
            onClick={() => go(-1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 text-white w-10 h-10 grid place-items-center hover:bg-black/70 focus:outline-none"
          >
            ‹
          </button>
        )}

        <div
          ref={trackRef}
          className={`-mx-4 overflow-x-auto overflow-y-hidden px-12 pb-2 select-none ns-scroll ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ scrollSnapType: "x mandatory", touchAction: "pan-y pinch-zoom", overscrollBehavior: "contain" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheelCapture={onWheel}
          onClickCapture={onClickCapture}
          onDragStart={(e) => e.preventDefault()}
        >
          <div className={`flex gap-4 md:gap-5 lg:gap-6 ${dragging ? "pointer-events-none" : ""}`}>
            {/* sentinelle gauche */}
            <div ref={leftRef} className="w-px h-px shrink-0" aria-hidden />
            {loading
              ? Array.from({ length: 15 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)
              : items.map((item, idx) => {
                  const key = `top-${item.id || item.stream_id || item.series_id || item.name || idx}`;
                  const rank = item.__rank ?? idx + 1;
                  return (
                    <div className="w-40 md:w-44 xl:w-48 shrink-0 snap-start relative overflow-visible" key={key}>
                      <div className="relative z-10">
                        <PosterCard item={item} kind="vod" showTitle={false} />
                      </div>
                      <div
                        className="absolute -left-3 -bottom-2 z-20
                                   text-white/20 font-extrabold leading-none pointer-events-none select-none
                                   [text-shadow:0_0_20px_rgba(0,0,0,0.6)]
                                   text-[88px] md:text-[120px] lg:text-[160px]"
                        aria-hidden
                      >
                        {rank}
                      </div>
                    </div>
                  );
                })}
            {/* sentinelle droite */}
            <div ref={rightRef} className="w-px h-px shrink-0" aria-hidden />
          </div>
        </div>

        {showRightBtn && (
          <button
            aria-label="Suivant"
            onClick={() => go(1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 text-white w-10 h-10 grid place-items-center hover:bg-black/70 focus:outline-none"
          >
            ›
          </button>
        )}
      </div>
    </section>
  );
}
