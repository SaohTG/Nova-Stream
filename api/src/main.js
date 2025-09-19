import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pool from './db.js';
import fs from 'fs';
import path from 'path';
import authRouter from './modules/auth.js';
import xtreamRouter from './modules/xtream.js';
import tmdbRouter from './modules/tmdb.js';
import userRouter from './modules/user.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// init DB schema
const schemaSql = fs.readFileSync(path.join(process.cwd(), 'src/schema.sql'), 'utf8');
pool.query(schemaSql).catch(err => { console.error('Schema init error', err); process.exit(1); });

app.get('/health', (_req,res)=>res.json({ok:true}));

app.use('/auth', authRouter);
app.use('/xtream', xtreamRouter);
app.use('/tmdb', tmdbRouter);
app.use('/user', userRouter);

// error handler
app.use((err, _req, res, _next)=>{
  console.error(err);
  res.status(err.status||500).json({error: err.message||'Internal error'});
});

const port = process.env.API_PORT || 4000;
app.listen(port, ()=>console.log('API on :' + port));
