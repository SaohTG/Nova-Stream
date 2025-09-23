// === résoudre un film par TMDB ===
async function findVodByTmdb(userId, tmdbId) {
  const creds = await getCreds(userId);
  if (!creds) throw Object.assign(new Error("no-xtream"), { status: 404 });

  // 1) récupère titre+année TMDB
  const det = await tmdbDetails("movie", Number(tmdbId));
  const wantedTitles = Array.from(new Set([
    det?.title, det?.original_title, det?.original_name
  ].filter(Boolean)));
  const wantedYear = Number((det?.release_date || "").slice(0,4)) || undefined;

  // 2) liste VOD Xtream
  const listUrl = buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_streams");
  const rawList = await fetchJson(listUrl);
  const list = Array.isArray(rawList) ? rawList : (rawList?.movie_list || []);

  // 3) scoring par similarité titre (+ pénalité d’année)
  function scoreCand(name) {
    let s = 0;
    for (const t of wantedTitles) s = Math.max(s, similarity(t, name));
    const y = yearFromStrings(name);
    if (wantedYear && y) s -= Math.min(Math.abs(wantedYear - y) * 0.03, 0.3);
    return s;
  }
  const ranked = list
    .map(x => ({ ...x, _score: scoreCand(x.name || x.title || "") }))
    .sort((a,b) => b._score - a._score)
    .slice(0, 8);

  // 4) vérifie via get_vod_info le tmdb_id source si dispo
  for (const cand of ranked) {
    try {
      const info = await fetchJson(
        buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_info", { vod_id: cand.stream_id })
      );
      const tm = Number(info?.movie_data?.tmdb_id || info?.info?.tmdb_id || 0);
      if (tm && tm === Number(tmdbId)) return { streamId: String(cand.stream_id) };
    } catch {}
  }

  // 5) fallback: prends le meilleur si score OK
  if (ranked[0]?._score >= 0.35) return { streamId: String(ranked[0].stream_id) };
  throw Object.assign(new Error("no-match"), { status: 404 });
}

// Routes TMDB → HLS / file
router.get("/movie/tmdb/:tmdbId/hls.m3u8", async (req, res, next) => {
  try {
    const { streamId } = await findVodByTmdb(req.user?.sub, req.params.tmdbId);
    req.url = `/api/media/movie/${streamId}/hls.m3u8`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});
router.get("/movie/tmdb/:tmdbId/file", async (req, res, next) => {
  try {
    const { streamId } = await findVodByTmdb(req.user?.sub, req.params.tmdbId);
    req.url = `/api/media/movie/${streamId}/file`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});
