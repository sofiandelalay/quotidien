// Position utilisée pour la météo, l'air et le nom de commune.
// Le Raccourci iOS publie « lat,lon » (2 décimales) sur le sujet ntfy privé NTFY_TOPIC_POSITION ;
// on lit le dernier message de moins de `max_age_heures` (ntfy.sh ne garde rien au-delà de 12 h).
// Sans message récent et valide : position par défaut (Lille).
// La position n'est jamais écrite dans un fichier, un commit, un log ni la page.

const NOMBRE = String.raw`-?\d{1,3}(?:[.,]\d+)?`;

/**
 * Lit « lat,lon » en tolérant les formats d'un iPhone réglé en français :
 *   « 50.63,3.06 », « 50,63,3,06 » (virgule décimale), « 50,63;3,06 », « 50.63 3.06 ».
 * Renvoie { lat, lon } arrondis à 2 décimales, ou null si le texte n'est pas une position valide.
 */
export function lirePosition(texte) {
  if (typeof texte !== 'string') return null;
  const t = texte.trim();
  let lat, lon;
  let m = t.match(new RegExp(`^(${NOMBRE})\\s*[;\\s|/]\\s*(${NOMBRE})$`)); // séparateur sans ambiguïté
  if (m) [lat, lon] = [m[1], m[2]];
  else if ((m = t.match(/^(-?\d{1,3})\.(\d+)\s*,\s*(-?\d{1,3})\.(\d+)$/))) [lat, lon] = [`${m[1]}.${m[2]}`, `${m[3]}.${m[4]}`];
  else if ((m = t.match(/^(-?\d{1,3}),(\d+),(-?\d{1,3}),(\d+)$/))) [lat, lon] = [`${m[1]}.${m[2]}`, `${m[3]}.${m[4]}`];
  else if ((m = t.match(/^(-?\d{1,3})\s*,\s*(-?\d{1,3})$/))) [lat, lon] = [m[1], m[2]];
  else return null;
  const la = Number(lat.replace(',', '.'));
  const lo = Number(lon.replace(',', '.'));
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  if (la === 0 && lo === 0) return null; // position non obtenue
  return { lat: Math.round(la * 100) / 100, lon: Math.round(lo * 100) / 100 };
}

/** Dernière position valide parmi les lignes NDJSON renvoyées par ntfy (/json?poll=1). */
export function dernierePosition(ndjson, maintenant, maxAgeHeures) {
  const limite = maintenant.getTime() / 1000 - maxAgeHeures * 3600;
  const messages = ndjson
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((m) => m && m.event === 'message' && m.time >= limite)
    .sort((a, b) => b.time - a.time);
  for (const m of messages) {
    const p = lirePosition(m.message);
    if (p) return { ...p, time: m.time };
  }
  return null;
}

/**
 * @returns {Promise<{lat:number, lon:number, source:'raccourci'|'defaut', nomParDefaut?:string, raison:string}>}
 */
export async function positionActuelle(cfg, { maintenant = new Date(), topic = process.env.NTFY_TOPIC_POSITION, fetcher = fetch } = {}) {
  const d = cfg.position.defaut;
  const defaut = (raison) => ({ lat: d.lat, lon: d.lon, nomParDefaut: d.nom, source: 'defaut', raison });
  if (!topic) return defaut('sujet de position non configuré');
  const age = cfg.position.max_age_heures ?? 12;
  try {
    const res = await fetcher(`https://ntfy.sh/${encodeURIComponent(topic)}/json?poll=1&since=${age}h`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return defaut(`ntfy HTTP ${res.status}`);
    const p = dernierePosition(await res.text(), maintenant, age);
    if (!p) return defaut(`aucune position de moins de ${age} h`);
    return { lat: p.lat, lon: p.lon, source: 'raccourci', raison: 'position du Raccourci' };
  } catch (e) {
    return defaut(e.name === 'TimeoutError' ? 'ntfy : délai dépassé' : 'ntfy injoignable');
  }
}
