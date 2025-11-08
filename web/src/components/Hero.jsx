// web/src/components/Hero.jsx
export default function Hero({ item }) {
  if (!item) return null;
  const bg = item.poster || item.backdrop || null;

  return (
    <section className="relative mb-12 overflow-hidden rounded-3xl ring-1 ring-white/10 shadow-2xl group animate-fade-in">
      {/* Effet de dégradé sophistiqué */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent z-10" />
      
      {/* Image de fond avec effet parallax subtil */}
      {bg ? (
        <img
          src={bg}
          alt={item.name}
          className="absolute inset-0 h-full w-full object-cover opacity-60 transition-all duration-700 group-hover:opacity-80 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="h-[50vh] md:h-[60vh] w-full bg-gradient-to-br from-primary-900/30 via-slate-900 to-accent-900/30" />
      )}
      
      {/* Effet de grille animée */}
      <div className="absolute inset-0 opacity-10 z-10" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M54.627 0l.83.828-1.415 1.415L51.8 0h2.827zM5.373 0l-.83.828L5.96 2.243 8.2 0H5.374zM48.97 0l3.657 3.657-1.414 1.414L46.143 0h2.828zM11.03 0L7.372 3.657 8.787 5.07 13.857 0H11.03zm32.284 0L49.8 6.485 48.384 7.9l-7.9-7.9h2.83zM16.686 0L10.2 6.485 11.616 7.9l7.9-7.9h-2.83zm20.97 0l9.315 9.314-1.414 1.414L34.828 0h2.83zM22.344 0L13.03 9.314l1.414 1.414L25.172 0h-2.83zM32 0l12.142 12.142-1.414 1.414L30 .828 17.272 13.556 15.858 12.14 28 0zm0 16.97L44.142 29.113l-1.414 1.414L32 19.8l-10.728 10.728-1.414-1.414L32 16.97zm0 16.97L44.142 46.084l-1.414 1.414L32 36.77l-10.728 10.728-1.414-1.414L32 33.94z' fill='%23fff' fill-opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px'
        }}
      ></div>
      
      {/* Contenu */}
      <div className="relative z-20 p-8 md:p-12 lg:p-16 min-h-[50vh] md:min-h-[60vh] flex flex-col justify-end">
        {/* Badge ou catégorie */}
        <div className="mb-4 flex items-center gap-2">
          <span className="badge">
            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            À la une
          </span>
        </div>
        
        <h1 className="max-w-3xl text-4xl font-bold md:text-6xl lg:text-7xl mb-4 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent leading-tight animate-slide-up">
          {item.name}
        </h1>
        
        <p className="mt-4 max-w-2xl text-base md:text-lg text-zinc-200/90 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
          Reprenez où vous vous êtes arrêté. Découvrez les nouveautés de votre serveur Xtream.
        </p>
        
        <div className="mt-8 flex flex-wrap gap-3 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <a
            href="#"
            className="group/btn inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-black shadow-xl hover:shadow-2xl hover:shadow-white/20 transition-all duration-300 hover:scale-105 active:scale-95"
          >
            <svg className="w-5 h-5 transition-transform group-hover/btn:translate-x-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Regarder
          </a>
          <a
            href="#"
            className="glass-button inline-flex items-center gap-2 text-white hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Plus d'infos
          </a>
        </div>
      </div>
    </section>
  );
}
