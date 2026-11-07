// Le conseil du jour : une seule phrase, uniquement si elle est utile. Seuils dans config.yaml.
import { texteCreneaux } from './pluie.mjs';
import { motAir } from './analyse.mjs';

export const deg = (t) => {
  const r = Math.round(t);
  return r < 0 ? `−${-r}` : `${r === 0 ? 0 : r}`; // signe moins typographique, jamais « -0 »
};

/** Chaque règle reçoit (météo, air, cfg) et renvoie une phrase ou null. */
const REGLES = {
  air_mauvais(m, air, cfg) {
    if (air?.aqiMax == null || air.aqiMax < cfg.conseil.air_mauvais.indice) return null;
    return `Air ${motAir(air.aqiMax, cfg.air.niveaux)} : éviter l'effort intense dehors.`;
  },
  vent_fort(m, air, cfg) {
    if (m?.rafalesMax == null || m.rafalesMax < cfg.conseil.vent_fort.rafales) return null;
    return `Vent fort, rafales jusqu'à ${Math.round(m.rafalesMax)} km/h : prudence à vélo.`;
  },
  gel(m, air, cfg) {
    if (m?.tempMinGel == null || m.tempMinGel > cfg.conseil.gel.temperature) return null;
    return `Gel ce matin (${deg(m.tempMinGel)}°) : prudence sur la route.`;
  },
  parapluie(m, air, cfg) {
    const c = cfg.conseil.parapluie;
    if (!m || !m.creneaux.length) return null;
    if (m.cumul < c.cumul_mm && (m.probaMax ?? 0) < c.probabilite) return null;
    return `Parapluie conseillé (pluie ${texteCreneaux(m.creneaux, cfg.pluie.creneaux_max)}).`;
  },
  manteau(m, air, cfg) {
    if (m?.ressentiMatin == null || m.ressentiMatin > cfg.conseil.manteau.ressenti) return null;
    return `Manteau conseillé : ressenti ${deg(m.ressentiMatin)}° ce matin.`;
  },
  creme_solaire(m, air, cfg) {
    if (m?.uvMax == null || m.uvMax < cfg.conseil.creme_solaire.uv) return null;
    return `Crème solaire conseillée : UV ${Math.round(m.uvMax)} en milieu de journée.`;
  },
};

/** Le premier conseil applicable dans l'ordre de priorité, ou null. */
export function choisirConseil(meteo, air, cfg) {
  for (const nom of cfg.conseil.priorite) {
    const regle = REGLES[nom];
    if (!regle) throw new Error(`conseil inconnu dans config.yaml : ${nom}`);
    const phrase = regle(meteo, air, cfg);
    if (phrase) return phrase;
  }
  return null;
}
