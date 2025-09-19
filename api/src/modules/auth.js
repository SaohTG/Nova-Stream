import { Router } from 'express';
import pool from '../db.js';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { signAccess, signRefresh, verifyRefresh } from '../jwt.js';

const router = Router();

function setTokens(res, user){
  const access = signAccess({ uid: user.id, email: user.email });
  const refresh = signRefresh({ uid: user.id });
  res.cookie('access_token', access, { httpOnly: true, sameSite: 'lax' });
  res.cookie('refresh_token', refresh, { httpOnly: true, sameSite: 'lax' });
  return { access, refresh };
}

router.post('/signup', async (req,res,next)=>{
  try {
    const { email, password } = req.body;
    if(!email || !password) return res.status(400).json({error:'email/password required'});
    const hash = await bcrypt.hash(password, 10);
    const id = uuid();
    await pool.query('INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3)', [id,email,hash]);
    const { access, refresh } = setTokens(res, { id, email });
    await pool.query('INSERT INTO sessions (id,user_id,refresh_token) VALUES ($1,$2,$3)', [uuid(), id, refresh]);
    res.json({ ok:true });
  } catch(e) { next(e); }
});

router.post('/login', async (req,res,next)=>{
  try {
    const { email, password } = req.body;
    const r = await pool.query('SELECT id,password_hash FROM users WHERE email=$1', [email]);
    if(r.rowCount===0) return res.status(401).json({error:'invalid credentials'});
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(401).json({error:'invalid credentials'});
    const { access, refresh } = setTokens(res, { id: user.id, email });
    await pool.query('INSERT INTO sessions (id,user_id,refresh_token) VALUES ($1,$2,$3)', [uuid(), user.id, refresh]);
    res.json({ ok:true });
  } catch(e) { next(e); }
});

router.post('/refresh', async (req,res,next)=>{
  try {
    const token = req.cookies['refresh_token'];
    if(!token) return res.status(401).json({error:'missing refresh'});
    const payload = verifyRefresh(token);
    // rotate
    const { rows } = await pool.query('SELECT user_id FROM sessions WHERE refresh_token=$1', [token]);
    if(rows.length===0) return res.status(401).json({error:'session revoked'});
    const user_id = rows[0].user_id;
    const { rows: ur } = await pool.query('SELECT email FROM users WHERE id=$1',[user_id]);
    const email = ur[0].email;
    // set new tokens
    const access = signAccess({ uid: user_id, email });
    const refresh = signRefresh({ uid: user_id });
    res.cookie('access_token', access, { httpOnly:true, sameSite:'lax' });
    res.cookie('refresh_token', refresh, { httpOnly:true, sameSite:'lax' });
    await pool.query('UPDATE sessions SET refresh_token=$1 WHERE refresh_token=$2', [refresh, token]);
    res.json({ ok:true });
  } catch(e) { next(e); }
});

router.post('/logout', async (req,res,next)=>{
  try {
    const token = req.cookies['refresh_token'];
    if(token){
      await pool.query('DELETE FROM sessions WHERE refresh_token=$1', [token]);
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ ok:true });
  } catch(e){ next(e); }
});

export default router;
