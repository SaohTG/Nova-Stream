// web/src/pages/Series.jsx
import { useEffect, useState, useCallback } from "react";
import { getJson, postJson } from "../lib/api";
import Row from "../components/Row.jsx";

const CATS_BATCH = 30;
const PER_CAT    = 15;

export default function Series() {
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        setLoadingCats(true);
        const list = await getJson("/xtream/series-categories");
        if (!alive) return;
        const safe = Array.isArray(list) ? list : [];
        setCats(safe);
        setRows([]);
        setNextIndex(0);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Erreur catégories séries");
      } finally {
        if (alive) setLoadingCats(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadMoreCats = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const slice = cats.slice(nextIndex, nextIndex + CATS_BATCH);

    const settled = await Promise.allSettled(
      slice.map(async (c) => {
        const items = await postJson("/xtream/series", {
          category_id: c.category_id,
          limit: PER_CAT,
        });
        return {
          id: String(c.category_id),
          name: c.category_name || "Sans catégorie",
          items: Array.isArray(items) ? items : [],
        };
      })
    );

    const ok = settled
      .filter((s) => s.status === "fulfilled")
      .map((s) => s.value)
      .filter((r) => r.items.length > 0);

    setRows((prev) => [...prev, ...ok]);
    setNextIndex((i) => i + slice.length);
    setLoadingMore(false);
  }, [cats, nextIndex, loadingMore]);

  useEffect(() => {
    if (!loadingCats && cats.length > 0 && nextIndex === 0) {
      loadMoreCats();
    }
  }, [loadingCats, cats, nextIndex, loadMoreCats]);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Séries</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}

      {rows.length === 0 && (loadingCats || loadingMore) && (
        <Row title="Chargement…" loading />
      )}

      {rows.map((g) => (
        <Row
          key={`cat-${g.id}`}
          title={g.name}
          items={g.items}
          kind="series"
          seeMoreHref={`/series/category/${g.id}?name=${encodeURIComponent(g.name)}`}
        />
      ))}

      {nextIndex < cats.length && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={loadMoreCats}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700"
            disabled={loadingMore}
          >
            {loadingMore ? "Chargement…" : "Voir plus de catégories"}
          </button>
        </div>
      )}
    </>
  );
}
