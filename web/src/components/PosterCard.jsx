// web/src/components/PosterCard.jsx
export default function PosterCard({ item, aspect = "2/3" }) {
  const img = item.poster || item.logo || null;
  return (
    <article className="group rounded-xl bg-zinc-900/60 p-2 ring-1 ring-white/10">
      <div className={`relative overflow-hidden rounded-lg bg-zinc-800 aspect-[${aspect}]`}>
        {img ? (
          <img
            src={img}
            alt={item.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500 text-xs">image indisponible</div>
        )}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
          <div className="w-full p-2">
            <div className="truncate text-xs text-white/90">{item.name}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
