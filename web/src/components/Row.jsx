// web/src/components/Row.jsx
import { useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import PosterCard from "./PosterCard.jsx";

function SkeletonCard({ kind = "vod" }) {
  const itemWidthClass = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";
  const ratioClass = kind === "live" ? "aspect-video" : "aspect-[2/3]";
  return (
    <div className={`${itemWidthClass} shrink-0 snap-start`}>
      <div className={`relative ${ratioClass} w-full overflow-hidden rounded-xl bg-zinc-800 skeleton`} />
    </div>
  );
}

export default function Row({ title, items = [], kind = "vod", loading = false, seeMoreHref }) {
  const itemWidthClass = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";

  const trackRef = useRef(null);
  const [drag, setDrag] = useState({ active: false, startX: 0, scrollLeft: 0 });

  const onPointerDown = useCallback((e) => {
    const el = trackRef.current;
    if (!el) return;
    el.setPointerCapture?.(e.pointerId);
    setDrag({ active: true, startX: e.clientX, scrollLeft: el.scrollLeft });
  }, []);

  const onPointerMove = useCallback(
    (e) => {
      if (!drag.active) return;
      const el = trackRef.current;
      if (!el) return;
      const dx = e.clientX - drag.startX;
      el.scrollLeft = drag.scrollLeft - dx;
    },
    [drag]
  );

  const endDrag = useCallback(
    (e) => {
      if (!drag.active) return;
      trackRef.current?.releasePointerCapture?.(e.pointerId);
      setDrag((d) => ({ ...d, active: false }));
    },
    [drag.active]
  );

  const onWheel = useCallback((e) => {
    const el = trackRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: "auto" });
    }
  }, []);

  const go = useCallback((dir) => {
    const el = trackRef.current;
    if (!el) return;
    const amount = Math.round(el.clientWidth * 0.9) * (dir > 0 ? 1 : -1);
    el.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        {!!seeMoreHref && items?.length > 0 && (
          <Link
            to={seeMoreHref}
            className="text-sm font-medium text-zinc-300 hover:text-white hover:underline"
          >
            Voir plus
          </Link>
        )}
      </div>

      <div className="relative">
        {/* Flèche gauche */}
        <button
          aria-label="Précédent"
          onClick={() => go(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10
                     rounded-full bg-black/50 text-white w-10 h-10 grid place-items-center
                     hover:bg-black/70 focus:outline-none"
        >
          ‹
        </button>

        {/* Piste scrollable (swipe/drag sur les images) */}
        <div
          ref={trackRef}
          className="-mx-4 overflow-x-auto px-12 pb-2" // padding latéral pour les flèches
          style={{ scrollSnapType: "x mandatory" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
        >
          <div
            className={`flex gap-4 md:gap-5 lg:gap-6 ${drag.active ? "pointer-events-none" : ""}`}
          >
            {loading
              ? Array.from({ length: 15 }).map((_, i) => <SkeletonCard key={`sk-${i}`} kind={kind} />)
              : items.map((item) => {
                  const key = `${kind}-${item.stream_id || item.series_id || item.name}`;
                  return (
                    <div className={`${itemWidthClass} shrink-0 snap-start`} key={key}>
                      <PosterCard item={item} kind={kind} showTitle={false} />
                    </div>
                  );
                })}
          </div>
        </div>

        {/* Flèche droite */}
        <button
          aria-label="Suivant"
          onClick={() => go(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10
                     rounded-full bg-black/50 text-white w-10 h-10 grid place-items-center
                     hover:bg-black/70 focus:outline-none"
        >
          ›
        </button>
      </div>
    </section>
  );
}
