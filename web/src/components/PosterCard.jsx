// web/src/components/PosterCard.jsx
import { Link } from "react-router-dom";

export default function PosterCard({
  item,
  kind = "vod", // "vod" films, "series" séries, "live" TV
  showTitle = true,
}) {
  // Détermine le type depuis props OU depuis la donnée (TMDB: media_type)
  const inferredKind =
    kind === "series" || item?.series_id || item?.media_type === "tv" || item?.type === "tv"
      ? "series"
      : "movie";

  // Couvre Xtream ET TMDB
  const detId =
    item?.series_id ??            // Xtream séries
    item?.stream_id ??            // Xtream films
    item?.tmdb_id ??              // mapping interne éventuel
    item?.id ??                   // TMDB brut
    null;

  const clickable = (inferredKind === "movie" || inferredKind === "series") && !!detId;

  const title =
    item?.name ||
    item?.title ||
    item?.stream_display_name ||
    item?.stream_name ||
    item?.movie_name ||
    "";

  const img =
    item?.cover_big ||
    item?.poster ||
    item?.image ||
    item?.logo ||
    item?.icon ||
    item?.stream_icon ||
    item?.cover ||
    "";

  const aspect = kind === "live" ? "aspect-video" : "aspect-[2/3]";

  const content = (
    <>
      <div className={`relative ${aspect} w-full overflow-hidden rounded-xl bg-zinc-800`}>
        {img ? (
          <img
            src={img}
            alt={title || "Affiche"}
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"
          />
        ) : null}
      </div>
      {showTitle ? (
        <div className="mt-2 line-clamp-2 text-sm text-zinc-200">{title}</div>
      ) : null}
    </>
  );

  return clickable ? (
    <Link
      to={`/title/${inferredKind}/${encodeURIComponent(detId)}`}
      className="block focus:outline-none focus:ring-2 focus:ring-white/40 rounded-xl"
      onDragStart={(e) => e.preventDefault()}
    >
      {content}
    </Link>
  ) : (
    <div className="block" onDragStart={(e) => e.preventDefault()}>{content}</div>
  );
}
