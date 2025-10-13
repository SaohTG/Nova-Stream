// web/src/pages/Movies.jsx
import { useEffect, useState, useCallback } from "react";
import { getJson, postJson } from "../lib/api";
import Row from "../components/Row.jsx";

const CATS_BATCH = 30;
const PER_CAT = 15;

/* ==== Helpers ID / Resume ==== */
function getMovieId(it) {
  return String(
    it?.xtream_id ??
    it?.stream_id ??
    it?.movie_id ??
    it?.id ??
    ""
  );
}
function getMovieNumericId(it) {
  const raw =
    it?.stream_id ??
    it?.movie_id ??
    it?.id ??
    it?.xtream_id ??
    null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : -Infinity;
}
function getAddedMs(it) {
  // Xtream renvoie souvent "added" en secondes (string). On normalise en millisecondes.
  let v = it?.added ?? it?.info?.added ?? null;
  if (v == null) return null;
  let n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 1e12) n = n * 1000; // secondes -> ms
  return n;
}

function getResumeForMovie(movieId) {
  if (!movieId) return null;
  try {
    const raw = localStorage.getItem(`ns_watch_movie:${movieId}`);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const dur = Number(j.duration || 0);
    const pos = Number(j.position || 0);
    if (!Number.isFinite(dur) || dur <= 0) return null;
    const pct = pos / dur;
    if (pct < 0.05 || pct > 0.95) return null;
    return {
      position: pos,
      duration: dur,
      pct,
      savedAt: Number(j.savedAt || 0) || 0,
    };
  } catch {
    return null;
  }
}

function decorateItemsWithResume(items) {
  return (Array.isArray(items) ? items : []).map((it) => {
    const xid = getMovieId(it);
    const resume = getResumeForMovie(xid);
    const baseLink = `/title/movie/${encodeURIComponent(xid)}`;
    const linkOverride = resume
      ? `${baseLink}?play=1&t=${Math.floor(resume.position || 0)}`
      : baseLink;
    return {
      ...it,
      __xid: xid,
      __nid: getMovieNumericId(it),
      __addedMs: getAddedMs(it),
      linkOverride,
      progressPct: resume ? Math.min(100, Math.round(resume.pct * 100)) : undefined,
      badgeResume: resume ? "Reprendre" : undefined,
      __resume: resume || undefined,
    };
  });
}

function computeResumeRow(fromGroups) {
  const map = new Map();
  for (const g of fromGroups) {
    for (const it of g.items || []) {
      if (!it.__resume) continue;
      const prev = map.get(it.__xid);
      if (!prev) { map.set(it.__xid, it); continue; }
      const a = prev.__resume, b = it.__resume;
      const aScore = (a.savedAt || 0) || a.pct || 0;
      const bScore = (b.savedAt || 0) || b.pct || 0;
      if (bScore > aScore) map.set(it.__xid, it);
    }
  }
  const list = Array.from(map.values());
  list.sort((a, b) => {
    const as = (a.__resume?.savedAt || 0), bs = (b.__resume?.savedAt || 0);
    if (bs !== as) return bs - as;
    const ap = a.__resume?.pct || 0, bp = b.__resume?.pct || 0;
    return bp - ap;
  });
  return list.slice(0, 20);
}

/* ==== NEW: “Ajoutés récemment” = éléments ajoutés dans les 7 derniers jours ==== */
function computeRecentThisWeek(fromGroups) {
  const oneWeekMs = 7 * 24 * 3600 * 1000;
  const cutoff = Date.now() - oneWeekMs;

  // Dédoublonne par film
  const map = new Map();
  for (const g of fromGroups) {
    for (const it of g.items || []) {
      if (!it.__xid) continue;
      if (!Number.isFinite(it.__addedMs)) continue; // ignore si pas de date
      if (it.__addedMs < cutoff) continue;         // garde seulement la semaine

      const prev = map.get(it.__xid);
      if (!prev || (it.__addedMs > (prev.__addedMs || -Infinity))) {
        map.set(it.__xid, it);
      }
    }
  }

  const list = Array.from(map.values());
  list.sort((a, b) => (b.__addedMs || 0) - (a.__addedMs || 0));

  // Si rien trouvé (pas de champ added côté Xtream), fallback: ID décroissant (au cas où)
  if (list.length === 0) {
    const fallbackMap = new Map();
    for (const g of fromGroups) {
      for (const it of g.items || []) {
        if (!it.__xid) continue;
        const ex = fallbackMap.get(it.__xid);
        if (!ex || (it.__nid ?? -Infinity) > (ex.__nid ?? -Infinity)) {
          fallbackMap.set(it.__xid, it);
        }
      }
    }
    const fb = Array.from(fallbackMap.values());
    fb.sort((a, b) => (b.__nid ?? -Infinity) - (a.__nid ?? -Infinity));
    return fb.slice(0, 20);
  }

  return list.slice(0, 20);
}

/* ==== Page ==== */
export default function Movies() {
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [resumeItems, setResumeItems] = useState([]);
  const [recentItems, setRecentItems] = useState([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState(null);

  // charge la liste de catégories
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        setLoadingCats(true);
        const list = await getJson("/xtream/movie-categories");
        if (!alive) return;
        const safe = Array.isArray(list) ? list : [];
        setCats(safe);
        setRows([]);
        setResumeItems([]);
        setRecentItems([]);
        setNextIndex(0);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Erreur catégories films");
      } finally {
        if (alive) setLoadingCats(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const recomputeSpecialRows = useCallback((groups) => {
    setResumeItems(computeResumeRow(groups));
    setRecentItems(computeRecentThisWeek(groups)); // <= semaine courante via `added`
  }, []);

  const loadMoreCats = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const slice = cats.slice(nextIndex, nextIndex + CATS_BATCH);

    const settled = await Promise.allSettled(
      slice.map(async (c) => {
        const items = await postJson("/xtream/movies", {
          category_id: c.category_id,
          limit: PER_CAT,
        });
        return {
          id: String(c.category_id),
          name: c.category_name || "Sans catégorie",
          items: decorateItemsWithResume(Array.isArray(items) ? items : []),
        };
      })
    );

    const ok = settled
      .filter((s) => s.status === "fulfilled")
      .map((s) => s.value)
      .filter((r) => r.items.length > 0);

    setRows((prev) => {
      const merged = [...prev, ...ok];
      recomputeSpecialRows(merged);
      return merged;
    });
    setNextIndex((i) => i + slice.length);
    setLoadingMore(false);
  }, [cats, nextIndex, loadingMore, recomputeSpecialRows]);

  // charger le premier batch
  useEffect(() => {
    if (!loadingCats && cats.length > 0 && nextIndex === 0) {
      loadMoreCats();
    }
  }, [loadingCats, cats, nextIndex, loadMoreCats]);

  // sync Reprendre si autre onglet met à jour le localStorage
  useEffect(() => {
    const onStorage = (e) => {
      if (!e || typeof e.key !== "string") return;
      if (e.key.startsWith("ns_watch_movie:")) {
        setResumeItems(computeResumeRow(rows));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [rows]);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Films</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}

      {/* Reprendre (tout en haut) */}
      {resumeItems.length > 0 && (
        <Row
          key="resume-row"
          title="Reprendre"
          items={resumeItems}
          kind="vod"
          itemLinkKey="linkOverride"
          itemProgressKey="progressPct"
          itemBadgeKey="badgeResume"
        />
      )}

      {/* Ajoutés récemment (semaine) */}
      {recentItems.length > 0 && (
        <Row
          key="recent-row"
          title="Ajoutés récemment"
          items={recentItems}
          kind="vod"
          itemLinkKey="linkOverride"
          itemProgressKey="progressPct"
          itemBadgeKey="badgeResume"
        />
      )}

      {rows.length === 0 && (loadingCats || loadingMore) && (
        <Row title="Chargement…" loading />
      )}

      {rows.map((g) => (
        <Row
          key={`cat-${g.id}`}
          title={g.name}
          items={g.items}
          kind="vod"
          seeMoreHref={`/movies/category/${g.id}?name=${encodeURIComponent(g.name)}`}
          itemLinkKey="linkOverride"
          itemProgressKey="progressPct"
          itemBadgeKey="badgeResume"
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
