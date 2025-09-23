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

  const startX = useRef(0);
  const startY = useRef(0);
  const startScroll = useRef(0);
  const lastX = useRef(0);
  const vel = useRef(0);
  const moved = useRef(0);
  const axis = useRef(null); // null | 'x' | 'y'
  const pressed = useRef(false);
  const hasDragged = useRef(false);
  const blockClickUntil = useRef(0);

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
    axis.current = null;
    pressed.current = true;
    hasDragged.current = false;
    setDragging(false);
    startX.current = x;
    startY.current = y;
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
    axis.current = null;
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

  // Souris / stylet
  const onPointerDown = useCallback((e) => begin(e.clientX, e.clientY), []);
  const onPointerMove = useCallback((e) => { if (pressed.current) dragHoriz(e.clientX); }, []);
  const onPointerUp   = useCallback(() => end(), []);

  // Tactile
  const onTouchStart = useCallback((e) => { const t = e.touches[0]; begin(t.clientX, t.clientY); }, []);
  const onTouchMove  = useCallback((e) => {
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (axis.current == null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axis.current === "x") { if (e.cancelable) e.preventDefault(); dragHoriz(t.clientX); }
  }, []);
  const onTouchEnd   = useCallback(() => end(), []);

  // Molette: horizontal explicite => carrousel; sinon laisser la page défiler
  const onWheel = useCallback((e) => {
    const el = trackRef.current; if (!el) return;
    const ax = Math.abs(e.deltaX);
    const ay = Math.abs(e.deltaY);
    const horizontalIntent =
      e.shiftKey ||
      ax >= ay * 2.0 ||           // seuil plus strict
      (ax > 12 && ay < 3);        // gestes trackpad quasi-purs en X
    if (horizontalIntent) {
      e.preventDefault();
      e.stopPropagation();
      const dx = ax ? e.deltaX : (e.deltaY > 0 ? 120 : -120);
      el.scrollBy({ left: dx, behavior: "auto" });
    }
    // sinon: ne rien faire => la page défile en Y
  }, []);

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
          onWheel={onWheel}
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
            className="absolute right-0 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >›</button>
        )}
      </div>
    </section>
  );
}
