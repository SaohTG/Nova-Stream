import { useRef, useState, useCallback } from "react";
import "./SwipeCarousel.css";

export default function SwipeCarousel({
  items = [],
  renderItem,          // (item) => JSX (ton poster, titre, etc.)
  gap = 16,            // espace entre cartes en px
  scrollBy = 0.9,      // % de la largeur du viewport à défiler par clic
  itemClassName = "",  // classes supplémentaires pour chaque slide
}) {
  const trackRef = useRef(null);
  const [drag, setDrag] = useState({ active: false, startX: 0, scrollLeft: 0 });

  const onPointerDown = useCallback((e) => {
    const el = trackRef.current;
    if (!el) return;
    el.setPointerCapture?.(e.pointerId);
    setDrag({ active: true, startX: e.clientX, scrollLeft: el.scrollLeft });
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!drag.active) return;
    const el = trackRef.current;
    if (!el) return;
    const dx = e.clientX - drag.startX;
    el.scrollLeft = drag.scrollLeft - dx;
  }, [drag]);

  const endDrag = useCallback((e) => {
    if (!drag.active) return;
    const el = trackRef.current;
    el?.releasePointerCapture?.(e.pointerId);
    setDrag((d) => ({ ...d, active: false }));
  }, [drag.active]);

  const go = useCallback((dir) => {
    const el = trackRef.current;
    if (!el) return;
    const amount = Math.round(el.clientWidth * scrollBy) * (dir > 0 ? 1 : -1);
    el.scrollBy({ left: amount, behavior: "smooth" });
  }, [scrollBy]);

  // wheel vertical -> défilement horizontal
  const onWheel = useCallback((e) => {
    const el = trackRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: "auto" });
    }
  }, []);

  return (
    <div className="relative">
      {/* Flèches */}
      <button
        aria-label="Précédent"
        onClick={() => go(-1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10
                   rounded-full bg-black/50 text-white w-10 h-10 grid place-items-center
                   hover:bg-black/70 focus:outline-none"
      >
        ‹
      </button>
      <button
        aria-label="Suivant"
        onClick={() => go(1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10
                   rounded-full bg-black/50 text-white w-10 h-10 grid place-items-center
                   hover:bg-black/70 focus:outline-none"
      >
        ›
      </button>

      {/* Piste scrollable */}
      <div
        ref={trackRef}
        className="ns-carousel"
        style={{
          gap: `${gap}px`,
          scrollSnapType: "x mandatory",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        {items.map((it, i) => (
          <div
            key={it.id ?? i}
            className={`ns-slide ${itemClassName}`}
            style={{ scrollSnapAlign: "start" }}
          >
            {renderItem ? renderItem(it) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
