// web/src/components/Row.jsx
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import PosterCard from "./PosterCard.jsx";

function SkeletonCard({ kind = "vod" }) {
  const w = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";
  const r = kind === "live" ? "aspect-video" : "aspect-[2/3]";
  return (
    <div className={`${w} shrink-0`}>
      <div className={`relative ${r} w-full overflow-hidden rounded-xl bg-zinc-800 skel`} />
    </div>
  );
}

export default function Row({ title, items = [], kind = "vod", loading = false, seeMoreHref }) {
  const w = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";

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

  // Pas de handler wheel: la molette fait défiler la page, pas le carrousel.

  const onClickCapture = useCallback((e) => {
    if (movedRef.current > 5) { e.preventDefault(); e.stopPropagation(); }
    movedRef.current = 0;
  }, []);

  const go = useCallback((dir) => {
    const el = trackRef.current; if (!el) return;
    stopInertia();
    const amount = Math.round(el.clientWidth * 0.9) * (dir > 0 ? 1 : -1);
    el.scrollBy({ left: amount, behavior: "smooth" });
    // mesurera après l’animation via "scroll" listener
  }, []);

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        {!!seeMoreHref && items?.length > 0 && (
          <Link to={seeMoreHref} className="text-sm font-medium text-zinc-300 hover:text-white hover:underline">
            Voir plus
          </Link>
        )}
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
              ? Array.from({ length: 15 }).map((_, i) => <SkeletonCard key={`sk-${i}`} kind={kind} />)
              : items.map((item) => {
                  const key = `${kind}-${item.stream_id || item.series_id || item.name}`;
                  return (
                    <div className={`${w} shrink-0`} key={key}>
                      <PosterCard item={item} kind={kind} showTitle={false} />
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
