// web/src/components/Row.jsx
import React from "react";
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

const Row = React.memo(function Row({ title, items = [], kind = "vod", loading = false, seeMoreHref }) {
  const w = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";

  const trackRef = useRef(null);
  const rafRef = useRef(0);

  // souris
  const startX = useRef(0);
  const startScroll = useRef(0);
  const lastX = useRef(0);
  const vel = useRef(0);
  const moved = useRef(0);
  const pressed = useRef(false);
  const hasDragged = useRef(false);
  const blockClickUntil = useRef(0);

  // tactile
  const tStartX = useRef(0);
  const tStartY = useRef(0);
  const axis = useRef(null); // 'x' | 'y' | null

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

  // drag souris
  const begin = (x) => {
    const el = trackRef.current; if (!el) return;
    stopInertia();
    pressed.current = true;
    hasDragged.current = false;
    setDragging(false);
    startX.current = x;
    lastX.current = x;
    startScroll.current = el.scrollLeft;
    vel.current = 0;
    moved.current = 0;
  };

  const dragHoriz = (x) => {
    const el = trackRef.current; if (!el) return;
    const dx = x - lastX.current;
    el.scrollLeft = startScroll.current - (x - startX.current);
    vel.current = dx;
    lastX.current = x;
    moved.current += Math.abs(dx);
    if (!hasDragged.current && moved.current > 6) {
      hasDragged.current = true;
      setDragging(true);
    }
    measure();
  };

  const end = () => {
    pressed.current = false;
    const el = trackRef.current; if (!el) { setDragging(false); return; }
    const dragged = hasDragged.current;
    setDragging(false);
    if (dragged) blockClickUntil.current = performance.now() + 150;

    if (!dragged) return;
    let v = vel.current;
    const friction = 0.92;
    const step = () => {
      v *= friction;
      if (Math.abs(v) < 0.4) { measure(); return; }
      el.scrollLeft -= v;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Souris uniquement
  const onPointerDown = useCallback((e) => {
    if (e.pointerType === "mouse") begin(e.clientX);
  }, []);
  const onPointerMove = useCallback((e) => {
    if (e.pointerType === "mouse" && pressed.current) dragHoriz(e.clientX);
  }, []);
  const onPointerUp   = useCallback(() => end(), []);

  // Tactile natif + axis lock via listeners natifs (passive:false pour preventDefault)
  useEffect(() => {
    const el = trackRef.current; if (!el) return;

    const ts = (e) => {
      const t = e.touches[0];
      tStartX.current = t.clientX;
      tStartY.current = t.clientY;
      startScroll.current = el.scrollLeft;
      axis.current = null;
      stopInertia();
      hasDragged.current = false;
      moved.current = 0;
    };

    const tm = (e) => {
      const t = e.touches[0];
      const dx = t.clientX - tStartX.current;
      const dy = t.clientY - tStartY.current;

      if (axis.current == null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }

      if (axis.current === "x") {
        // Bloque le scroll vertical de la page seulement quand l'utilisateur a choisi l'horizontal
        if (e.cancelable) e.preventDefault();
        el.scrollLeft = startScroll.current - dx;
        moved.current += Math.abs(dx);
        if (!hasDragged.current && moved.current > 6) {
          hasDragged.current = true;
          setDragging(true);
        }
        measure();
      }
      // Si axis = 'y' => ne rien faire, laisser la page défiler
    };

    const te = () => {
      axis.current = null;
      setDragging(false);
      // Pas d'inertie en tactile pour rester natif
    };

    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te, { passive: true });
    el.addEventListener("touchcancel", te, { passive: true });

    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
      el.removeEventListener("touchcancel", te);
    };
  }, [measure]);

  // Molette: laisser le scroll vertical natif de la page
  // On ne capture plus la molette, permettant un scroll vertical fluide

  const onClickCapture = useCallback((e) => {
    if (hasDragged.current || performance.now() < blockClickUntil.current) {
      e.preventDefault(); e.stopPropagation();
    }
  }, []);

  const go = useCallback((dir) => {
    const el = trackRef.current; if (!el) return;
    stopInertia();
    const amount = Math.round(el.clientWidth * 0.9) * (dir > 0 ? 1 : -1);
    el.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        {!!seeMoreHref && items?.length > 0 && (
          <Link to={seeMoreHref} className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition-colors group">
            Voir plus
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      <div className="relative">
        {canLeft && (
          <button
            aria-label="Précédent"
            onClick={() => go(-1)}
            className="absolute left-0 top-1/2 z-50 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white hover:bg-black/80 hover:border-white/20 hover:scale-110 transition-all duration-300 shadow-xl"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <div
          ref={trackRef}
          className={`-mx-4 overflow-x-auto overflow-y-hidden px-12 pb-2 ns-scroll ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            touchAction: "pan-y pinch-zoom",
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain"
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={onClickCapture}
          onDragStart={(e) => e.preventDefault()}
          role="region"
          aria-label={title}
        >
          <div className="flex gap-4 md:gap-5 lg:gap-6">
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
            className="absolute right-0 top-1/2 z-50 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white hover:bg-black/80 hover:border-white/20 hover:scale-110 transition-all duration-300 shadow-xl"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
});

export default Row;
