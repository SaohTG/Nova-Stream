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
  const startYRef = useRef(0);
  const startScrollRef = useRef(0);
  const lastXRef = useRef(0);
  const velRef = useRef(0);
  const movedRef = useRef(0);
  const axisRef = useRef(null); // null | 'x' | 'y'

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

  const begin = (x, y) => {
    const el = trackRef.current; if (!el) return;
    stopInertia();
    axisRef.current = null;
    startXRef.current = x;
    startYRef.current = y;
    lastXRef.current = x;
    startScrollRef.current = el.scrollLeft;
    velRef.current = 0;
    movedRef.current = 0;
  };

  const dragX = (x) => {
    const el = trackRef.current; if (!el) return;
    const dx = x - lastXRef.current;
    el.scrollLeft = startScrollRef.current - (x - startXRef.current);
    velRef.current = dx;
    lastXRef.current = x;
    movedRef.current += Math.abs(dx);
    measure();
  };

  const end = () => {
    if (!dragging) { axisRef.current = null; return; }
    setDragging(false);
    const el = trackRef.current; if (!el) return;
    let v = velRef.current;
    const friction = 0.92;
    const step = () => {
      v *= friction;
      if (Math.abs(v) < 0.4) { measure(); axisRef.current = null; return; }
      el.scrollLeft -= v;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Souris / stylet via Pointer Events
  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    begin(e.clientX, e.clientY);
  }, []);
  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    dragX(e.clientX);
  }, [dragging]);
  const onPointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    end();
  }, [dragging]);

  // Tactile: détecter l’axe. Si horizontal => empêcher le scroll de page.
  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    begin(t.clientX, t.clientY);
  }, []);
  const onTouchMove  = useCallback((e) => {
    const t = e.touches[0];
    const dx = t.clientX - startXRef.current;
    const dy = t.clientY - startYRef.current;

    if (axisRef.current == null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axisRef.current === "x") setDragging(true);
      }
    }
    if (axisRef.current === "x") {
      e.preventDefault(); // bloque le scroll vertical de la page pendant le swipe horizontal
      dragX(t.clientX);
    }
  }, []);
  const onTouchEnd   = useCallback(() => end(), [dragging]);

  // Molette: ne rien faire quand la souris est sur le carrousel
  const onWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
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
          onWheelCapture={onWheel}
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
