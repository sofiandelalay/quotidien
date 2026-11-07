// Dates et heures en Europe/Paris, indépendamment du fuseau de la machine (GitHub Actions = UTC).
export const FUSEAU = 'Europe/Paris';

const formats = new Map();
function format(tz) {
  if (!formats.has(tz)) {
    formats.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    }));
  }
  return formats.get(tz);
}
const JOURS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

/** Vrai si `tz` est un fuseau IANA connu du moteur JavaScript. */
export function fuseauValide(tz) {
  try {
    format(tz);
    return true;
  } catch {
    return false;
  }
}

/** Composantes de l'instant `date` vues depuis le fuseau `tz`. */
export function dans(tz, date) {
  const p = Object.fromEntries(format(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    annee: Number(p.year),
    mois: Number(p.month),
    jour: Number(p.day),
    heure: Number(p.hour),
    minute: Number(p.minute),
    seconde: Number(p.second),
    jourSemaine: JOURS[p.weekday], // 0 = dimanche … 6 = samedi
    date: `${p.year}-${p.month}-${p.day}`, // AAAA-MM-JJ
    hhmm: `${p.hour}:${p.minute}`,
  };
}

/** Composantes de l'instant `date` vues depuis Paris. */
export const paris = (date) => dans(FUSEAU, date);

/** Décalage d'un fuseau par rapport à UTC à l'instant donné, en minutes. */
export function decalage(tz, date) {
  const p = dans(tz, date);
  const commeUtc = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
  return Math.round((commeUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Décalage de Paris par rapport à UTC (60 l'hiver, 120 l'été). */
export const decalageParis = (date) => decalage(FUSEAU, date);

/**
 * Instant (Date) de l'heure murale `hh:mm[:ss]` du jour `AAAA-MM-JJ` dans le fuseau `tz`.
 * Heure inexistante (saut de printemps) : décalée d'une heure, comme le font les agendas.
 */
export function instantDans(tz, dateStr, hhmm) {
  const [a, m, j] = dateStr.split('-').map(Number);
  const [h, mi, se = 0] = hhmm.split(':').map(Number);
  const naif = Date.UTC(a, m - 1, j, h, mi, se);
  // Deux itérations suffisent, y compris autour des changements d'heure.
  let t = naif - decalage(tz, new Date(naif)) * 60000;
  t = naif - decalage(tz, new Date(t)) * 60000;
  return new Date(t);
}

/** Instant (Date) de l'heure murale `hh:mm` du jour `AAAA-MM-JJ` à Paris. */
export const instantParis = (dateStr, hhmm) => instantDans(FUSEAU, dateStr, hhmm);

/** Nombre de minutes depuis minuit pour « hh:mm ». */
export function minutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Ajoute n jours à une date AAAA-MM-JJ (calendrier, sans fuseau). */
export function ajouterJours(dateStr, n) {
  const [a, m, j] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

/** Écart en jours calendaires entre deux dates AAAA-MM-JJ. */
export function ecartJours(de, a) {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86400000);
}

const MOIS_COURTS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

/** « 11 nov », « 1er janv ». */
export function dateCourte(dateStr) {
  const [, m, j] = dateStr.split('-').map(Number);
  return `${j === 1 ? '1er' : j} ${MOIS_COURTS[m - 1]}`;
}

/** Numéro de jour stable (jours depuis le 1/1/1970) pour les sélections déterministes. */
export function numeroJour(dateStr) {
  return Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
}

const JOURS_NOMS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** Jour de la semaine (0 = dimanche) d'une date AAAA-MM-JJ. */
export const jourSemaine = (dateStr) => new Date(dateStr + 'T12:00:00Z').getUTCDay();
/** « lundi », « mardi »… */
export const nomJour = (dateStr) => JOURS_NOMS[jourSemaine(dateStr)];
export const NOMS_JOURS = JOURS_NOMS;
