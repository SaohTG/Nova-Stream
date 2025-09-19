# Plan de Développement — MVP → Beta → v1

## MVP (ce dépôt)
- Auth Nova (signup/login/refresh/logout).
- Liaison Xtream chiffrée + test connexion.
- Catalogue films (VOD), détail + review TMDB (texte), **images Xtream** only.
- Lecteur intégré, page Accueil, Ma Liste (structure table), progression (structure table).
- Docker Compose + Portainer stack + README.

**Critères d’acceptation**
- Auth avant contenu. Wizard Xtream opérationnel.
- Détail affiche review TMDB. Bouton **Regarder** lit le flux Xtream.
- Déploiement Portainer via `stack.yml` OK. Démarrage local OK.

## Beta
- Séries (saisons/épisodes), Live + EPG de base.
- Watchlist + Progression persistée.
- Rate limiting + validation avancée + audit logs.
- UI polish (skeletons, “Continuer à regarder”).

## v1
- Billing (Stripe), profils multi‑utilisateurs, gestion des appareils/session. 
- Mobile apps (React Native) en complément.
- Analytics playback & QoS, CDN config.
