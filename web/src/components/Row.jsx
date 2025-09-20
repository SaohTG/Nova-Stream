// web/src/components/Row.jsx
import { Link } from "react-router-dom";
import PosterCard from "./PosterCard.jsx";

function SkeletonCard({ kind = "vod" }) {
  const cls =
    kind === "live"
      ? "h-[120px] w-[12rem] shrink-0 rounded-xl bg-zinc-800 skeleton"
      : "h-[270px] w-40 shrink-0 rounded-xl bg-zinc-800 skeleton";
  return <div className={cls} />;
}

export default function Row({ title, items = [], kind = "vod", loading = false, seeMoreHref }) {
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

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex gap-3">
          {loading
            ? Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={`sk-${i}`} kind={kind} />)
            : items.map((item) => {
                const key = `${kind}-${item.stream_id || item.series_id || item.name}`;
                return <PosterCard key={key} item={item} kind={kind} />;
              })}
        </div>
      </div>
    </section>
  );
}
