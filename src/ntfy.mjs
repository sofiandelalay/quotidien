// Envoi ntfy en JSON (UTF-8) sur la racine https://ntfy.sh/.
// Champ de livraison différée : « delay » (doc docs.ntfy.sh/publish, « Scheduled delivery ») ;
// on envoie un horodatage Unix, sans ambiguïté de fuseau. Délai accepté : 10 s à 3 jours.
export const NTFY = 'https://ntfy.sh/';

export function construireMessage({ topic, titre, message, livraison = null, priorite = 3, lien = '' }) {
  const p = { topic, title: titre, message };
  // Priorité seulement si elle diffère de la normale (3) : un ticket ntfy signale des messages
  // JSON avec « priority » non affichés sur iOS (github.com/binwiederhier/ntfy/issues/461).
  if (priorite && priorite !== 3) p.priority = priorite;
  if (livraison) p.delay = String(Math.floor(livraison.getTime() / 1000));
  if (lien) p.click = lien;
  return p;
}

/** Publie et renvoie la réponse de ntfy ({ id, time, … }) ; lève une erreur sinon. */
export async function publier(payload, { essais = 3 } = {}) {
  let derniere;
  for (let i = 1; i <= essais; i++) {
    try {
      const res = await fetch(NTFY, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const texte = await res.text();
      if (!res.ok) throw new Error(`ntfy HTTP ${res.status} ${texte.slice(0, 200).replaceAll(payload.topic, '***')}`);
      return JSON.parse(texte);
    } catch (e) {
      derniere = e;
      if (i < essais) await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  throw derniere;
}
