// web/src/components/PosterCard.jsx
export default function PosterCard({ item = {}, kind = "vod" }) {
  const title =
    item.title ||
    item.name ||
    item.stream_display_name ||
    "Sans titre";

  // On prend UNIQUEMENT des images Xtream
  const img =
    item.image ||
    item.cover ||
    item.stream_icon ||
    item.stream_logo ||
    null;

  const ratioClass = kind === "live" ? "aspect-video" : "aspect-[2/3]";

  return (
    <div className="group w-full">
      <div
        className={`relative ${ratioClass} overflow-hidden rounded-xl ring-1 ring-white/10 bg-zinc-800`}
      >
        {img ? (
          <img
            src={img}
            alt={title}
            className="block h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-full w-full bg-zinc-700" />
        )}

        {/* Badge rang (tendances) optionnel */}
        {item.rank ? (
          <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white">
            #{item.rank}
          </div>
        ) : null}

        {/* Dégradé bas pour lisibilité, n’affecte pas la hauteur */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      {/* Espace vertical sous l’image */}
      <div className="mt-2 truncate text-sm text-zinc-200">{title}</div>
    </div>
  );
}
