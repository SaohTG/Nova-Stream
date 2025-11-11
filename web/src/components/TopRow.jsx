// web/src/components/TopRow.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import PosterCard from "./PosterCard.jsx";
import { getJson } from "../lib/api";
import { getCached, setCached } from "../lib/clientCache";

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
      // Vérifier le cache client d'abord (5 min)
      const cached = getCached("trending-week");
      if (cached) {
        const top = Array.isArray(cached) ? cached.slice(0, 15).map((it, i) => ({ ...it, __rank: i + 1 })) : [];
        setItems(top);
        setLoading(false);
        return;
      }
      
      try {
        const data = await getJson("/tmdb/trending-week-mapped", { signal: ac.signal });
        const top = Array.isArray(data) ? data.slice(0, 15).map((it, i) => ({ ...it, __rank: i + 1 })) : [];
        setItems(top);
        
        // Mettre en cache côté client (5 min)
        if (top.length > 0) {
          setCached("trending-week", top);
        }
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
  const axis = useRef(null);

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

  // Tactile natif avec axis lock
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
        if (e.cancelable) e.preventDefault();
        el.scrollLeft = startScroll.current - dx;
        moved.current += Math.abs(dx);
        if (!hasDragged.current && moved.current > 6) {
          hasDragged.current = true;
          setDragging(true);
        }
        measure();
      }
    };

    const te = () => {
      axis.current = null;
      setDragging(false);
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
    <section className="mb-12 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-2 shadow-lg">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Top Tendances</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Cette semaine</p>
          </div>
        </div>
        <div className="badge">
          <svg className="w-3 h-3 mr-1 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
          Populaire
        </div>
      </div>

      <div className="relative group/section">
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
          aria-label="Tendances de la semaine"
        >
          <div className="flex gap-4 md:gap-5 lg:gap-6">
            {loading
              ? Array.from({ length: 15 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)
              : items.map((item, idx) => {
                  const key = `top-${item.id || item.stream_id || item.series_id || item.name || idx}`;
                  const rank = item.__rank ?? idx + 1;
                  return (
                    <div className="w-40 md:w-44 xl:w-48 shrink-0 relative overflow-visible group/rank" key={key}>
                      <div className="relative z-10">
                        <PosterCard item={item} kind="vod" showTitle={false} />
                      </div>
                      {/* Numéro de classement avec dégradé moderne */}
                      <div
                        className="absolute -left-4 -bottom-3 z-20 font-black leading-none pointer-events-none select-none text-[88px] md:text-[120px] lg:text-[160px] transition-all duration-300 group-hover/rank:scale-110"
                        style={{
                          WebkitTextStroke: '2px rgba(0,0,0,0.8)',
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 100%)',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.5))',
                        }}
                        aria-hidden
                      >
                        {rank}
                      </div>
                      {/* Badge TOP pour les 3 premiers */}
                      {rank <= 3 && (
                        <div className="absolute -top-2 -right-2 z-30 animate-pulse">
                          <div className={`rounded-full px-2 py-1 text-xs font-bold shadow-lg ${
                            rank === 1 ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-black' :
                            rank === 2 ? 'bg-gradient-to-r from-slate-300 to-slate-400 text-black' :
                            'bg-gradient-to-r from-amber-600 to-amber-700 text-white'
                          }`}>
                            #{rank}
                          </div>
                        </div>
                      )}
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
}
