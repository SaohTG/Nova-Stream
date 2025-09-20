// web/src/components/Row.jsx
import { Link } from "react-router-dom";
import PosterCard from "./PosterCard.jsx";

function SkeletonCard({ kind = "vod" }) {
  const itemWidthClass = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";
  const ratioClass = kind === "live" ? "aspect-video" : "aspect-[2/3]";
  return (
    <div className={`${itemWidthClass} shrink-0`}>
      <div className={`relative ${ratioClass} w-full overflow-hidden rounded-xl bg-zinc-800 skeleton`} />
      {/* pas de titre */}
    </div>
  );
}

export default function Row({ title, items = [], kind = "vod", loading = false, seeMoreHref }) {
  const itemWidthClass = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";

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
        <div className="flex gap-4 md:gap-5 lg:gap-6">
          {loading
            ? Array.from({ length: 15 }).map((_, i) => <SkeletonCard key={`sk-${i}`} kind={kind} />)
            : items.map((item) => {
                const key = `${kind}-${item.stream_id || item.series_id || item.name}`;
                return (
                  <div className={`${itemWidthClass} shrink-0`} key={key}>
                    {/* 🔥 on masque le titre dans tous les carrousels */}
                    <PosterCard item={item} kind={kind} showTitle={false} />
                  </div>
                );
              })}
        </div>
      </div>
    </section>
  );
}
