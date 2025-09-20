// web/src/pages/SeriesCategory.jsx
import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { postJson } from "../lib/api";
import PosterCard from "../components/PosterCard.jsx";

const CHUNK = 60;

export default function SeriesCategory() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const catName = useMemo(() => sp.get("name") || "Catégorie", [sp]);

  const [limit, setLimit] = useState(CHUNK);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (l) => {
    setBusy(true);
    try {
      const list = await postJson("/xtream/series", {
        category_id: Number(id),
        limit: l,
      });
      setItems(Array.isArray(list) ? list : []);
      setErr(null);
    } catch (e) {
      setErr(e?.message || "Erreur de chargement");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setItems(null);
    setLimit(CHUNK);
    load(CHUNK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onMore = () => {
    const next = limit + CHUNK;
    setLimit(next);
    load(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold text-white">{catName}</h1>
        <div className="text-sm text-zinc-400">{items?.length || 0} éléments</div>
      </div>

      {err && <div className="rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}

      {!items ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="text-zinc-400">Aucune série dans cette catégorie.</div>
      ) : (
        <>
          {/* ↑↑ Espacement augmenté via gap responsive ↑↑ */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 md:gap-6 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 2xl:gap-7">
            {items.map((it) => (
              <div key={`s-${it.series_id || it.name}`} className="min-w-0">
                <PosterCard item={it} kind="series" />
              </div>
            ))}
          </div>

          <div className="flex justify-center pt-2">
            <button
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-60"
              onClick={onMore}
              disabled={busy}
            >
              {busy ? "Chargement…" : "Charger plus"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
