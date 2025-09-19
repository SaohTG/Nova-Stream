import { Router } from 'express';
import pool from '../db.js';
import { decrypt, encrypt } from '../crypto.js';

const router = Router();

// middleware to require auth via access token cookie (simple)
router.use((req,res,next)=>{
  const token = req.cookies['access_token'];
  if(!token) return res.status(401).json({error:'unauthorized'});
  // trust API gateway for MVP; client refreshes as needed
  next();
});

router.get('/me', async (req,res,next)=>{
  try {
    // MVP: return basic OK; in prod decode access token
    res.json({ ok:true });
  } catch(e){ next(e); }
});

router.post('/link-xtream', async (req,res,next)=>{
  try {
    const { user_id, host, port, username, password } = req.body;
    if(!user_id || !host || !username || !password) return res.status(400).json({error:'missing fields'});
    const ue = encrypt(username);
    const pe = encrypt(password);
    await pool.query(
      `INSERT INTO xtream_links (user_id,host,port,username_enc,password_enc)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET host=$2, port=$3, username_enc=$4, password_enc=$5, updated_at=now()`,
       [user_id, host, port||null, ue, pe]
    );
    res.json({ ok:true });
  } catch(e){ next(e); }
});

router.get('/xtream-credentials', async (req,res,next)=>{
  try {
    const user_id = req.query.user_id;
    const r = await pool.query('SELECT host,port,username_enc,password_enc FROM xtream_links WHERE user_id=$1',[user_id]);
    if(r.rowCount===0) return res.status(404).json({error:'not linked'});
    const row = r.rows[0];
    res.json({
      host: row.host,
      port: row.port,
      username: decrypt(row.username_enc),
      password: decrypt(row.password_enc)
    });
  } catch(e){ next(e); }
});

export default router;
