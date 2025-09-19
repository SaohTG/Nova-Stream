import { Router } from 'express';
import axios from 'axios';

const router = Router();

function baseUrl({host, port}){
  // Allow host with or without scheme; normalize
  const h = host.startsWith('http') ? host : `http://${host}`;
  const p = port ? `:${port}` : '';
  return `${h}${p}`;
}

// Test connection
router.post('/test', async (req,res,next)=>{
  try {
    const { host, port, username, password } = req.body;
    const url = `${baseUrl({host,port})}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if(data && data.user_info && data.user_info.auth === 1){
      return res.json({ ok:true, info: data.user_info });
    }
    res.status(401).json({ ok:false, info: data && data.user_info });
  } catch(e){ next(e); }
});

// VOD list (movies)
router.post('/movies', async (req,res,next)=>{
  try {
    const { host, port, username, password } = req.body;
    const url = `${baseUrl({host,port})}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_vod_streams`;
    const { data } = await axios.get(url);
    res.json(data || []);
  } catch(e){ next(e); }
});

// Series list
router.post('/series', async (req,res,next)=>{
  try {
    const { host, port, username, password } = req.body;
    const url = `${baseUrl({host,port})}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series`;
    const { data } = await axios.get(url);
    res.json(data || []);
  } catch(e){ next(e); }
});

// Live
router.post('/live', async (req,res,next)=>{
  try {
    const { host, port, username, password } = req.body;
    const url = `${baseUrl({host,port})}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`;
    const { data } = await axios.get(url);
    res.json(data || []);
  } catch(e){ next(e); }
});

// Series info (seasons & episodes)
router.post('/series-info', async (req,res,next)=>{
  try {
    const { host, port, series_id } = req.body;
    const url = `${baseUrl({host,port})}/player_api.php?action=get_series_info&series_id=${encodeURIComponent(series_id)}`;
    const { data } = await axios.get(url);
    res.json(data || {});
  } catch(e){ next(e); }
});

// VOD info (movie details, including images from Xtream only)
router.post('/vod-info', async (req,res,next)=>{
  try {
    const { host, port, vod_id } = req.body;
    const url = `${baseUrl({host,port})}/player_api.php?action=get_vod_info&vod_id=${encodeURIComponent(vod_id)}`;
    const { data } = await axios.get(url);
    res.json(data || {});
  } catch(e){ next(e); }
});

// Build stream URL for playback (movie/series/live)
router.post('/stream-url', async (req,res,next)=>{
  try {
    const { host, port, username, password, stream_id, ext='m3u8' } = req.body;
    const base = baseUrl({host,port});
    const url = `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(stream_id)}.${ext}`;
    res.json({ url });
  } catch(e){ next(e); }
});

export default router;
