// web/src/components/Row.jsx
import { useRef } from "react";
import PosterCard from "./PosterCard.jsx";

const Row = ({ title, items = [], kind = "vod" }) => {
  const scroller = useRef(null);
  const step = () => scroller.current?.clientWidth ?? 800;

  const cardAspect = kind === "live" ? "16/9" : "2/3";

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="hidden gap-2 md:flex">
          <button
            onClick={() => (scroller.current.scrollLeft -= step())}
            className="rounded-lg bg-zinc-800 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
            aria-label="Précédent"
          >
            ←
          </button>
          <button
            onClick={() => (scroller.current.scrollLeft += step())}
            className="rounded-lg bg-zinc-800 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
            aria-label="Suivant"
          >
            →
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        className="scrollbar-none flex gap-3 overflow-x-auto scroll-smooth pr-2"
      >
        {items.map((it) => (
          <div key={`${kind}-${it.stream_id || it.series_id || it.name}`} className="min-w-[140px] max-w-[160px]">
            <PosterCard item={it} aspect={cardAspect} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default Row;
