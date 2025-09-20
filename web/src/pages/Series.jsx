// web/src/pages/Series.jsx
import { useEffect, useState } from "react";
import { getJson, postJson } from "../lib/api";
import Row from "../components/Row.jsx";

const MAX_CATS = 12;
const PER_CAT  = 20;

export default function Series() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        setRows([]);

        const cats = await getJson("/xtream/series-categories");
        const top = Array.isArray(cats) ? cats.slice(0, MAX_CATS) : [];

        const settled = await Promise.allSettled(
          top.map(async (c) => {
            const list = await postJson("/xtream/series", {
              category_id: c.category_id,
              limit: PER_CAT,
            });
            return {
              id: String(c.category_id),
              name: c.category_name || "Sans catégorie",
              items: Array.isArray(list) ? list : [],
            };
          })
        );

        if (!alive) return;
        const ok = settled
          .filter((s) => s.status === "fulfilled")
          .map((s) => s.value)
          .filter((r) => r.items.length > 0);

        setRows(ok);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Erreur de chargement des séries");
        setRows([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Séries</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}
      {rows === null ? (
        <Row title="Chargement…" loading />
      ) : rows.length === 0 ? (
        <div className="text-zinc-400">Aucune série trouvée.</div>
      ) : (
        rows.map((g) => <Row key={`cat-${g.id}`} title={g.name} items={g.items} kind="series" />)
      )}
    </>
  );
}
