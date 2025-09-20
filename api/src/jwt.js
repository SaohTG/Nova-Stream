import jwt from 'jsonwebtoken';
const ACCESS_TTL = parseInt(process.env.API_JWT_ACCESS_TTL||'900',10);
const REFRESH_TTL = parseInt(process.env.API_JWT_REFRESH_TTL||'1209600',10);
const ACCESS_SECRET = process.env.API_JWT_SECRET || 'Y7dD6Vh2mC4pQ8tR1sX9zK3wL5aN0fB2gU4hJ6iO8lT1qP3dV';
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || 'mZ2xL7nH3qK9tC8vS4pD0rG6yB1wF5aE7uJ9hQ3oN2lM4kR8';
export function signAccess(payload){ return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL }); }
export function signRefresh(payload){ return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL }); }
export function verifyAccess(token){ return jwt.verify(token, ACCESS_SECRET); }
export function verifyRefresh(token){ return jwt.verify(token, REFRESH_SECRET); }
