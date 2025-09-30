// web/src/pages/Movies.jsx
import { useEffect, useState, useCallback } from "react";
import { getJson, postJson } from "../lib/api";
import Row from "../components/Row.jsx";

const CATS_BATCH = 30;  // nb de catégories chargées par “page”
const PER_CAT    = 15;  // nb d’items par rangée

function getMovieId(it) {
  // essaie plusieurs clés possibles
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
    if (pct < 0.05 || pct > 0.95) return null; // trop peu ou quasi fini
    return { position: pos, duration: dur, pct };
  } catch {
    return null;
  }
}

function decorateItemsWithResume(items) {
  return (Array.isArray(items) ? items : []).map((it) => {
    const xid = getMovieId(it);
    const resume = getResumeForMovie(xid);
    // lien par défaut → fiche film
    const baseLink = `/title/movie/${encodeURIComponent(xid)}`;
    // si reprise, on force la fiche avec auto-lecture
    const linkOverride = resume ? `${baseLink}?play=1` : baseLink;
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

export default function Movies() {
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
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
      <h1 className="mb-4 text-2xl font-bold">Films</h1>
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}

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
          // Ces props sont optionnelles. Si votre Row les gère, il affichera la reprise.
          // Sinon, il utilisera au moins items[].linkOverride pour le clic.
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
