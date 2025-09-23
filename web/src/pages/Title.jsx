// web/src/pages/Title.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getJson } from "../lib/api";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

export default function Title() {
  const { kind, id } = useParams(); // "movie" | "series" ; id = TMDB id côté app
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // lecture in-page
  const [playing, setPlaying] = useState(false);
  const [resolvingSrc, setResolvingSrc] = useState(false);
  const [src, setSrc] = useState("");
  const [playErr, setPlayErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = kind === "series" ? `/media/${kind}/${id}?refresh=1` : `/media/${kind}/${id}`;
        const j = await getJson(url);
        if (alive) setData(j);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, id]);

  useEffect(() => {
    setPlaying(false);
    setResolvingSrc(false);
    setSrc("");
    setPlayErr("");
  }, [kind, id]);

  // --------- helpers Xtream ----------
  const stripBase = (raw) =>
    (raw || "")
      .replace(/\/player_api\.php.*$/i, "")
      .replace(/\/portal\.php.*$/i, "")
      .replace(/\/stalker_portal.*$/i, "")
      .replace(/\/(?:series|movie|live)\/.*$/i, "")
      .replace(/\/+$/g, "");

  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  async function resolveFromXtreamAccount() {
    if (kind !== "movie") return "";
    // 1) récupère les creds Xtream
    const st = await getJson("/xtream/status").catch(() => null);
    if (!st?.linked) return "";

    const base = stripBase(st.base_url || st.portal_url || st.url || st.server || st.api_url || "");
    const user = st.username || st.user || st.login;
    const pass = st.password || st.pass || st.pwd;
    if (!base || !user || !pass) return "";

    const api = `${base}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;

    // 2) récupère la liste des VOD
    let rows = [];
    try {
      const res = await fetch(`${api}&action=get_vod_streams`, { mode: "cors" });
      rows = (await res.json()) || [];
    } catch (e) {
      // Portail sans CORS → côté serveur, prévoir un proxy /xtream/proxy
      return "";
    }
    if (!Array.isArray(rows) || rows.length === 0) return "";

    // 3) match par tmdb_id puis par titre+année
    const tmdbId = String(data?.tmdb_id || id || "").trim();
    let hit =
      rows.find((r) => String(r.tmdb_id || "").trim() === tmdbId) ||
      (() => {
        const wantTitle = norm(data?.title);
        const wantYear =
          (data?.release_date && String(data.release_date).slice(0, 4)) ||
          String(data?.year || "");
        // filtre titres identiques
        let cands = rows.filter((r) => norm(r.name) === wantTitle);
        // si possible, garde même année
        if (wantYear) {
          const yCands = cands.filter((r) => String(r.year || "") === String(wantYear));
          if (yCands.length) cands = yCands;
        }
        return cands[0];
      })();

    if (!hit?.stream_id) return "";

    // 4) construit l’URL HLS (forcée en .m3u8)
    return `${base}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${hit.stream_id}.m3u8`;
  }

  async function startPlayback() {
    if (kind !== "movie") return;
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");

    try {
      // Toujours prioriser Xtream (compte utilisateur)
      const u = await resolveFromXtreamAccount();
      if (!u) throw new Error("no-src");
      setSrc(u);
    } catch (e) {
      setPlayErr(
        "Impossible d’obtenir l’URL du flux via votre compte Xtream. Vérifiez le lien Xtream et, si besoin, activez un proxy côté serveur pour contourner CORS."
      );
    } finally {
      setResolvingSrc(false);
    }
  }

  // ---------- UI ----------
  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">Chargement…</div>;
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-4xl p-4 text-center text-zinc-300">
        Aucune donnée.
        <div className="mt-4">
          <button className="btn" onClick={() => nav(-1)}>Retour</button>
        </div>
      </div>
    );
  }

  const posterSrc = data.poster_url || data.backdrop_url || "";
  const hasTrailer = Boolean(data?.trailer?.embed_url);
  const resumeKey = kind === "movie" ? `movie:${id}` : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Lecteur in-page */}
      {playing && (
        <div className="mb-6 w-full overflow-hidden rounded-xl bg-black aspect-video">
          {resolvingSrc && (
            <div className="flex h-full w-full items-center justify-center text-zinc-300">
              Préparation du flux…
            </div>
          )}
          {!resolvingSrc && src && (
            <VideoPlayer
              src={src}
              poster={posterSrc}
              title={data.title}
              resumeKey={resumeKey}
              resumeApi
            />
          )}
          {!resolvingSrc && !src && playErr && (
            <div className="flex h-full w-full items-center justify-center p-4 text-center text-red-300">
              {playErr}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
        {/* Jaquette + overlay Play */}
        <button
          type="button"
          className="relative w-[220px] rounded-xl overflow-hidden group"
          onClick={startPlayback}
          disabled={kind !== "movie"}
          title={kind === "movie" ? "Regarder" : "Lecture non disponible ici"}
        >
          <img
            src={posterSrc}
            alt={data.title || ""}
            className="w-[220px] h-full object-cover"
            draggable={false}
          />
          {kind === "movie" && (
            <div className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/40 transition">
              <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-black text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Regarder
              </div>
            </div>
          )}
        </button>

        <div>
          <h1 className="text-2xl font-bold">{data.title}</h1>
          {data.vote_average != null && (
            <div className="mt-1 text-sm text-zinc-300">
              Note TMDB&nbsp;: {Number(data.vote_average).toFixed(1)}/10
            </div>
          )}
          {data.overview && (
            <p className="mt-4 leading-relaxed text-zinc-200">{data.overview}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {kind === "movie" && (
              <button
                className="btn bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={startPlayback}
              >
                ▶ Regarder
              </button>
            )}
            <button
              className="btn disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => hasTrailer && window.open(data?.trailer?.url, "_blank")}
              disabled={!hasTrailer}
            >
              ▶ Bande-annonce
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
