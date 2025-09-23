// web/src/components/PosterCard.jsx
import { Link } from "react-router-dom";
import { useCallback } from "react";
import { useMyListStatus, toggleMyList } from "../lib/mylist";

export default function PosterCard({ item, kind = "vod", showTitle = true }) {
  const isSeries = kind === "series" || !!item?.series_id || item?.media_type === "tv" || item?.type === "tv";
  const detKind = isSeries ? "series" : "movie";
  const detId = isSeries ? (item?.series_id ?? null) : (item?.stream_id ?? null);

  const title =
    item?.name || item?.title || item?.stream_display_name || item?.stream_name || item?.movie_name || "";
  const img =
    item?.cover_big || item?.poster || item?.image || item?.logo || item?.icon || item?.stream_icon || item?.cover || item?.poster_path || "";

  const aspect = kind === "live" ? "aspect-video" : "aspect-[2/3]";
  const clickable = !!detId;

  const saved = useMyListStatus(detKind, detId || "__nil__");
  const onToggle = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (!detId) return;
    toggleMyList(detKind, detId, { title, img, raw: item });
  }, [detKind, detId, title, img, item]);

  const content = (
    <>
      <div className={`relative ${aspect} w-full overflow-hidden rounded-xl bg-zinc-800`}>
        {detId && (
          <button
            type="button"
            aria-label={saved ? "Retirer de Ma Liste" : "Ajouter à Ma Liste"}
            aria-pressed={saved}
            onClick={onToggle}
            className={`absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full
                        bg-black/50 backdrop-blur text-white transition
                        ${saved ? "text-amber-400" : "hover:bg-black/70"}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              {saved
                ? <path fill="currentColor" d="M6 2h12a2 2 0 0 1 2 2v18l-8-4-8 4V4a2 2 0 0 1 2-2z"/>
                : <path fill="currentColor" d="M6 2h12a2 2 0 0 1 2 2v18l-8-4-8 4V4a2 2 0 0 1 2-2zm0 2v14.764l6-3 6 3V4H6z"/>}
            </svg>
          </button>
        )}
        {img ? <img src={img} alt={title || "Affiche"} className="h-full w-full object-cover" draggable={false} loading="lazy" /> : null}
      </div>
      {showTitle ? <div className="mt-2 line-clamp-2 text-sm text-zinc-200">{title}</div> : null}
    </>
  );

  return clickable ? (
    <Link
      to={`/title/${detKind}/${encodeURIComponent(detId)}`}
      className="block focus:outline-none focus:ring-2 focus:ring-white/40 rounded-xl"
      onDragStart={(e) => e.preventDefault()}
    >
      {content}
    </Link>
  ) : (
    <div className="block" onDragStart={(e) => e.preventDefault()}>{content}</div>
  );
}

