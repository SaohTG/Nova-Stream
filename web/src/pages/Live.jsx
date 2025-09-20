// web/src/pages/Live.jsx
import { useEffect, useState } from "react";
import { postJson } from "../lib/api";
import Row from "../components/Row.jsx";

function groupByCatName(items) {
  const m = new Map();
  for (const it of items || []) {
    const id = String(it.category_id ?? "0");
    const name = it.category_name || "Autres";
    const k = `${id}::${name}`;
    if (!m.has(k)) m.set(k, { id, name, items: [] });
    m.get(k).items.push(it);
  }
  return Array.from(m.values());
}

export default function Live() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        const list = await postJson("/xtream/live", { limit: 1200 }); // enrichi avec category_name
        const grouped = groupByCatName(Array.isArray(list) ? list : []);
        if (!alive) return;
        setRows(grouped.slice(0, 14));
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
      <h1 className="mb-4 text-2xl font-bold">TV en direct</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}
      {!rows ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="text-zinc-400">Aucune chaîne trouvée.</div>
      ) : (
        rows.map((g) => <Row key={`cat-${g.id}`} title={g.name} items={g.items} kind="live" />)
      )}
    </>
  );
}
