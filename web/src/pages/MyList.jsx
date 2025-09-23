// web/src/pages/MyList.jsx
import PosterCard from "../components/PosterCard.jsx";
import { useMyList } from "../lib/mylist";

export default function MyList() {
  const list = useMyList(); // [{kind,id,title,img,raw,updatedAt}]

  return (
    <div className="px-4 md:px-8 lg:px-12 py-6">
      <h1 className="mb-4 text-2xl font-bold text-white">Ma Liste</h1>

      {list.length === 0 ? (
        <div className="text-zinc-400">Aucun élément. Cliquez sur le signet d’une affiche pour l’ajouter.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5">
          {list.map((it) => {
            const kind = it.kind === "series" ? "series" : "vod";
            // objet minimal si pas de raw
            const item = it.raw || (it.kind === "series"
              ? { series_id: it.id, name: it.title, cover: it.img }
              : { stream_id: it.id, title: it.title, cover: it.img });

            return (
              <PosterCard
                key={`${it.kind}-${it.id}`}
                item={item}
                kind={kind}
                showTitle={true}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
