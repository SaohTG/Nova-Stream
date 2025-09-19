import jwt from 'jsonwebtoken';
const ACCESS_TTL = parseInt(process.env.API_JWT_ACCESS_TTL||'900',10);
const REFRESH_TTL = parseInt(process.env.API_JWT_REFRESH_TTL||'1209600',10);
const ACCESS_SECRET = process.env.API_JWT_SECRET || 'dev-secret';
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || 'dev-refresh';
export function signAccess(payload){ return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL }); }
export function signRefresh(payload){ return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL }); }
export function verifyAccess(token){ return jwt.verify(token, ACCESS_SECRET); }
export function verifyRefresh(token){ return jwt.verify(token, REFRESH_SECRET); }
