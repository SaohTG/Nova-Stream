# Nova Stream — MVP (SaaS Web Only)

**Version:** 0.1.0 (MVP)  
**Stack:** React + Vite + Tailwind (Web), Node.js (Express/NestJS-style modular API), PostgreSQL, JWT (access/refresh), Docker/Portainer

## 🎯 Objectif
Plateforme **SaaS web** type Netflix/Apple TV+ pour lire des contenus **Xtream** (VOD, Séries, Live) avec :  
- Auth Nova obligatoire (signup/login) **avant accès au contenu**.  
- Liaison **persistante** du compte **Xtream** (chiffrée côté serveur).  
- **Images/affiches :** **provenant exclusivement du serveur Xtream** du client.  
- Détail contenu (review/overview uniquement via **TMDB**) + **lecteur intégré** (HLS/DASH/MP4 selon Xtream).

⚠️ **TMDB est utilisé strictement pour la _review/overview_ (texte). Les images viennent du Xtream du client.**

---

## 🚀 Lancement rapide

### 1) Local (Docker)
```bash
cp .env.example .env
# Éditez .env (voir variables)
docker compose up -d --build
```

- Web: http://localhost:5173  
- API: http://localhost:4000  
- Postgres: localhost:5432

### 2) Portainer (Stack)
1. Allez dans **Add Stack**.  
2. Collez le contenu de `stack.yml`.  
3. Définissez les variables d’environnement (onglet **Environment** si nécessaire).  
4. **Deploy the stack**.

---

## 🔐 Auth & Sessions
- **JWT access** (court) en **cookie HTTP-only** + **refresh token** (long) en cookie HTTP-only.  
- Rotation sécurisée des refresh tokens.  
- Multi-appareils supporté.  
- Rate limiting, CORS strict.

## 🔗 Liaison Xtream
- Saisie `host`, `port`, `username`, `password`.  
- Test de connexion côté serveur.  
- Stockage **chiffré** (AES-256-GCM) en base.  
- **Rafraîchissement silencieux** des sessions Xtream lors des visites ultérieures.

## 🖼️ Images & Player
- **Images** directement via les URL Xtream (`stream_icon`, `movie_image`, `series_image`, etc.).  
- **Player intégré** (HTML5 vidéo). **HLS** auto-géré via `hls.js` si nécessaire.

## 📄 Documents
- `docs/PITCH.md` — Pitch investisseur (slides en Markdown).
- `docs/TECH_DOC.md` — Documentation technique (schéma DB, endpoints, sécurité, lecteur).
- `docs/PLAN.md` — Plan de développement (MVP → Beta → v1) avec risques.

---

## 🧩 Structure
```
/api               # API Node (Express style, modulaire "Nest-like")
/web               # Frontend React + Vite + Tailwind
/docs              # Pitch, Doc technique, Plan
docker-compose.yml
stack.yml          # Portainer
.env.example
```

---

## 🔑 Variables (.env)
```ini
# Postgres
POSTGRES_USER=nova
POSTGRES_PASSWORD=changeme
POSTGRES_DB=novastream
POSTGRES_PORT=5432

# API
API_PORT=4000
API_JWT_ACCESS_TTL=900           # 15m
API_JWT_REFRESH_TTL=1209600      # 14d
API_JWT_SECRET=Y7dD6Vh2mC4pQ8tR1sX9zK3wL5aN0fB2gU4hJ6iO8lT1qP3dV
API_REFRESH_SECRET=mZ2xL7nH3qK9tC8vS4pD0rG6yB1wF5aE7uJ9hQ3oN2lM4kR8
API_ENCRYPTION_KEY=a1b2c3d4e5f60718293a4bc5de6f70819a2b3c4d5e6f7a801f2e3d4c9b8a7c6d
CORS_ORIGIN=http:/85.31.239.110:5173

# TMDB
TMDB_API_KEY=d8175301037c00f3c719478998396539

# Node environment
NODE_ENV=development
```

---

## 🧪 Comptes de test
- Créez un compte Nova via la page **/login** (inscription).  
- Liez votre compte **Xtream** dans **Paramètres**.  
- Accédez ensuite à **Films / Séries / TV**.

---

## 🧰 Commandes utiles
**Web (dev sans Docker)**  
```bash
cd web
npm i
npm run dev
```

**API (dev sans Docker)**  
```bash
cd api
npm i
npm run dev
```

---

## 📜 Licence
MVP d'exemple — usage interne/démonstration.
