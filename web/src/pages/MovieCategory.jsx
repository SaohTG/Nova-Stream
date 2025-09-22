// web/src/pages/MovieCategory.jsx
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { postJson } from "../lib/api";
import PosterCard from "../components/PosterCard.jsx";

export default function MovieCategory() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const name = sp.get("name") || "Catégorie";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await postJson("/xtream/movies", {
          category_id: Number(id),
          limit: 200,
        });
        if (!alive) return;
        setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!alive) return;
        setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="py-6">
      <h1 className="mb-4 text-2xl font-bold">{name}</h1>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="skel aspect-[2/3] w-full" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4">
          {items.map((it, i) => (
            <PosterCard key={it.stream_id || it.name || i} item={it} kind="vod" showTitle />
          ))}
        </div>
      ) : (
        <div className="text-zinc-400">Aucun contenu.</div>
      )}
    </div>
  );
}
