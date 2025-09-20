// web/src/components/PosterCard.jsx
export default function PosterCard({ item, kind = "vod", onClick }) {
  const img = item?.image || item?.cover || item?.stream_icon || null;
  const isLive = kind === "live";

  const containerCls = isLive
    ? "group relative aspect-[16/9] w-[12rem] shrink-0 overflow-hidden rounded-xl bg-zinc-900/80 ring-1 ring-white/5 card-hover"
    : "group relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-xl bg-zinc-900/80 ring-1 ring-white/5 card-hover";

  const imgCls = isLive
    ? "h-full w-full object-contain p-3 transition-transform duration-200 group-hover:scale-105"
    : "h-full w-full object-cover transition-transform duration-200 group-hover:scale-105";

  return (
    <button className={containerCls} onClick={onClick} title={item?.name || ""}>
      {img ? (
        // eslint-disable-next-line jsx-a11y/img-redundant-alt
        <img
          src={img}
          alt={item?.name || "image"}
          className={imgCls}
          onError={(e) => {
            // si l'image échoue, on cache et on affiche le fallback texte
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="flex h-full w-full items-end justify-start bg-gradient-to-b from-zinc-800 to-zinc-900 p-2">
          <div className="line-clamp-2 text-left text-xs text-zinc-300">{item?.name}</div>
        </div>
      )}

      {!isLive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
      )}
    </button>
  );
}
