// Cache côté client pour éviter les requêtes répétées
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }
  
  console.log('[CLIENT CACHE] Hit:', key);
  return entry.data;
}

export function setCached(key, data) {
  // Limiter la taille du cache
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
  console.log('[CLIENT CACHE] Stored:', key);
}

export function clearCache() {
  cache.clear();
  console.log('[CLIENT CACHE] Cleared all');
}

export function clearCacheByPattern(pattern) {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
      count++;
    }
  }
  console.log(`[CLIENT CACHE] Cleared ${count} entries matching: ${pattern}`);
  return count;
}

