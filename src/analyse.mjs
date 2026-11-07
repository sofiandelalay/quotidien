// Transforme les réponses brutes d'Open-Meteo en un résumé de la journée (fonctions pures).
import { creneauxPluie } from './pluie.mjs';

const max = (xs) => (xs.length ? Math.max(...xs) : null);
const min = (xs) => (xs.length ? Math.min(...xs) : null);
const moyenne = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nombres = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));

/** Heures (locales, Paris) d'un jour donné, avec toutes les variables horaires. */
export function heuresDuJour(hourly, jour) {
  const res = [];
  hourly.time.forEach((t, i) => {
    if (!t.startsWith(jour)) return;
    res.push({
      heure: Number(t.slice(11, 13)),
      temp: hourly.temperature_2m?.[i],
      ressenti: hourly.apparent_temperature?.[i],
      mm: hourly.precipitation?.[i],
      proba: hourly.precipitation_probability?.[i],
      code: hourly.weather_code?.[i],
      vent: hourly.wind_speed_10m?.[i],
      rafales: hourly.wind_gusts_10m?.[i],
      uv: hourly.uv_index?.[i],
      nuages: hourly.cloud_cover?.[i],
    });
  });
  return res;
}

const dans = (h, [de, a]) => h.heure >= de && h.heure < a;

/**
 * Résumé météo du jour.
 * @param {object} prevision réponse Open-Meteo forecast (timezone=Europe/Paris)
 * @param {string} jour AAAA-MM-JJ
 * @param {object} cfg config complète
 */
export function resumerMeteo(prevision, jour, cfg) {
  const d = prevision.daily;
  const i = d.time.indexOf(jour);
  if (i < 0) throw new Error(`prévision sans le jour ${jour}`);
  const toutes = heuresDuJour(prevision.hourly, jour);
  const plage = [cfg.journee.debut, cfg.journee.fin];
  const journee = toutes.filter((h) => dans(h, plage));
  const c = cfg.conseil;
  return {
    min: d.temperature_2m_min[i],
    max: d.temperature_2m_max[i],
    code: d.weather_code?.[i],
    lever: d.sunrise?.[i]?.slice(11),
    coucher: d.sunset?.[i]?.slice(11),
    creneaux: creneauxPluie(journee, cfg.pluie),
    cumul: nombres(journee.map((h) => h.mm)).reduce((a, b) => a + b, 0),
    probaMax: max(nombres(journee.map((h) => h.proba))),
    ventMax: max(nombres(journee.map((h) => h.vent))),
    rafalesMax: max(nombres(journee.map((h) => h.rafales))),
    uvMax: max(nombres(journee.map((h) => h.uv))),
    nuagesMoyens: moyenne(nombres(journee.map((h) => h.nuages))),
    tempMinGel: min(nombres(toutes.filter((h) => dans(h, c.gel.heures)).map((h) => h.temp))),
    ressentiMatin: min(nombres(toutes.filter((h) => dans(h, c.manteau.heures)).map((h) => h.ressenti))),
    heures: toutes,
  };
}

const POLLENS = {
  alder_pollen: 'aulne',
  birch_pollen: 'bouleau',
  grass_pollen: 'graminees',
  mugwort_pollen: 'armoise',
  olive_pollen: 'olivier',
  ragweed_pollen: 'ambroisie',
};
export const NOMS_POLLENS = { aulne: 'aulne', bouleau: 'bouleau', graminees: 'graminées', armoise: 'armoise', olivier: 'olivier', ambroisie: 'ambroisie' };

/** Résumé qualité de l'air + pollens sur la journée. */
export function resumerAir(qualite, jour, cfg) {
  const h = qualite.hourly;
  const idx = h.time.map((t, i) => [t, i]).filter(([t]) => t.startsWith(jour) && Number(t.slice(11, 13)) >= cfg.journee.debut && Number(t.slice(11, 13)) < cfg.journee.fin).map(([, i]) => i);
  if (!idx.length) throw new Error(`qualité de l'air sans le jour ${jour}`);
  const maxDe = (cle) => max(nombres(idx.map((i) => h[cle]?.[i])));
  const pollens = {};
  for (const [cle, nom] of Object.entries(POLLENS)) {
    const v = maxDe(cle);
    if (v !== null) pollens[nom] = v;
  }
  return { aqiMax: maxDe('european_aqi'), pm10Max: maxDe('pm10'), pm25Max: maxDe('pm2_5'), pollens };
}

/** Mot français pour l'indice européen. */
export function motAir(aqi, niveaux) {
  if (aqi === null || aqi === undefined) return null;
  return (niveaux.find((n) => aqi < n.max) ?? niveaux.at(-1)).mot;
}

/** Pollens dont le maximum atteint le seuil, du plus élevé (relativement au seuil) au moins élevé. */
export function pollensNotables(pollens, seuils) {
  return Object.entries(pollens)
    .filter(([nom, v]) => seuils[nom] !== undefined && v >= seuils[nom] && v > 0)
    .sort(([a, va], [b, vb]) => vb / seuils[b] - va / seuils[a])
    .map(([nom]) => NOMS_POLLENS[nom] ?? nom);
}

/**
 * État du ciel en un mot, d'après la couverture nuageuse moyenne en journée (seuils dans config.yaml,
 * « ciel »). Le brouillard, la neige et l'orage priment. Sans couverture nuageuse : d'après le code WMO.
 * @returns {{ mot: string|null, emoji: string }}
 */
export function cielDuJour(m, niveaux) {
  const pluie = m.creneaux.length > 0;
  if ([95, 96, 99].includes(m.code)) return { mot: 'Orageux', emoji: '⛈️' };
  if ((m.code >= 71 && m.code <= 77) || m.code === 85 || m.code === 86) return { mot: 'Neigeux', emoji: '🌨️' };
  if ((m.code === 45 || m.code === 48) && !pluie) return { mot: 'Brouillard', emoji: '🌫️' };
  let mot = null;
  if (m.nuagesMoyens != null) mot = (niveaux.find((n) => m.nuagesMoyens < n.max) ?? niveaux.at(-1)).mot;
  else mot = { 0: 'Ensoleillé', 1: 'Plutôt ensoleillé', 2: 'Nuageux', 3: 'Couvert' }[m.code] ?? null;
  const index = mot ? niveaux.findIndex((n) => n.mot === mot) : -1; // 0 = le plus dégagé
  const emojis = pluie ? ['🌦️', '🌦️', '🌧️', '🌧️'] : ['☀️', '🌤️', '⛅', '☁️'];
  return { mot, emoji: emojis[Math.max(0, Math.min(3, index === -1 ? (pluie ? 3 : 2) : index))] };
}
