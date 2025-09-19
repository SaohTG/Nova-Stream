// web/src/pages/Live.jsx
import { useEffect, useState } from "react";
import CategoryBar from "../components/CategoryBar.jsx";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://85.31.239.110:4000").replace(/\/+$/, "");

export default function Live() {
  const [cats, setCats] = useState([]);
  const [catSel, setCatSel] = useState("all");
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/xtream/categories/live`, { credentials: "include" });
        const data = await r.json().catch(() => []);
        if (alive) setCats(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setCats([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const body = { page: 1, limit: 60 };
        if (catSel !== "all") body.category_id = catSel;
        const r = await fetch(`${API_BASE}/xtream/live`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        if (alive) setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        if (alive) setErr(e?.message || "Erreur");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [catSel]);

  return (
    <section className="mx-auto max-w-6xl">
      <h1 className="mb-2 text-2xl font-semibold">TV en direct</h1>
      <CategoryBar categories={cats} selected={catSel} onSelect={setCatSel} />

      {loading && <div className="text-zinc-400">Chargement…</div>}
      {err && <div className="rounded-lg bg-rose-900/40 p-3 text-rose-200">{err}</div>}

      {!loading && !err && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
          {items?.map((ch) => (
            <article key={ch.stream_id} className="group rounded-xl bg-zinc-900/60 p-2 ring-1 ring-white/10" title={ch.name}>
              <div className="aspect-video overflow-hidden rounded-lg bg-zinc-800">
                {ch.logo ? (
                  <img
                    src={ch.logo}
                    alt={ch.name}
                    className="h-full w-full object-contain p-4 transition group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-500">logo indisponible</div>
                )}
              </div>
              <div className="mt-2 truncate text-sm">{ch.name}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
