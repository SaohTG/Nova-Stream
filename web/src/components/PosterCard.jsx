// web/src/components/PosterCard.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useCallback } from "react";
import { useMyListStatus, toggleMyList } from "../lib/mylist";

const PosterCard = React.memo(function PosterCard({ item, kind = "vod", showTitle = true }) {
  const isLive =
    kind === "live" ||
    String(item?.stream_type || "").toLowerCase() === "live";
  const isSeries =
    (!isLive && (kind === "series")) ||
    !!item?.series_id ||
    item?.media_type === "tv" ||
    item?.type === "tv";

  const detKind = isLive ? "live" : (isSeries ? "series" : "movie");

  // IDs possibles
  const xtId = isLive
    ? (item?.stream_id ?? null)
    : (isSeries ? (item?.series_id ?? null) : (item?.stream_id ?? null));
  const tmdbId = item?.tmdb_id ?? item?.id ?? null;

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
    item?.poster_path ||
    "";

  const aspect = isLive ? "aspect-video" : "aspect-[2/3]";

  // Sauvegarde "Ma Liste" : utilise l'ID dispo (Xtream prioritaire)
  const saveId = xtId || tmdbId || "__nil__";
  const saved = useMyListStatus(detKind, saveId);
  const onToggle = useCallback(
    (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!saveId || saveId === "__nil__") return;
      toggleMyList(detKind, String(saveId), { title, img, raw: item });
    },
    [detKind, saveId, title, img, item]
  );

  const clickable = Boolean(xtId || tmdbId);

  // Lien:
  // - Xtream → /title/<kind>/xid-<stream_id|series_id>
  // - TMDB   → /title/<kind>/<tmdb_id>
  const href = xtId
    ? `/title/${detKind}/xid-${encodeURIComponent(String(xtId))}`
    : (tmdbId ? `/title/${detKind}/${encodeURIComponent(String(tmdbId))}` : "#");

  const content = (
    <>
      <div className={`relative ${aspect} w-full overflow-hidden rounded-xl bg-zinc-800`}>
        {(xtId || tmdbId) && (
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
        {img ? (
          <img
            src={img}
            alt={title || "Affiche"}
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"
            decoding="async"
            style={{
              // Optimize image loading
              contentVisibility: "auto",
              containIntrinsicSize: "160px 240px", // Approximate poster size
            }}
            onError={(e) => {
              // Fallback for broken images
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <div className="h-full w-full bg-zinc-700 flex items-center justify-center">
            <svg className="h-12 w-12 text-zinc-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </div>
        )}
      </div>
      {showTitle ? (
        <div className="mt-2 line-clamp-2 text-sm text-zinc-200">{title}</div>
      ) : null}
    </>
  );

  return clickable ? (
    <Link
      to={href}
      state={{ title, poster: img }}
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
});

export default PosterCard;
