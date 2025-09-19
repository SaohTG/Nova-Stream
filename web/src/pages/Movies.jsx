// web/src/pages/Movies.jsx
import { useEffect, useMemo, useState } from "react";
import { getJson, postJson } from "../lib/api";
import Row from "../components/Row.jsx";

function groupByCategory(items) {
  const map = new Map();
  for (const it of items || []) {
    const id = it.category_id ?? it.category ?? "autres";
    const name = it.category_name ?? it.category_label ?? it.category ?? "Autres";
    const key = `${id}::${name}`;
    if (!map.has(key)) map.set(key, { id, name, items: [] });
    map.get(key).items.push(it);
  }
  return Array.from(map.values());
}

export default function Movies() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);

        // 1) essaie l’endpoint catégories s’il existe
        let categories = [];
        try {
          const c = await getJson("/xtream/movie-categories");
          if (Array.isArray(c)) categories = c;
        } catch { /* ignore */ }

        // 2) récupère les films
        const list = await postJson("/xtream/movies", { limit: 500 }); // assez large pour grouper
        const items = Array.isArray(list) ? list : [];

        let grouped;
        if (categories.length) {
          const byCat = new Map(categories.map(c => [String(c.category_id), { id: c.category_id, name: c.category_name, items: [] }]));
          for (const it of items) {
            const cid = String(it.category_id ?? "");
            const bucket = byCat.get(cid) || byCat.get("0");
            if (bucket) bucket.items.push(it);
          }
          grouped = Array.from(byCat.values()).filter(g => g.items.length);
        } else {
          grouped = groupByCategory(items);
        }

        if (!alive) return;
        // limite le nb de rangées pour la perf
        setRows(grouped.slice(0, 10));
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Erreur de chargement");
        setRows([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Films</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}
      {!rows ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="text-zinc-400">Aucun film trouvé.</div>
      ) : (
        rows.map((g) => (
          <Row key={`cat-${g.id}`} title={g.name} items={g.items} kind="vod" />
        ))
      )}
    </>
  );
}
