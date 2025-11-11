import { useEffect, useState } from "react";
import Row from "./Row.jsx";
import api from "../lib/api";
import { getCached, setCached } from "../lib/clientCache";

export default function TrendingWeekRow() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    
    (async () => {
      // Vérifier le cache client d'abord (5 min)
      const cached = getCached("trending-week");
      if (cached) {
        setItems(cached);
        setLoading(false);
        return;
      }
      
      try {
        const list = await api.getJson("/tmdb/trending-week-mapped");
        if (!alive) return;
        
        const items = Array.isArray(list) ? list : [];
        setItems(items);
        
        // Mettre en cache côté client (5 min)
        if (items.length > 0) {
          setCached("trending-week", items);
        }
      } catch (error) {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    
    return () => { alive = false; };
  }, []);

  return (
    <Row
      title="Tendances de la semaine"
      items={items}
      kind="vod"
      loading={loading}
      seeMoreHref={null}
    />
  );
}
