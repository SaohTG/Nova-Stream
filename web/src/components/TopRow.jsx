// web/src/components/TopRow.jsx
import Row from "./Row.jsx";

export default function TopRow({
  title = "Tendances de la semaine",
  items = [],
  kind = "vod",
  loading = false,
  seeMoreHref = null,
}) {
  // force 1..15 et passe l’overlay au Row pour avoir swipe + flèches
  const top15 = Array.isArray(items)
    ? items.slice(0, 15).map((it, i) => ({ ...it, __rank: it.__rank ?? i + 1 }))
    : [];

  return (
    <Row
      title={title}
      items={top15}
      kind={kind}
      loading={loading}
      seeMoreHref={seeMoreHref}
      showRank={true}
    />
  );
}
