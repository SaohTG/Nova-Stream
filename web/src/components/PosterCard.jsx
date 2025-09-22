// web/src/components/PosterCard.jsx
import { Link } from "react-router-dom";

export default function PosterCard({
  item,
  kind = "vod",          // "vod" for films, "series" for series, "live" for TV
  showTitle = true,
}) {
  const isSeries = kind === "series" || !!item?.series_id;
  const detKind = isSeries ? "series" : "movie";
  const detId = item?.series_id || item?.stream_id; // requis pour la page détail

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
          />
        ) : null}
      </div>
      {showTitle ? (
        <div className="mt-2 line-clamp-2 text-sm text-zinc-200">{title}</div>
      ) : null}
    </>
  );

  // Lien actif uniquement pour films/séries avec un id Xtream disponible
  const clickable = (kind === "vod" || kind === "series") && !!detId;

  return clickable ? (
    <Link
      to={`/title/${detKind}/${detId}`}
      className="block focus:outline-none focus:ring-2 focus:ring-white/40 rounded-xl"
      onDragStart={(e) => e.preventDefault()}
    >
      {content}
    </Link>
  ) : (
    <div className="block" onDragStart={(e) => e.preventDefault()}>
      {content}
    </div>
  );
}
