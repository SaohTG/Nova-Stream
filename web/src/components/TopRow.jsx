// web/src/components/TopRow.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import PosterCard from "./PosterCard.jsx";
import { getJson } from "../lib/api";

function SkeletonCard() {
  return (
    <div className="w-40 md:w-44 xl:w-48 shrink-0">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-800 skel" />
    </div>
  );
}

export default function TopRow() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const trackRef = useRef(null);
  const rafRef = useRef(0);
  const startXRef = useRef(0);
  const startScrollRef = useRef(0);
  const lastXRef = useRef(0);
  const velRef = useRef(0);
  const movedRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const stopInertia = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
  const measure = useCallback(() => {
    const el = trackRef.current; if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const el = trackRef.current; if (!el) return;
    const onScroll = () => measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, [measure, items.length]);

  useEffect(() => {
    document.body.style.userSelect = dragging ? "none" : "";
    return () => { document.body.style.userSelect = ""; };
  }, [dragging]);

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
    measure();
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    const el = trackRef.current; if (!el) return;
    let v = velRef.current;
    const friction = 0.92;
    const step = () => {
      v *= friction;
      if (Math.abs(v) < 0.4) { measure(); return; }
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

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-white">Tendances de la semaine</h2>
      </div>

      <div className="relative">
        {canLeft && (
          <button
            aria-label="Précédent"
            onClick={() => go(-1)}
            className="absolute left-0 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >‹</button>
        )}

        <div
          ref={trackRef}
          className={`-mx-4 overflow-x-auto overflow-y-hidden px-12 pb-2 ns-scroll ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ touchAction: "pan-y pinch-zoom", overscrollBehaviorX: "contain" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClickCapture={onClickCapture}
          onDragStart={(e) => e.preventDefault()}
        >
          <div className={`flex gap-4 md:gap-5 lg:gap-6 ${dragging ? "pointer-events-none select-none" : ""}`}>
            {loading
              ? Array.from({ length: 15 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)
              : items.map((item, idx) => {
                  const key = `top-${item.id || item.stream_id || item.series_id || item.name || idx}`;
                  const rank = item.__rank ?? idx + 1;
                  return (
                    <div className="w-40 md:w-44 xl:w-48 shrink-0 relative overflow-visible" key={key}>
                      <div className="relative z-10">
                        <PosterCard item={item} kind="vod" showTitle={false} />
                      </div>
                      <div
                        className="absolute -left-3 -bottom-2 z-20 text-white/20 font-extrabold leading-none pointer-events-none select-none [text-shadow:0_0_20px_rgba(0,0,0,0.6)] text-[88px] md:text-[120px] lg:text-[160px]"
                        aria-hidden
                      >
                        {rank}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>

        {canRight && (
          <button
            aria-label="Suivant"
            onClick={() => go(1)}
            className="absolute right-0 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >›</button>
        )}
      </div>
    </section>
  );
}
