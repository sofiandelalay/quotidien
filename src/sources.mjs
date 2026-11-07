// Récupération des données. Chaque fonction lève une erreur en cas d'échec : l'appelant
// l'attrape et omet la ligne concernée (une source en panne ne bloque jamais le briefing).
// URL et formes de réponse : docs/sources.md.
import { readFile } from 'node:fs/promises';
import { numeroJour } from './temps.mjs';

const DATA = new URL('../data/', import.meta.url);
const lireData = async (nom) => JSON.parse(await readFile(new URL(nom, DATA), 'utf8'));

/** GET JSON avec délai maximal et une nouvelle tentative. */
export async function getJson(url, { essais = 2, delai = 15000, init } = {}) {
  let derniere;
  for (let i = 1; i <= essais; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(delai), headers: { accept: 'application/json' }, ...init });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      derniere = e;
      if (i < essais) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw derniere;
}

const coord = (x) => x.toFixed(4);

export function prevision(pos, get = getJson) {
  return get(
    'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${coord(pos.lat)}&longitude=${coord(pos.lon)}` +
      '&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index' +
      '&daily=weather_code,temperature_2m_min,temperature_2m_max,sunrise,sunset' +
      '&timezone=Europe%2FParis&forecast_days=3&wind_speed_unit=kmh',
  );
}

export function qualiteAir(pos, get = getJson) {
  return get(
    'https://air-quality-api.open-meteo.com/v1/air-quality' +
      `?latitude=${coord(pos.lat)}&longitude=${coord(pos.lon)}` +
      '&hourly=european_aqi,pm10,pm2_5,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen' +
      '&timezone=Europe%2FParis&forecast_days=2',
  );
}

// Noms courts pour la notification (Nager.Date renvoie « Armistice 1918 », gouv « 11 novembre »…).
const NOMS_FERIES = {
  '01-01': "Jour de l'an",
  '05-01': 'Fête du Travail',
  '05-08': 'Victoire 1945',
  '07-14': 'Fête nationale',
  '08-15': 'Assomption',
  '11-01': 'Toussaint',
  '11-11': 'Armistice',
  '12-25': 'Noël',
};
const nomFerie = (date, nom) => NOMS_FERIES[date.slice(5)] ?? nom;

/** Jours fériés nationaux d'une année : [{date, nom}] triés. Nager.Date, repli calendrier.api.gouv.fr. */
export async function feriesAnnee(annee, get = getJson) {
  try {
    const liste = await get(`https://date.nager.at/api/v3/PublicHolidays/${annee}/FR`);
    return liste.filter((h) => h.global !== false).map((h) => ({ date: h.date, nom: nomFerie(h.date, h.localName) }));
  } catch {
    const o = await get(`https://calendrier.api.gouv.fr/jours-feries/metropole/${annee}.json`);
    return Object.entries(o).map(([date, nom]) => ({ date, nom: nomFerie(date, nom) })).sort((a, b) => a.date.localeCompare(b.date));
  }
}

/** Prochain jour férié à partir d'aujourd'hui (inclus), en regardant l'année suivante si besoin. */
export async function prochainFerie(jour, get = getJson) {
  const annee = Number(jour.slice(0, 4));
  for (const a of [annee, annee + 1]) {
    const f = (await feriesAnnee(a, get)).find((h) => h.date >= jour);
    if (f) return f;
  }
  return null;
}

/** Nom de commune ; null si aucune (en mer, à l'étranger). */
export async function commune(pos, get = getJson) {
  const l = await get(`https://geo.api.gouv.fr/communes?lat=${coord(pos.lat)}&lon=${coord(pos.lon)}&fields=nom&format=json`);
  return l[0]?.nom ?? null;
}

/**
 * Fête du jour : data/fetes.json (copie corrigée d'abalin, cf. docs/sources.md).
 * L'API d'abalin n'est plus appelée chaque jour : ses données françaises figent les fêtes
 * mobiles aux dates de 2018 et contiennent des abréviations. null = pas de prénom ce jour-là.
 */
export async function fete(jour) {
  const { fetes } = await lireData('fetes.json');
  return fetes[jour.slice(5)] ?? null;
}

/** Verset court du jour (sélection déterministe) : { ar, fr, ref, sourate }. */
export async function verset(jour, get = getJson) {
  const { refs } = await lireData('versets-courts.json');
  const ref = refs[numeroJour(jour) % refs.length];
  const r = await get(`https://api.alquran.cloud/v1/ayah/${ref}/editions/quran-uthmani,fr.hamidullah`);
  const [ar, fr] = r.data;
  return { ref, ar: ar.text, fr: fr.text, sourate: ar.surah.englishName, sourateAr: ar.surah.name };
}

/** Hadith du jour parmi les 40 de an-Nawawi (copie locale). */
export async function hadith(jour) {
  const { hadiths, source } = await lireData('nawawi-fr.json');
  const h = hadiths[numeroJour(jour) % hadiths.length];
  return { numero: h.numero, texte: h.texte, source };
}
