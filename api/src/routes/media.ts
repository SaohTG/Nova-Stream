// api/src/routes/media.ts
import express, { Request, Response } from "express";
import axios, { AxiosResponse } from "axios";
import jwt from "jsonwebtoken";

const r = express.Router();

/* =========================
   Auth minimal côté API
   ========================= */
function parseCookies(req: Request): Record<string, string> {
  const h = req.headers.cookie;
  if (!h) return {};
  return h.split(";").reduce<Record<string, string>>((a, p) => {
    const [k, v] = p.split("=");
    if (!k) return a;
    a[k.trim()] = decodeURIComponent((v || "").trim());
    return a;
  }, {});
}

function getUserId(req: Request): string | null {
  // 1) si ton middleware met req.user
  // @ts-expect-error
  if (req.user?.id) return String(req.user.id);

  // 2) sinon, vérifie le cookie httpOnly "access"
  const cookies = parseCookies(req);
  const token = cookies["access"];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.API_JWT_SECRET as string) as any;
    return String(payload.sub || payload.userId || payload.id);
  } catch {
    return null;
  }
}

/* =========================
   XTream helpers
   ========================= */
type XtreamCreds = {
  host: string;
  port: number | string;
  username: string;
  password: string;
  https?: boolean;
};

// À implémenter chez toi: récupère les creds de l’utilisateur en DB
async function loadXtreamCreds(userId: string): Promise<XtreamCreds> {
  // @ts-expect-error: ton implémentation existante
  return global.loadXtreamCreds(userId);
}

function buildBase(c: XtreamCreds) {
  const proto = c.https ? "https" : "http";
  return `${proto}://${c.host}:${c.port}`.replace(/\/+$/, "");
}

function candidateUrls(kind: "movie" | "series" | "live", id: string, c: XtreamCreds) {
  const base = buildBase(c);
  if (kind === "live") {
    return [
      `${base}/live/${c.username}/${c.password}/${id}.m3u8`,
      `${base}/live/${c.username}/${c.password}/${id}.ts`,
    ];
  }
  return [
    `${base}/${kind}/${c.username}/${c.password}/${id}.m3u8`,
    `${base}/${kind}/${c.username}/${c.password}/${id}.mp4`,
  ];
}

/* =========================
   Headers HLS
   ========================= */
function setM3U8Headers(res: Response) {
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-store");
}

function setSegmentHeaders(res: Response) {
  res.setHeader("Content-Type", "video/MP2T");
  res.setHeader("Cache-Control", "private, max-age=20, must-revalidate");
  res.setHeader("X-Accel-Buffering", "no");
}

function setFileHeadersByExt(res: Response, url: string) {
  if (url.endsWith(".m3u8")) setM3U8Headers(res);
  else if (url.endsWith(".mp4")) {
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "private, max-age=300");
  } else if (url.endsWith(".ts")) setSegmentHeaders(res);
  res.setHeader("Accept-Ranges", "bytes");
}

/* =========================
   Proxy util
   ========================= */
async function pipe(url: string, res: Response): Promise<void> {
  const upstream: AxiosResponse<any> = await axios.get(url, {
    responseType: "stream",
    timeout: 15000,
    decompress: false,
    // laisse passer 2xx-3xx uniquement
    validateStatus: (s) => s >= 200 && s < 400,
    // ne propage aucun header d’auth côté client
    headers: {},
  });

  const ct = upstream.headers["content-type"];
  if (ct && !res.getHeader("Content-Type")) res.setHeader("Content-Type", ct);

  // stop propre si client ferme
  const onClose = () => {
    try {
      upstream.data?.destroy?.();
    } catch {}
  };
  // @ts-ignore
  res.req?.on?.("close", onClose);
  upstream.data.pipe(res);
}

/* =========================
   Endpoints SÉCURISÉS
   ========================= */

/**
 * Bloqué pour la sécurité: on ne renvoie plus d'URL directe.
 * Garde la route pour compat descendante, mais répond 410.
 */
r.get("/:kind(movie|series|live)/:id/stream-url", (_req, res) => {
  return res.status(410).json({ error: "disabled", reason: "direct-url-disabled" });
});

/**
 * Playlist HLS attendue par ton lecteur:
 * GET /api/media/:kind/:id/hls.m3u8
 */
r.get("/:kind(movie|series|live)/:id/hls.m3u8", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.sendStatus(401);

  try {
    const { kind, id } = req.params as { kind: "movie" | "series" | "live"; id: string };
    const creds = await loadXtreamCreds(userId);
    const urls = candidateUrls(kind, id, creds);

    // on force le premier essai sur .m3u8
    const ordered = urls.sort((a, b) => (a.endsWith(".m3u8") ? -1 : b.endsWith(".m3u8") ? 1 : 0));

    for (const url of ordered) {
      try {
        setFileHeadersByExt(res, url);
        await pipe(url, res);
        return;
      } catch {
        // essaie suivant
      }
    }
    return res.status(502).json({ error: "upstream-failed" });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * Segments TS:
 * GET /api/media/:kind/:id/seg/:name
 * ex: /api/media/movie/640721/seg/00001.ts
 */
r.get("/:kind(movie|series|live)/:id/seg/:name", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.sendStatus(401);

  try {
    const { kind, id, name } = req.params as { kind: "movie" | "series" | "live"; id: string; name: string };
    const creds = await loadXtreamCreds(userId);
    const base = buildBase(creds);

    // chemins segment souvent différents; couvre .ts et .mp4 partiel si besoin
    const tries = [
      `${base}/${kind}/${creds.username}/${creds.password}/${id}/${encodeURIComponent(name)}`,
      `${base}/live/${creds.username}/${creds.password}/${id}/${encodeURIComponent(name)}`,
    ];

    for (const url of tries) {
      try {
        setSegmentHeaders(res);
        await pipe(url, res);
        return;
      } catch {
        // essaie suivant
      }
    }
    return res.status(502).json({ error: "upstream-failed" });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * Ancienne route générique /stream.
 * Conserve mais proxifie sans jamais exposer l’URL.
 */
r.get("/:kind(movie|series|live)/:id/stream", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.sendStatus(401);

  try {
    const { kind, id } = req.params as { kind: "movie" | "series" | "live"; id: string };
    const creds = await loadXtreamCreds(userId);
    const urls = candidateUrls(kind, id, creds);

    for (const url of urls) {
      try {
        setFileHeadersByExt(res, url);
        await pipe(url, res);
        return;
      } catch {
        // essaie suivant
      }
    }
    return res.status(502).json({ error: "upstream-failed" });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

export default r;
