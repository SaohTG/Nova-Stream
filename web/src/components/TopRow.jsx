// web/src/components/TopRow.jsx
import PosterCard from "./PosterCard.jsx";
import { Link } from "react-router-dom";

function SkeletonCard({ kind = "vod" }) {
  const itemWidthClass = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";
  const ratioClass = kind === "live" ? "aspect-video" : "aspect-[2/3]";
  return (
    <div className={`${itemWidthClass} shrink-0`}>
      <div className={`relative ${ratioClass} w-full overflow-hidden rounded-xl bg-zinc-800 skeleton`} />
    </div>
  );
}

/**
 * Carrousel Top 15 (TMDB) avec gros numéros overlay.
 * Rend l'entête exactement comme une catégorie classique (Row).
 */
export default function TopRow({ title, items = [], kind = "vod", loading = false, seeMoreHref }) {
  const itemWidthClass = kind === "live" ? "w-[12rem] md:w-[14rem]" : "w-40 md:w-44 xl:w-48";

  return (
    <section className="mb-10">
      {/* Header aligné sur Row.jsx */}
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
            : items.slice(0, 15).map((item, idx) => {
                const rank = item.__rank ?? item.rank ?? idx + 1; // 1..15
                const key = `${kind}-top-${item.stream_id || item.series_id || item.name}-${rank}`;
                return (
                  <div className={`relative ${itemWidthClass} shrink-0`} key={key}>
                    {/* Gros numéro en superposition (style Netflix) */}
                    <div
                      className="
                        pointer-events-none
                        absolute -left-2 -bottom-3
                        select-none z-20
                        font-extrabold leading-none
                        text-white/25
                        drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]
                        text-[70px] sm:text-[90px] md:text-[110px] lg:text-[120px]
                      "
                    >
                      {rank}
                    </div>

                    {/* Affiche Xtream (sans titre) */}
                    <PosterCard item={item} kind={kind} showTitle={false} />
                  </div>
                );
              })}
        </div>
      </div>
    </section>
  );
}
