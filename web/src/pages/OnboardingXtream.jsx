// web/src/pages/OnboardingXtream.jsx
import XtreamLinkForm from "../components/XtreamLinkForm.jsx";

export default function OnboardingXtream() {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold">Lier votre compte Xtream</h1>
      <p className="mb-6 text-zinc-300">
        Connectez votre compte Xtream pour charger vos films, séries et chaînes TV. 
        Vos identifiants sont chiffrés côté serveur.
      </p>
      <XtreamLinkForm />
    </section>
  );
}
