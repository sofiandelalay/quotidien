// Moteur des alertes « bon moment pour… » : lit rules.yaml, évalue chaque règle sur la météo,
// applique l'anti-doublon (clé « règle:événement » dans state.json) et le délai entre alertes.
// Le vocabulaire est documenté dans le README (section « Écrire une règle »).
import YAML from 'yaml';
import { readFile } from 'node:fs/promises';
import { heurePluvieuse } from './pluie.mjs';
import { motAir } from './analyse.mjs';
import { deg } from './conseil.mjs';
import { ajouterJours, jourSemaine, NOMS_JOURS, dateCourte, ecartJours, paris } from './temps.mjs';

// --- Vocabulaire -----------------------------------------------------------------------

export const MOMENTS = ['matin', 'soir'];
export const JOURS = NOMS_JOURS; // dimanche … samedi
/** Périodes utilisables dans « quand » (et « evenement » pour celles qui désignent un jour). */
export const PERIODES_JOUR = ['aujourdhui', 'demain', ...JOURS];
export const PERIODES = [...PERIODES_JOUR, 'nuit', 'prochaines_48h'];
export const NUIT = { debut: 20, fin: 8 }; // « nuit » : de 20h ce soir à 8h demain matin

const nombres = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
const max = (xs) => (nombres(xs).length ? Math.max(...nombres(xs)) : null);
const min = (xs) => (nombres(xs).length ? Math.min(...nombres(xs)) : null);

/** Mesures : nom → { calcul(heures, ctx), format(valeur), unite } */
export const MESURES = {
  temperature_max: { calcul: (h) => max(h.map((x) => x.temp)), format: deg, unite: '°C' },
  temperature_min: { calcul: (h) => min(h.map((x) => x.temp)), format: deg, unite: '°C' },
  ressenti_min: { calcul: (h) => min(h.map((x) => x.ressenti)), format: deg, unite: '°C' },
  pluie_mm: { calcul: (h) => (h.length ? nombres(h.map((x) => x.mm)).reduce((a, b) => a + b, 0) : null), format: (v) => String(Math.round(v * 10) / 10).replace('.', ','), unite: 'mm' },
  pluie: { calcul: (h, ctx) => (h.length ? (h.some((x) => heurePluvieuse(x, ctx.cfg.pluie)) ? 'pluvieux' : 'sec') : null), format: (v) => v, valeurs: ['sec', 'pluvieux'] },
  probabilite_pluie_max: { calcul: (h) => max(h.map((x) => x.proba)), format: (v) => String(Math.round(v)), unite: '%' },
  vent_max: { calcul: (h) => max(h.map((x) => x.vent)), format: (v) => String(Math.round(v)), unite: 'km/h' },
  rafales_max: { calcul: (h) => max(h.map((x) => x.rafales)), format: (v) => String(Math.round(v)), unite: 'km/h' },
  uv_max: { calcul: (h) => max(h.map((x) => x.uv)), format: (v) => String(Math.round(v)), unite: '' },
  air_indice_max: { calcul: (h) => max(h.map((x) => x.aqi)), format: (v) => String(Math.round(v)), unite: '' },
  air: { calcul: (h, ctx) => motAir(max(h.map((x) => x.aqi)), ctx.cfg.air.niveaux), format: (v) => v },
};

/** Opérateurs : nom → test(valeur, attendu). */
export const OPERATEURS = {
  au_moins: (v, a) => v >= a,
  au_plus: (v, a) => v <= a,
  plus_de: (v, a) => v > a,
  moins_de: (v, a) => v < a,
  est: (v, a) => v === a,
};

const CLES_REGLE = ['id', 'nom', 'actif', 'moment', 'jours', 'periode', 'evenement', 'delai_jours', 'conditions', 'titre', 'message', 'priorite'];

// --- Validation (rules.yaml est modifié à la main, depuis l'iPhone) ---------------------

function validerCondition(c, ou, erreurs) {
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return erreurs.push(`${ou} : condition illisible`);
  if ('tous' in c || 'un_des' in c) {
    const cle = 'tous' in c ? 'tous' : 'un_des';
    if (Object.keys(c).length !== 1) erreurs.push(`${ou} : « ${cle} » doit être seul dans son bloc`);
    if (!Array.isArray(c[cle]) || !c[cle].length) return erreurs.push(`${ou} : « ${cle} » doit contenir une liste de conditions`);
    c[cle].forEach((s, i) => validerCondition(s, `${ou} › ${cle}[${i + 1}]`, erreurs));
    return;
  }
  const { quand, mesure, ...reste } = c;
  if (!PERIODES.includes(quand)) erreurs.push(`${ou} : « quand: ${quand} » inconnu (possibles : ${PERIODES.join(', ')})`);
  if (!MESURES[mesure]) erreurs.push(`${ou} : « mesure: ${mesure} » inconnue (possibles : ${Object.keys(MESURES).join(', ')})`);
  const ops = Object.keys(reste);
  if (ops.length !== 1 || !OPERATEURS[ops[0]]) {
    erreurs.push(`${ou} : il faut exactement un opérateur parmi ${Object.keys(OPERATEURS).join(', ')} (trouvé : ${ops.join(', ') || 'aucun'})`);
    return;
  }
  const [op] = ops;
  const attendu = reste[op];
  const valeurs = MESURES[mesure]?.valeurs;
  if (valeurs) {
    if (op !== 'est' || !valeurs.includes(attendu)) erreurs.push(`${ou} : « ${mesure} » s'utilise avec « est: ${valeurs.join(' | ')} »`);
  } else if (mesure === 'air') {
    if (op !== 'est') erreurs.push(`${ou} : « air » s'utilise avec « est: <mot> » (ou utilisez air_indice_max)`);
  } else if (op === 'est' || typeof attendu !== 'number') {
    erreurs.push(`${ou} : « ${mesure} » attend un nombre avec au_moins, au_plus, plus_de ou moins_de`);
  }
}

const VARIABLE = /\{([a-z0-9_]+)(?:\.([a-z0-9_]+))?\}/g;

export function validerRegles(doc) {
  const erreurs = [];
  const regles = doc?.regles;
  if (!Array.isArray(regles)) return { regles: [], erreurs: ['rules.yaml doit contenir une liste « regles: »'] };
  const ids = new Set();
  regles.forEach((r, i) => {
    const ou = `règle ${i + 1}${r?.id ? ` (${r.id})` : ''}`;
    if (!r || typeof r !== 'object') return erreurs.push(`${ou} : illisible`);
    for (const k of Object.keys(r)) if (!CLES_REGLE.includes(k)) erreurs.push(`${ou} : champ « ${k} » inconnu`);
    if (!/^[a-z0-9_-]+$/.test(r.id ?? '')) erreurs.push(`${ou} : « id » obligatoire (minuscules, chiffres, - ou _)`);
    else if (ids.has(r.id)) erreurs.push(`${ou} : id en double`);
    ids.add(r.id);
    if (!MOMENTS.includes(r.moment)) erreurs.push(`${ou} : « moment » doit valoir matin ou soir`);
    if (r.jours !== undefined && (!Array.isArray(r.jours) || r.jours.some((j) => !JOURS.includes(j)))) erreurs.push(`${ou} : « jours » doit être une liste parmi ${JOURS.join(', ')}`);
    if (r.periode !== undefined && !(/^\d{2}-\d{2}$/.test(r.periode?.du) && /^\d{2}-\d{2}$/.test(r.periode?.au))) erreurs.push(`${ou} : « periode » s'écrit { du: "MM-JJ", au: "MM-JJ" }`);
    if (r.evenement !== undefined && !PERIODES_JOUR.includes(r.evenement)) erreurs.push(`${ou} : « evenement » doit être un jour (${PERIODES_JOUR.join(', ')})`);
    if (r.delai_jours !== undefined && !(Number.isInteger(r.delai_jours) && r.delai_jours > 0)) erreurs.push(`${ou} : « delai_jours » doit être un nombre entier de jours`);
    if (r.conditions === undefined) erreurs.push(`${ou} : « conditions » obligatoire`);
    else validerCondition(Array.isArray(r.conditions) ? { tous: r.conditions } : r.conditions, `${ou} › conditions`, erreurs);
    for (const champ of ['titre', 'message']) {
      if (typeof r[champ] !== 'string' || !r[champ].trim()) erreurs.push(`${ou} : « ${champ} » obligatoire`);
      else if (r[champ].includes('\n')) erreurs.push(`${ou} : « ${champ} » doit tenir sur une ligne`);
      else {
        for (const [, a, b] of r[champ].matchAll(VARIABLE)) {
          const ok = b ? PERIODES.includes(a) && MESURES[b] : ['date', 'commune'].includes(a);
          if (!ok) erreurs.push(`${ou} : variable {${a}${b ? '.' + b : ''}} inconnue`);
        }
      }
    }
  });
  return { regles: regles.filter((r) => r && r.actif !== false), erreurs };
}

export async function chargerRegles(fichier = new URL('../rules.yaml', import.meta.url)) {
  return validerRegles(YAML.parse(await readFile(fichier, 'utf8')));
}

// --- Contexte : heures météo par période ------------------------------------------------

/**
 * @param {object} p
 * @param {object} p.prevision  réponse Open-Meteo forecast (null si indisponible)
 * @param {object} [p.air]      réponse Open-Meteo air quality
 * @param {Date}   p.maintenant
 * @param {object} p.cfg
 * @param {string} [p.commune]
 */
export function creerContexte({ prevision, air, maintenant, cfg, commune = '' }) {
  const local = paris(maintenant);
  const jour = local.date;
  const parHeure = new Map();
  if (prevision?.hourly?.time) {
    const h = prevision.hourly;
    h.time.forEach((t, i) => {
      parHeure.set(t, { t, temp: h.temperature_2m?.[i], ressenti: h.apparent_temperature?.[i], mm: h.precipitation?.[i], proba: h.precipitation_probability?.[i], vent: h.wind_speed_10m?.[i], rafales: h.wind_gusts_10m?.[i], uv: h.uv_index?.[i], aqi: null });
    });
  }
  if (air?.hourly?.time) {
    air.hourly.time.forEach((t, i) => {
      const x = parHeure.get(t);
      if (x) x.aqi = air.hourly.european_aqi?.[i];
    });
  }
  const cle = (date, heure) => `${date}T${String(heure).padStart(2, '0')}:00`;

  /** Date AAAA-MM-JJ désignée par une période « jour ». */
  function dateDe(periode) {
    if (periode === 'aujourdhui') return jour;
    if (periode === 'demain') return ajouterJours(jour, 1);
    const cible = JOURS.indexOf(periode);
    const ecart = (cible - jourSemaine(jour) + 7) % 7; // le jour même compte
    return ajouterJours(jour, ecart);
  }

  /** Heures de la période ; null si la prévision ne les couvre pas toutes. */
  function heures(periode) {
    const voulues = [];
    if (PERIODES_JOUR.includes(periode)) {
      const d = dateDe(periode);
      for (let h = cfg.journee.debut; h < cfg.journee.fin; h++) voulues.push(cle(d, h));
    } else if (periode === 'nuit') {
      for (let h = NUIT.debut; h < 24; h++) voulues.push(cle(jour, h));
      for (let h = 0; h < NUIT.fin; h++) voulues.push(cle(ajouterJours(jour, 1), h));
    } else if (periode === 'prochaines_48h') {
      for (let k = 0; k < 48; k++) {
        const h = local.heure + k;
        voulues.push(cle(ajouterJours(jour, Math.floor(h / 24)), h % 24));
      }
    }
    const res = voulues.map((t) => parHeure.get(t));
    return res.every(Boolean) ? res : null;
  }

  function mesurer(periode, mesure) {
    const h = heures(periode);
    if (!h) return null;
    if (mesure.startsWith('air') && h.every((x) => x.aqi == null)) return null;
    return MESURES[mesure].calcul(h, { cfg });
  }

  return { jour, maintenant, cfg, commune, dateDe, heures, mesurer };
}

// --- Évaluation -------------------------------------------------------------------------

function evaluerCondition(c, ctx, details) {
  if ('tous' in c) return c.tous.map((s) => evaluerCondition(s, ctx, details)).every(Boolean);
  if ('un_des' in c) return c.un_des.map((s) => evaluerCondition(s, ctx, details)).some(Boolean);
  const { quand, mesure, ...reste } = c;
  const [op] = Object.keys(reste);
  const valeur = ctx.mesurer(quand, mesure);
  const ok = valeur !== null && OPERATEURS[op](valeur, reste[op]);
  details.push({ texte: `${quand}.${mesure} ${op.replace('_', ' ')} ${reste[op]}`, valeur, ok });
  return ok;
}

function dansPeriode(jour, { du, au }) {
  const md = jour.slice(5);
  return du <= au ? md >= du && md <= au : md >= du || md <= au; // « du 11-01 au 03-31 » passe le nouvel an
}

/** Remplace {quand.mesure}, {date} et {commune} dans un texte. */
export function remplir(texte, ctx, dateEvenement) {
  return texte.replace(VARIABLE, (tout, a, b) => {
    if (!b) return a === 'date' ? `${NOMS_JOURS[jourSemaine(dateEvenement)]} ${dateCourte(dateEvenement)}` : ctx.commune;
    const v = ctx.mesurer(a, b);
    return v === null ? '?' : MESURES[b].format(v);
  });
}

/**
 * Évalue une règle pour un passage.
 * @returns {{ id, declenche: boolean, cle: string|null, raison: string, titre?: string, message?: string, details: object[] }}
 */
export function evaluerRegle(regle, ctx, etat, passage) {
  const base = { id: regle.id, declenche: false, cle: null, details: [] };
  if (regle.moment !== passage) return { ...base, raison: `règle du ${regle.moment}` };
  const nomDuJour = NOMS_JOURS[jourSemaine(ctx.jour)];
  if (regle.jours && !regle.jours.includes(nomDuJour)) return { ...base, raison: `pas un ${regle.jours.join(' ou ')} (on est ${nomDuJour})` };
  if (regle.periode && !dansPeriode(ctx.jour, regle.periode)) return { ...base, raison: `hors période (${regle.periode.du} → ${regle.periode.au})` };

  const dateEvenement = ctx.dateDe(regle.evenement ?? 'aujourdhui');
  const cle = `${regle.id}:${dateEvenement}`;
  if (etat.alertes?.[cle]) return { ...base, cle, raison: `déjà envoyée (${cle})` };
  if (regle.delai_jours) {
    const precedentes = Object.entries(etat.alertes ?? {})
      .filter(([k]) => k.startsWith(regle.id + ':'))
      .map(([, quand]) => ecartJours(paris(new Date(quand)).date, ctx.jour));
    const plusRecente = precedentes.length ? Math.min(...precedentes) : Infinity;
    if (plusRecente < regle.delai_jours) return { ...base, cle, raison: `délai : dernière alerte il y a ${plusRecente} j (minimum ${regle.delai_jours} j)` };
  }

  const details = [];
  const conditions = Array.isArray(regle.conditions) ? { tous: regle.conditions } : regle.conditions;
  const ok = evaluerCondition(conditions, ctx, details);
  if (!ok) {
    const manquantes = details.filter((d) => d.valeur === null).length;
    return { ...base, cle, details, raison: manquantes ? 'données météo manquantes' : 'conditions non remplies' };
  }
  return {
    ...base,
    declenche: true,
    cle,
    details,
    raison: 'conditions remplies',
    titre: remplir(regle.titre, ctx, dateEvenement),
    message: remplir(regle.message, ctx, dateEvenement),
    priorite: regle.priorite,
  };
}

export function evaluerRegles(regles, ctx, etat, passage) {
  return regles.map((r) => evaluerRegle(r, ctx, etat, passage));
}
