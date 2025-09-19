# Documentation technique — Nova Stream (MVP)

## Stack
- **Web**: React + Vite + Tailwind (dark, responsive, skeletons, micro‑interactions).
- **API**: Node.js (Express, architecture modulaire style Nest).  
- **DB**: PostgreSQL.  
- **Auth**: JWT httpOnly (access+refresh), rotation, CORS strict.  
- **Player**: HTML5 + `hls.js` si `.m3u8`.

## Schéma DB (résumé)
- `users(id, email, password_hash, created_at)`  
- `sessions(id, user_id, refresh_token, device, created_at)`  
- `xtream_links(user_id, host, port, username_enc, password_enc, created_at, updated_at)`  
- `watchlist(user_id, content_id, content_type)`  
- `progress(user_id, content_id, position_seconds, duration_seconds, updated_at)`

## Sécurité
- Cookies **HTTP-only** pour tokens.  
- **CORS** strict (`CORS_ORIGIN`).  
- **Chiffrement AES‑256‑GCM** des identifiants Xtream au repos (`API_ENCRYPTION_KEY`).  
- **Rate limiting** (ajoutable via middleware, non inclus par défaut pour simplicité MVP).  
- Validation: basique côté API + validations UI.

## Endpoints (OpenAPI esquisse)
- `POST /auth/signup` — créer un compte Nova.  
- `POST /auth/login` — se connecter.  
- `POST /auth/refresh` — rafraîchir les tokens (rotation).  
- `POST /auth/logout` — se déconnecter.

- `POST /xtream/test` — tester l’accès Xtream.  
- `POST /xtream/movies` — liste VOD.  
- `POST /xtream/series` — liste séries.  
- `POST /xtream/live` — liste live.  
- `POST /xtream/series-info` — détail saisons/épisodes.  
- `POST /xtream/vod-info` — détail VOD.  
- `POST /xtream/stream-url` — url de stream pour le player.

- `POST /user/link-xtream` — lier & chiffrer les identifiants Xtream.  
- `GET /user/xtream-credentials?user_id=` — récupérer (déchiffré) pour le client.

- `GET /tmdb/search?q=&type=&language=` — proxy recherche (serveur).  
- `GET /tmdb/detail?id=&type=&language=` — proxy détail (overview uniquement).

## Flux clés
### Auth
1. `signup/login` → cookies `access_token` + `refresh_token`.  
2. À l’expiration : `POST /auth/refresh` (rotation).

### Onboarding
1. Login → Wizard Xtream → `xtream/test` (feedback).  
2. Si OK → `user/link-xtream` (chiffré) → accès contenu.

### EPG / Live
- Endpoints Xtream `get_live_streams` (+ EPG ultérieur via `get_simple_data_table`).

## Lecteur
- Si URL se termine en `.m3u8` → `hls.js`; sinon `<video src>` direct.  
- Contrôles natifs (play/pause/seek/volume/fullscreen).

