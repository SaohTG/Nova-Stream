import { Router } from 'express';
import axios from 'axios';

const router = Router();
const TMDB_API_KEY = process.env.TMDB_API_KEY;

router.get('/search', async (req,res,next)=>{
  try {
    const { q, type='movie', language='fr-FR' } = req.query;
    const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&language=${language}&query=${encodeURIComponent(q||'')}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch(e){ next(e); }
});

router.get('/detail', async (req,res,next)=>{
  try {
    const { id, type='movie', language='fr-FR' } = req.query;
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=${language}`;
    const { data } = await axios.get(url);
    // Only send text fields relevant to overview
    res.json({ id: data.id, title: data.title || data.name, overview: data.overview });
  } catch(e){ next(e); }
});

export default router;
