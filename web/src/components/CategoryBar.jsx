// web/src/components/CategoryBar.jsx
export default function CategoryBar({ categories = [], selected, onSelect }) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
      <button
        onClick={() => onSelect("all")}
        className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
          selected === "all" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
        }`}
      >
        Tout
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
            selected === c.id ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          }`}
          title={c.name}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
