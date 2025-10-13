// web/src/pages/Movies.jsx
import { useEffect, useState, useCallback } from "react";
import { getJson, postJson } from "../lib/api";
import Row from "../components/Row.jsx";

const CATS_BATCH = 30;
const PER_CAT = 15;
const RECENT_MAX = 24;

function getMovieId(it) {
  return String(
    it?.xtream_id ??
    it?.stream_id ??
    it?.movie_id ??
    it?.id ??
    ""
  );
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

// helpers “Ajoutés récemment”
function addedValue(x) {
  const v = x?.added;
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const d = Date.parse(String(v));
  return Number.isFinite(d) ? Math.floor(d / 1000) : 0;
}
function sortByAddedDesc(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => addedValue(b) - addedValue(a));
}

export default function Movies() {
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [resumeItems, setResumeItems] = useState([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState(null);

  // Ajoutés récemment
  const [recent, setRecent] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

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

  // charger “Ajoutés récemment”
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingRecent(true);
        // Essai: tri côté serveur
        let items = await postJson("/xtream/movies", { limit: RECENT_MAX, sort: "added_desc" }).catch(() => null);
        if (!Array.isArray(items) || items.length === 0) {
          // Repli: gros lot + tri local
          const bulk = await postJson("/xtream/movies", { limit: 200 }).catch(() => []);
          items = sortByAddedDesc(bulk).slice(0, RECENT_MAX);
        }
        if (!alive) return;
        setRecent(decorateItemsWithResume(items));
      } finally {
        if (alive) setLoadingRecent(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const recomputeResume = useCallback((groups) => {
    setResumeItems(computeResumeRow(groups));
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
      recomputeResume(merged);
      return merged;
    });
    setNextIndex((i) => i + slice.length);
    setLoadingMore(false);
  }, [cats, nextIndex, loadingMore, recomputeResume]);

  useEffect(() => {
    if (!loadingCats && cats.length > 0 && nextIndex === 0) {
      loadMoreCats();
    }
  }, [loadingCats, cats, nextIndex, loadMoreCats]);

  useEffect(() => {
    const onStorage = (e) => {
      if (!e || typeof e.key !== "string") return;
      if (e.key.startsWith("ns_watch_movie:")) {
        // refresh “reprendre” + “ajoutés récemment” (mise à jour badge/progress)
        setResumeItems(computeResumeRow(rows));
        setRecent((prev) => decorateItemsWithResume(prev));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [rows]);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Films</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}

      {/* Ajoutés récemment */}
      {(loadingRecent && recent.length === 0) ? (
        <Row title="Ajoutés récemment" loading />
      ) : recent.length > 0 ? (
        <Row
          title="Ajoutés récemment"
          items={recent}
          kind="vod"
          itemLinkKey="linkOverride"
          itemProgressKey="progressPct"
          itemBadgeKey="badgeResume"
        />
      ) : null}

      {/* Reprendre */}
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

      {/* Catégories */}
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
