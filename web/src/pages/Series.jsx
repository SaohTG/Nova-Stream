// web/src/pages/Series.jsx
import { useEffect, useState } from "react";
import { getJson, postJson } from "../lib/api";
import Row from "../components/Row.jsx";

function group(items) {
  const m = new Map();
  for (const it of items || []) {
    const id = it.category_id ?? "autres";
    const name = it.category_name ?? "Autres";
    const k = `${id}::${name}`;
    if (!m.has(k)) m.set(k, { id, name, items: [] });
    m.get(k).items.push(it);
  }
  return Array.from(m.values());
}

export default function Series() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        let cats = [];
        try {
          const c = await getJson("/xtream/series-categories");
          if (Array.isArray(c)) cats = c;
        } catch {}

        const list = await postJson("/xtream/series", { limit: 500 });
        const items = Array.isArray(list) ? list : [];

        let grouped;
        if (cats.length) {
          const by = new Map(cats.map(c => [String(c.category_id), { id: c.category_id, name: c.category_name, items: [] }]));
          for (const it of items) {
            const cid = String(it.category_id ?? "");
            const b = by.get(cid) || by.get("0");
            if (b) b.items.push(it);
          }
          grouped = Array.from(by.values()).filter(g => g.items.length);
        } else {
          grouped = group(items);
        }

        if (!alive) return;
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
      <h1 className="mb-4 text-2xl font-bold">Séries</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}
      {!rows ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="text-zinc-400">Aucune série trouvée.</div>
      ) : (
        rows.map((g) => (
          <Row key={`cat-${g.id}`} title={g.name} items={g.items} kind="series" />
        ))
      )}
    </>
  );
}
