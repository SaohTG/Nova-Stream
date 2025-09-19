// web/src/components/Hero.jsx
export default function Hero({ item }) {
  if (!item) return null;
  const bg = item.poster || item.backdrop || null;

  return (
    <section className="relative mb-8 overflow-hidden rounded-2xl ring-1 ring-white/10">
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent z-10" />
      {bg ? (
        <img
          src={bg}
          alt={item.name}
          className="absolute inset-0 h-full w-full object-cover opacity-70"
          loading="lazy"
        />
      ) : (
        <div className="h-[44vh] w-full bg-gradient-to-br from-zinc-900 to-black" />
      )}
      <div className="relative z-20 p-6 md:p-10">
        <h1 className="max-w-xl text-3xl font-bold md:text-5xl">{item.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-200/90">
          Reprenez où vous vous êtes arrêté. Découvrez les nouveautés de votre serveur Xtream.
        </p>
        <div className="mt-5 flex gap-3">
          <a
            href="#"
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black shadow hover:bg-zinc-200"
          >
            ▶ Regarder
          </a>
          <a
            href="#"
            className="rounded-xl bg-zinc-900/70 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-zinc-900"
          >
            Détails
          </a>
        </div>
      </div>
      <div className="pointer-events-none relative h-[44vh] w-full" />
    </section>
  );
}
