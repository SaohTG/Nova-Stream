import { useEffect, useState } from "react";
import Row from "./Row.jsx";
import api from "../lib/api";

export default function TrendingWeekRow() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.getJson("/tmdb/trending-week-mapped")
      .then((list) => { if (alive) setItems(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
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
