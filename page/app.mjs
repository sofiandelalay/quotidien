// Charge data.json et affiche la page. Pas de service worker : la page est toujours à jour.
import { rendre, esc } from './rendu.mjs';

const app = document.getElementById('app');
let derniere = null;

async function charger() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    derniere = await res.json();
    afficher();
  } catch (e) {
    if (!derniere) app.innerHTML = `<header><h1>Quotidien</h1><p class="alerte" role="alert">Données indisponibles (${esc(e.message)}). Réessayez dans un instant.</p></header>`;
  }
}

function afficher() {
  if (!derniere) return;
  const ouvert = app.querySelector('details.du-jour')?.open;
  app.innerHTML = rendre(derniere);
  // « #du-jour » dans l'adresse ouvre directement le verset et le hadith.
  if (ouvert || location.hash === '#du-jour') app.querySelector('details.du-jour')?.setAttribute('open', '');
}

charger();
// Sur l'écran d'accueil, iOS garde la page en mémoire : on recharge en revenant dessus.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') charger();
});
