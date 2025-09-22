// web/src/components/PosterCard.jsx
import { Link } from "react-router-dom";

export default function PosterCard({
  item,
  kind = "vod",              // "vod" | "series" | "live"
  showTitle = true,
  linkToDetail = true,        // met à false si tu le wrap déjà ailleurs
}) {
  const isSeries = kind === "series" || !!item?.series_id;
  const id = item?.series_id || item?.stream_id || item?.id;
  const detKind = isSeries ? "series" : "movie";
  const to = linkToDetail && id && (kind === "vod" || kind === "series") ? `/title/${detKind}/${id}` : null;

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

  return to ? (
    <Link
      to={to}
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
