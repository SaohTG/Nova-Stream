# PITCH — Nova Stream (MVP)

## 1. Problème
- Utilisateurs IPTV veulent **une interface moderne, stable et multi‑appareils**, sans config complexe.
- Les apps existantes sont **techniques**, peu élégantes, et ne gèrent pas bien la persistance des comptes.
- Les images/métadonnées varient selon les fournisseurs — besoin d’un **proxy unifié**.

## 2. Solution
- **Nova Stream (SaaS web)** : interface premium type Netflix, **connexion Xtream** simple, **lecture intégrée**, sessions persistantes.
- **Liaison sécurisée** au compte Xtream (chiffrée), **rafraîchissement silencieux**.
- **TMDB** pour enrichir les fiches (review/overview **texte uniquement**).

## 3. Différenciation
- **100% Web** au lancement (pas d’installation), **UI Apple/Netflix-like**.  
- **Sécurité by design** (chiffrement AES‑256‑GCM, JWT httpOnly, rotation refresh).  
- **Respect des assets** : **images depuis Xtream** uniquement (conformité).

## 4. Marché
- IPTV mondial : dizaines de millions d’utilisateurs.  
- Cible MVP : power users & revendeurs cherchant une UX premium **multi‑appareils**.

## 5. Modèle
- **Abonnement SaaS** mensuel/annuel, **essai 7 jours**.  
- Upsell : profils/foyers, stockage cloud des progressions, multi‑playlists.

## 6. Go‑To‑Market
- Intégrations revendeurs Xtream, partenariats communautés tech, influenceurs.  
- SEO/ASO plus tard (apps mobiles).

## 7. Roadmap
- **MVP (ce dépôt)** → **Beta fermée** → **v1** (billing, profils, mobile).

## 8. KPIs
- Activation (liaison Xtream), D1/D7 retention, TTFP/TTI, LCP, playback success rate.

