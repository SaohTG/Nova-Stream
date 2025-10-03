// web/src/pages/Series.jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import { getJson, postJson } from "../lib/api";
import Row from "../components/Row.jsx";

const CATS_BATCH = 30;  // nb de catégories chargées par “page”
const PER_CAT    = 15;  // nb d’items par rangée

export default function Series() {
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState(null);

  // -------- Reprendre (localStorage) --------
  const resumeItems = useMemo(() => {
    const out = [];
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (!k.startsWith("ns_watch_series:")) continue;
      try {
        const v = JSON.parse(localStorage.getItem(k) || "{}");
        const parts = k.split(":"); // ns_watch_series:<seriesId>:S<X>E<Y>
        const seriesId = parts[1];
        const se = parts[2] || "";
        const m = /^S(\d+)E(\d+)$/i.exec(se);
        if (!seriesId || !m) continue;

        const season = Number(m[1]);
        const episode = Number(m[2]);
        const pos = Number(v.position || 0);
        const dur = Number(v.duration || 0);
        if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur < 60 || pos <= 0) continue;

        // Affichage progression %
        const pct = Math.max(1, Math.min(99, Math.round((pos / Math.max(1, dur)) * 100)));

        out.push({
          // champs utilisés par <Row/>
          id: seriesId,
          name: v.title || `S${season}E${episode}`,
          stream_icon: v.poster || "",

          // meta pour lien reprise
          _resume: {
            seriesId,
            season,
            episode,
            t: Math.floor(pos),
            updatedAt: v.updatedAt || now,
            pct,
          },
        });
      } catch {}
    }
    // les plus récents d’abord
    out.sort((a, b) => (b._resume?.updatedAt || 0) - (a._resume?.updatedAt || 0));
    return out;
  }, []);

  // charge la liste de catégories
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

  // charger le premier batch
  useEffect(() => {
    if (!loadingCats && cats.length > 0 && nextIndex === 0) {
      loadMoreCats();
    }
  }, [loadingCats, cats, nextIndex, loadMoreCats]);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Séries</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}

      {/* Reprendre */}
      {resumeItems.length > 0 && (
        <Row
          title="Reprendre"
          kind="series"
          items={resumeItems.map((it) => {
            const r = it._resume;
            // on fournit un lien direct vers la page Titre avec auto-play et reprise t=<sec>
            return {
              ...it,
              __href: `/title/series/${encodeURIComponent(it.id)}?play=1&season=${r.season}&episode=${r.episode}&t=${r.t}`,
              __badge: `S${r.season}E${r.episode} • ${r.pct}%`,
            };
          })}
        />
      )}

      {/* placeholder pendant le chargement initial */}
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
