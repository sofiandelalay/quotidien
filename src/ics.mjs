// Lecture des agendas ICS (Outlook.com, Google) et calcul des occurrences dans une fenêtre.
// Gère : lignes pliées, échappements, fuseaux IANA et Windows (« Romance Standard Time »),
// dates « toute la journée », RRULE (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL,
// BYDAY avec rang, BYMONTHDAY, BYMONTH, BYSETPOS, WKST), EXDATE, RECURRENCE-ID (occurrence
// modifiée ou annulée) et STATUS:CANCELLED. Rien n'est jamais logué ici.
import { fuseauValide, instantDans, ajouterJours, dans, FUSEAU } from './temps.mjs';

// Fuseaux Windows (Outlook) → IANA. Liste CLDR « windowsZones », zones courantes.
export const FUSEAUX_WINDOWS = {
  'Romance Standard Time': 'Europe/Paris',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'UTC': 'UTC',
  'Coordinated Universal Time': 'UTC',
  'tzone://Microsoft/Utc': 'UTC',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Russian Standard Time': 'Europe/Moscow',
  'Morocco Standard Time': 'Africa/Casablanca',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'Egypt Standard Time': 'Africa/Cairo',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Arab Standard Time': 'Asia/Riyadh',
  'Arabian Standard Time': 'Asia/Dubai',
  'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Atlantic Standard Time': 'America/Halifax',
  'SA Pacific Standard Time': 'America/Bogota',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Canada Central Standard Time': 'America/Regina',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
};

/** TZID d'un agenda → fuseau IANA utilisable (Europe/Paris si inconnu). */
export function resoudreFuseau(tzid) {
  if (!tzid) return FUSEAU;
  const t = tzid.replace(/^"|"$/g, '').trim();
  if (FUSEAUX_WINDOWS[t]) return FUSEAUX_WINDOWS[t];
  if (fuseauValide(t)) return t;
  const m = t.match(/([A-Za-z_]+\/[A-Za-z_]+)$/); // « /mozilla.org/20050126_1/Europe/Paris »
  if (m && fuseauValide(m[1])) return m[1];
  const sansSuffixe = t.replace(/ \(.*\)$/, ''); // « Romance Standard Time (Paris) »
  if (FUSEAUX_WINDOWS[sansSuffixe]) return FUSEAUX_WINDOWS[sansSuffixe];
  return FUSEAU;
}

// --- Lecture du texte ---------------------------------------------------------------------

/** Déplie les lignes (RFC 5545 §3.1) et découpe chaque propriété. */
export function lireLignes(texte) {
  const brutes = texte.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lignes = [];
  for (const l of brutes) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && lignes.length) lignes[lignes.length - 1] += l.slice(1);
    else if (l.trim()) lignes.push(l);
  }
  return lignes.map((l) => {
    // nom;param=val;param="v:al":valeur — le premier « : » hors guillemets sépare la valeur
    let i = 0;
    let guillemets = false;
    for (; i < l.length; i++) {
      if (l[i] === '"') guillemets = !guillemets;
      else if (l[i] === ':' && !guillemets) break;
    }
    const tete = l.slice(0, i);
    const valeur = l.slice(i + 1);
    const [nom, ...params] = tete.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const p = {};
    for (const x of params) {
      const k = x.indexOf('=');
      if (k > 0) p[x.slice(0, k).toUpperCase()] = x.slice(k + 1).replace(/^"|"$/g, '');
    }
    return { nom: nom.toUpperCase(), params: p, valeur };
  });
}

export const texteIcs = (v) => v.replace(/\\[nN]/g, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();

/** Date ou date-heure ICS → { date: 'AAAA-MM-JJ', heure: 'hh:mm:ss' | null, fuseau: IANA | 'UTC' } */
export function lireDate(valeur, params = {}) {
  const m = valeur.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4] || params.VALUE === 'DATE') return { date, heure: null, fuseau: null };
  return { date, heure: `${m[4]}:${m[5]}:${m[6] ?? '00'}`, fuseau: m[7] ? 'UTC' : resoudreFuseau(params.TZID) };
}

const instantDe = (d) => instantDans(d.fuseau, d.date, d.heure);

function lireDuree(v) {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, signe, w = 0, d = 0, h = 0, mi = 0, s = 0] = m;
  return (signe === '-' ? -1 : 1) * ((((+w * 7 + +d) * 24 + +h) * 60 + +mi) * 60 + +s) * 1000;
}

export function lireRrule(v) {
  const r = Object.fromEntries(v.split(';').filter(Boolean).map((x) => x.split('=')).map(([k, val]) => [k.toUpperCase(), val]));
  const liste = (x) => (x ? x.split(',').map((s) => s.trim()).filter(Boolean) : null);
  return {
    freq: r.FREQ,
    intervalle: Math.max(1, Number(r.INTERVAL ?? 1)),
    nombre: r.COUNT ? Number(r.COUNT) : null,
    jusqua: r.UNTIL ? lireDate(r.UNTIL, {}) : null,
    parJour: liste(r.BYDAY)?.map((x) => {
      const m = x.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/i);
      return m ? { rang: m[1] ? Number(m[1]) : null, jour: CODES_JOURS.indexOf(m[2].toUpperCase()) } : null;
    }).filter(Boolean) ?? null,
    parJourDuMois: liste(r.BYMONTHDAY)?.map(Number) ?? null,
    parMois: liste(r.BYMONTH)?.map(Number) ?? null,
    parPosition: liste(r.BYSETPOS)?.map(Number) ?? null,
    debutSemaine: CODES_JOURS.indexOf((r.WKST ?? 'MO').toUpperCase()),
    nonGere: Boolean(r.BYYEARDAY || r.BYWEEKNO || r.BYHOUR || r.BYMINUTE || (r.FREQ && !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.FREQ))),
  };
}
const CODES_JOURS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // index = getUTCDay()

/** Lit un agenda ICS : liste d'événements bruts (maîtres et occurrences modifiées). */
export function lireIcs(texte) {
  const evenements = [];
  let courant = null;
  let profondeur = 0; // composants imbriqués dans VEVENT (VALARM…)
  for (const { nom, params, valeur } of lireLignes(texte)) {
    if (nom === 'BEGIN' && valeur.toUpperCase() === 'VEVENT') {
      courant = { exdates: [], params: {} };
      profondeur = 0;
      continue;
    }
    if (!courant) continue;
    if (nom === 'BEGIN') {
      profondeur++;
      continue;
    }
    if (nom === 'END') {
      if (profondeur > 0) profondeur--;
      else if (valeur.toUpperCase() === 'VEVENT') {
        if (courant.debut) evenements.push(courant);
        courant = null;
      }
      continue;
    }
    if (profondeur > 0) continue;
    switch (nom) {
      case 'UID': courant.uid = valeur.trim(); break;
      case 'SUMMARY': courant.titre = texteIcs(valeur); break;
      case 'DTSTART': courant.debut = lireDate(valeur, params); break;
      case 'DTEND': courant.fin = lireDate(valeur, params); break;
      case 'DURATION': courant.duree = lireDuree(valeur.trim()); break;
      case 'RRULE': courant.rrule = lireRrule(valeur.trim()); break;
      case 'EXDATE': for (const v of valeur.split(',')) { const d = lireDate(v, params); if (d) courant.exdates.push(d); } break;
      case 'RECURRENCE-ID': courant.recurrenceId = lireDate(valeur, params); break;
      case 'STATUS': courant.statut = valeur.trim().toUpperCase(); break;
      case 'TRANSP': courant.transparent = valeur.trim().toUpperCase() === 'TRANSPARENT'; break;
    }
  }
  return evenements;
}

// --- Récurrences ----------------------------------------------------------------------------

const jourSem = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
const joursDansMois = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const dateDe = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

/** Jours (AAAA-MM-JJ, triés) d'un mois correspondant à la règle MONTHLY/YEARLY. */
function joursDuMois(a, m, r, jourDebut) {
  const n = joursDansMois(a, m);
  let jours;
  if (r.parJourDuMois) {
    jours = r.parJourDuMois.map((x) => (x > 0 ? x : n + x + 1)).filter((x) => x >= 1 && x <= n);
    if (r.parJour) jours = jours.filter((j) => r.parJour.some((b) => b.jour === jourSem(dateDe(a, m, j))));
  } else if (r.parJour) {
    jours = [];
    for (const { rang, jour } of r.parJour) {
      const tous = [];
      for (let j = 1; j <= n; j++) if (jourSem(dateDe(a, m, j)) === jour) tous.push(j);
      if (rang === null) jours.push(...tous);
      else {
        const x = rang > 0 ? tous[rang - 1] : tous[tous.length + rang];
        if (x) jours.push(x);
      }
    }
  } else {
    jours = jourDebut <= n ? [jourDebut] : []; // le 31 ou le 29 février : mois sautés (RFC 5545)
  }
  jours = [...new Set(jours)].sort((x, y) => x - y);
  if (r.parPosition) {
    const choisis = r.parPosition.map((p) => (p > 0 ? jours[p - 1] : jours[jours.length + p])).filter(Boolean);
    jours = [...new Set(choisis)].sort((x, y) => x - y);
  }
  return jours.map((j) => dateDe(a, m, j));
}

/**
 * Dates (dans le calendrier de l'événement) des occurrences d'une RRULE, de DTSTART à `jusquaDate` inclus.
 * `estAvantFin(date)` permet d'appliquer UNTIL en tenant compte de l'heure.
 */
export function datesRecurrence(r, debutDate, jusquaDate, estAvantFin = () => true) {
  const res = [];
  if (r.nonGere) return [debutDate];
  const [a0, m0, j0] = debutDate.split('-').map(Number);
  let compte = 0;
  const garder = (d) => {
    if (d < debutDate) return true;
    if (!estAvantFin(d)) return false;
    compte++;
    if (r.nombre && compte > r.nombre) return false;
    if (d > jusquaDate) return false;
    res.push(d);
    return true;
  };
  const moisOk = (d) => !r.parMois || r.parMois.includes(Number(d.slice(5, 7)));
  const LIMITE = 50000;

  if (r.freq === 'DAILY') {
    for (let k = 0, d = debutDate; k < LIMITE; k++, d = ajouterJours(debutDate, k * r.intervalle)) {
      if (moisOk(d) && (!r.parJour || r.parJour.some((b) => b.jour === jourSem(d)))) if (!garder(d)) break;
      if (d > jusquaDate) break;
    }
  } else if (r.freq === 'WEEKLY') {
    const jours = r.parJour ? r.parJour.map((b) => b.jour) : [jourSem(debutDate)];
    const recul = (jourSem(debutDate) - r.debutSemaine + 7) % 7;
    const semaine0 = ajouterJours(debutDate, -recul);
    for (let k = 0; k < LIMITE; k++) {
      const debutSem = ajouterJours(semaine0, k * 7 * r.intervalle);
      if (debutSem > jusquaDate) break;
      const dates = jours.map((j) => ajouterJours(debutSem, (j - r.debutSemaine + 7) % 7)).filter(moisOk).sort();
      let continuer = true;
      for (const d of dates) if (!(continuer = garder(d))) break;
      if (!continuer) break;
    }
  } else if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') {
    const pas = r.freq === 'MONTHLY' ? r.intervalle : 12 * r.intervalle;
    for (let k = 0; k < LIMITE; k++) {
      const indexAnnee = k * pas;
      const base = new Date(Date.UTC(a0, m0 - 1 + indexAnnee, 1));
      const a = base.getUTCFullYear();
      if (`${a}-01-01` > jusquaDate && r.freq === 'YEARLY') break;
      const moisPeriode = r.freq === 'YEARLY' ? (r.parMois ?? [m0]) : [base.getUTCMonth() + 1];
      if (r.freq === 'MONTHLY' && dateDe(a, moisPeriode[0], 1) > jusquaDate) break;
      let continuer = true;
      for (const m of moisPeriode) {
        if (r.freq === 'MONTHLY' && !moisOk(dateDe(a, m, 1))) continue;
        for (const d of joursDuMois(a, m, r, j0)) if (!(continuer = garder(d))) break;
        if (!continuer) break;
      }
      if (!continuer) break;
    }
  } else {
    return [debutDate];
  }
  return res;
}

// --- Occurrences dans une fenêtre --------------------------------------------------------------

/**
 * Occurrences des événements qui touchent la fenêtre.
 * @param {object[]} evenements résultat de lireIcs
 * @param {{debut: Date, fin: Date}} fenetre instants
 * @returns {{titre, journee: boolean, debut: Date, fin: Date, dateDebut: string, dateFin: string}[]}
 *          journee = toute la journée ; dateDebut/dateFin (exclue) en dates calendaires pour ces événements
 */
export function occurrences(evenements, fenetre) {
  const res = [];
  const modifiees = new Map(); // uid → Set des RECURRENCE-ID (en ms ou en date)
  for (const e of evenements) {
    if (!e.recurrenceId) continue;
    const cle = e.recurrenceId.heure ? String(instantDe(e.recurrenceId).getTime()) : e.recurrenceId.date;
    if (!modifiees.has(e.uid)) modifiees.set(e.uid, new Set());
    modifiees.get(e.uid).add(cle);
  }
  // Dates limites, avec une marge d'un jour pour les fuseaux lointains et les longs événements.
  const dateMax = ajouterJours(dans('UTC', fenetre.fin).date, 1);

  for (const e of evenements) {
    if (e.statut === 'CANCELLED') continue;
    const journee = !e.debut.heure; // DTSTART;VALUE=DATE (Outlook et Google l'utilisent pour « toute la journée »)
    const titre = e.titre || '(sans titre)';

    // Durée de l'événement
    let dureeMs;
    let dureeJours = 1;
    if (journee) {
      if (e.fin) dureeJours = Math.max(1, Math.round((Date.parse(e.fin.date) - Date.parse(e.debut.date)) / 86400000));
      else if (e.duree) dureeJours = Math.max(1, Math.round(e.duree / 86400000));
    } else {
      dureeMs = e.fin?.heure ? instantDe(e.fin) - instantDe(e.debut) : (e.duree ?? 0);
    }

    let dates = [e.debut.date];
    if (e.rrule && !e.recurrenceId) {
      const r = e.rrule;
      const estAvantFin = (d) => {
        if (!r.jusqua) return true;
        if (journee || !r.jusqua.heure) return d <= r.jusqua.date;
        return instantDans(e.debut.fuseau, d, e.debut.heure) <= instantDe(r.jusqua);
      };
      dates = datesRecurrence(r, e.debut.date, dateMax, estAvantFin);
    }
    const exclues = new Set(e.exdates.map((x) => (x.heure && !journee ? String(instantDe(x).getTime()) : x.date)));
    const remplacees = e.recurrenceId ? new Set() : (modifiees.get(e.uid) ?? new Set());

    for (const d of dates) {
      if (journee) {
        if (exclues.has(d) || remplacees.has(d)) continue;
        const dateFin = ajouterJours(d, dureeJours);
        // fenêtre : dates de Paris
        const debutF = dans(FUSEAU, fenetre.debut).date;
        const finF = dans(FUSEAU, new Date(fenetre.fin.getTime() - 1)).date;
        if (dateFin <= debutF || d > finF) continue;
        res.push({ titre, journee: true, dateDebut: d, dateFin, debut: instantDans(FUSEAU, d, '00:00'), fin: instantDans(FUSEAU, dateFin, '00:00') });
      } else {
        const debut = instantDans(e.debut.fuseau, d, e.debut.heure);
        const cle = String(debut.getTime());
        if (exclues.has(cle) || remplacees.has(cle)) continue;
        const fin = new Date(debut.getTime() + dureeMs);
        if (fin <= fenetre.debut && dureeMs > 0) continue;
        if (debut >= fenetre.fin || (dureeMs <= 0 && debut < fenetre.debut)) continue;
        res.push({ titre, journee: false, debut, fin });
      }
    }
  }
  return res.sort((a, b) => a.debut - b.debut || Number(b.journee) - Number(a.journee));
}
