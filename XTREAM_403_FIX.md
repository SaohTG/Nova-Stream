# Correction des erreurs 403 Xtream

## Problème identifié

Les erreurs 403 survenaient après 2-3 minutes de connexion sur le site, avec les messages suivants dans les logs :

```
[XTREAM RETRY] Attempt 2/3 failed, retrying in 2000ms: XTREAM_HTTP_403
[XTREAM ERROR] Movie categories fetch failed: XTREAM_HTTP_403
GET /api/xtream/movie-categories 403 3064.825 ms - 65
```

## Causes identifiées

1. **User-Agent suspect** : Le User-Agent "Mozilla/5.0 (NovaStream/1.0)" était facilement détectable et bloqué par les serveurs Xtream
2. **Pas de rotation des User-Agents** : Utilisation du même User-Agent pour toutes les requêtes
3. **Rate limiting non géré** : Pas de délai entre les requêtes, déclenchant des protections anti-DDoS
4. **Retry trop agressif** : 3 tentatives en 2 secondes pouvaient déclencher des blocages
5. **Pas de validation des credentials** : Les credentials expirés n'étaient pas détectés
6. **Headers HTTP insuffisants** : Manque de headers réalistes

## Solutions implémentées

### 1. Rotation des User-Agents
- Ajout de 5 User-Agents réalistes (Chrome, Firefox, différents OS)
- Rotation aléatoire pour chaque requête
- User-Agents mis à jour et réalistes

### 2. Rate Limiting
- Délai minimum de 1 seconde entre les requêtes vers le même serveur Xtream
- Évite le déclenchement des protections anti-DDoS
- Gestion par baseUrl pour éviter les conflits entre utilisateurs

### 3. Headers HTTP améliorés
- Headers plus réalistes : `Accept`, `Accept-Language`, `Accept-Encoding`, `Connection`, `Upgrade-Insecure-Requests`
- Headers cohérents avec un navigateur réel

### 4. Retry logic amélioré
- Délais plus longs : 2s, 4s, 8s (max 10s) au lieu de 1s, 2s, 4s
- Timeout augmenté à 15s au lieu de 12s
- Moins de retries pour les requêtes budget (1 au lieu de 2)

### 5. Validation des credentials
- Cache des credentials valides (5 minutes)
- Validation automatique des credentials avant utilisation
- Invalidation du cache en cas d'erreur 401/403
- Évite les requêtes inutiles avec des credentials expirés

### 6. Gestion d'erreur améliorée
- Invalidation automatique du cache des credentials en cas d'erreur 401/403
- Messages d'erreur plus clairs
- Logs plus détaillés pour le debugging

## Code modifié

### Fichier principal : `api/src/modules/xtream.js`

#### Nouvelles fonctions ajoutées :
- `getRandomUserAgent()` : Rotation des User-Agents
- `rateLimit(baseUrl)` : Rate limiting entre requêtes
- `validateCredentials(creds)` : Validation et cache des credentials

#### Modifications apportées :
- `fetchJson()` : Headers améliorés, rate limiting, délais plus longs
- `getCreds()` : Validation des credentials avant retour
- Tous les handlers : Invalidation du cache en cas d'erreur 401/403

## Tests

Un script de test a été créé pour vérifier :
- ✅ Rotation des User-Agents
- ✅ Rate limiting (1s minimum entre requêtes)
- ✅ Fonctionnement des nouvelles fonctions

## Résultat attendu

Ces améliorations devraient considérablement réduire les erreurs 403 en :
1. Rendant les requêtes moins détectables par les serveurs Xtream
2. Respectant les limitations de taux
3. Gérant mieux les credentials expirés
4. Évitant les patterns de requêtes suspects

## Monitoring

Pour surveiller l'efficacité des corrections :
- Surveiller les logs pour les messages `[XTREAM RATE LIMIT]`
- Vérifier la réduction des erreurs 403 dans les logs
- Monitorer les temps de réponse des requêtes Xtream