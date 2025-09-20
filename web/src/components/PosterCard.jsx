// web/src/components/PosterCard.jsx
export default function PosterCard({ item, onClick }) {
  const img =
    item?.image ||
    item?.cover ||
    item?.stream_icon ||
    null;

  return (
    <button
      className="group relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-xl bg-zinc-900 card-hover"
      onClick={onClick}
      title={item?.name || ""}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt={item?.name || ""}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : (
        <div className="flex h-full w-full items-end justify-start bg-gradient-to-b from-zinc-800 to-zinc-900 p-2">
          <div className="line-clamp-2 text-left text-xs text-zinc-300">{item?.name}</div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
    </button>
  );
}
