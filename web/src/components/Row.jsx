// web/src/components/Row.jsx
import PosterCard from "./PosterCard.jsx";

function SkeletonCard() {
  return <div className="h-[270px] w-40 shrink-0 rounded-xl bg-zinc-800 skeleton" />;
}

export default function Row({ title, items = [], kind = "vod", loading = false }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">{title}</h2>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex gap-3">
          {loading
            ? Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)
            : items.map((item) => {
                const key = `${kind}-${item.stream_id || item.series_id || item.name}`;
                return <PosterCard key={key} item={item} />;
              })}
        </div>
      </div>
    </section>
  );
}
