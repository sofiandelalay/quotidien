// Agenda du briefing : lit les liens ICS secrets (CALENDAR_URLS, une ligne « libellé|url_ics »),
// garde les événements hors travail d'aujourd'hui et de demain matin, met les anniversaires à part.
// Les événements ne vont que dans la notification : jamais dans un log, un fichier ou la page.
import { lireIcs, occurrences } from './ics.mjs';
import { instantParis, ajouterJours, paris } from './temps.mjs';

/** « libellé|url » par ligne → [{ libelle, url }] ; lignes vides et commentaires ignorés. */
export function lireCalendarUrls(texte = '') {
  return texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l, i) => {
      const k = l.indexOf('|');
      const libelle = k > 0 ? l.slice(0, k).trim() : `Agenda ${i + 1}`;
      const url = (k > 0 ? l.slice(k + 1) : l).trim().replace(/^webcals?:\/\//i, 'https://');
      return { libelle, url };
    })
    .filter((a) => /^https:\/\//i.test(a.url));
}

/** Minuscules sans accents, pour comparer titres et mots-clés. */
export const normaliser = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function contientMot(titre, mot) {
  const t = normaliser(titre);
  const m = normaliser(mot).trim();
  if (!m) return false;
  const echappe = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${echappe}($|[^\\p{L}\\p{N}])`, 'u').test(t);
}

/** Événement d'anniversaire : toute la journée, et agenda d'anniversaires ou titre explicite. */
export function estAnniversaire(occ, libelle, reglage) {
  if (!reglage?.actif || !occ.journee) return false;
  const agendas = (reglage.agendas ?? []).map(normaliser);
  return agendas.includes(normaliser(libelle)) || /anniversaire|birthday|\banniv\b/.test(normaliser(occ.titre));
}

const VOYELLE = /^[aeiouyàâäéèêëîïôöùûüœæ]/i;

/** « Anniversaire de Marie », « Alice Martin's birthday », « 🎂 Paul (40 ans) » → « Marie », « Alice Martin », « Paul » */
export function nomAnniversaire(titre) {
  let t = titre.replace(/[\u{1F380}-\u{1F3FF}\u{1F900}-\u{1F9FF}☀-➿️]/gu, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*\((?:\d+\s*ans?|\d+)\)\s*$/i, '').trim(); // « (40 ans) »
  const motifs = [
    /^(?:joyeux\s+|bon\s+)?anniv(?:ersaire)?\s*(?:de\s+|d['’]\s*|du\s+|des\s+|:\s*|-\s*|–\s*)?(.+)$/i,
    /^(.+?)['’]s\s+birthday$/i,
    /^birthday\s*(?:of\s+|:\s*|-\s*)?(.+)$/i,
    /^(.+?)\s*[-–:]\s*anniv(?:ersaire)?$/i,
    /^(.+?)\s+\(anniv(?:ersaire)?\)$/i,
  ];
  for (const m of motifs) {
    const r = t.match(m);
    if (r && r[1].trim()) return r[1].trim();
  }
  return t;
}

export const ligneAnniversaire = (nom) => `🎂 Anniversaire ${VOYELLE.test(nom) ? "d'" : 'de '}${nom}`;

const heureCourte = (date) => {
  const { heure, minute } = paris(date);
  return minute ? `${heure}h${String(minute).padStart(2, '0')}` : `${heure}h`;
};
/** Coupe à n caractères au plus, à la fin d'un mot si possible. */
function couper(s, n) {
  if (s.length <= n) return s;
  let t = s.slice(0, n - 1);
  const espace = t.lastIndexOf(' ');
  if (espace > n / 2) t = t.slice(0, espace);
  return t.replace(/[\s,;:(–-]+$/, '') + '…';
}

/**
 * Trie et met en forme les occurrences des agendas.
 * @param {{libelle: string, occurrences: object[]}[]} agendas
 * @param {string} jour AAAA-MM-JJ (Paris)
 * @param {object} cfg config.agenda
 * @returns {{ anniversaires: string[], lignes: string[] }}  anniversaires en tête, hors limite
 */
export function composerAgenda(agendas, jour, cfg) {
  const demain = ajouterJours(jour, 1);
  const debutJour = instantParis(jour, '00:00');
  const debutDemain = instantParis(demain, '00:00');
  const finDemainMatin = instantParis(demain, cfg.demain_matin_jusqua ?? '12:00');
  const ignores = (cfg.ignorer_agendas ?? []).map(normaliser);
  const motsCles = cfg.ignorer_mots_cles ?? [];

  const anniversaires = new Map(); // nom normalisé → ligne (dédoublonnage entre agendas)
  const aujourdhui = [];
  const demainMatin = [];
  const vus = new Set();

  for (const { libelle, occurrences: occs } of agendas) {
    if (ignores.includes(normaliser(libelle))) continue;
    for (const o of occs) {
      if (estAnniversaire(o, libelle, cfg.anniversaires)) {
        if (o.dateDebut <= jour && jour < o.dateFin) {
          const nom = nomAnniversaire(o.titre);
          anniversaires.set(normaliser(nom), ligneAnniversaire(nom));
        }
        continue;
      }
      if (cfg.ignorer_visio && o.visio) continue; // réunion Teams, Zoom, Meet…
      if (motsCles.some((m) => contientMot(o.titre, m))) continue;
      const cle = `${normaliser(o.titre)}|${o.journee ? o.dateDebut : o.debut.getTime()}`;
      if (vus.has(cle)) continue; // même événement dans deux agendas
      vus.add(cle);
      if (o.journee) {
        if (o.dateDebut <= jour && jour < o.dateFin) aujourdhui.push(o);
      } else if (o.debut >= debutJour && o.debut < debutDemain) aujourdhui.push(o);
      else if (o.debut >= debutDemain && o.debut < finDemainMatin) demainMatin.push(o);
    }
  }

  const tri = (a, b) => Number(b.journee) - Number(a.journee) || a.debut - b.debut;
  aujourdhui.sort(tri);
  demainMatin.sort(tri);
  const max = cfg.lignes_max ?? 3;
  const longueur = cfg.longueur_titre ?? 40;
  let lignes = [];

  if (cfg.detail === 'nombre') {
    const morceaux = [];
    if (aujourdhui.length) morceaux.push(`${aujourdhui.length} aujourd'hui`);
    if (demainMatin.length) morceaux.push(`${demainMatin.length} demain matin`);
    if (morceaux.length) lignes = [`Agenda : ${morceaux.join(', ')}`];
  } else {
    const toutes = [
      ...aujourdhui.map((o) => (o.journee ? `Aujourd'hui : ${couper(o.titre, longueur)}` : `${heureCourte(o.debut)} ${couper(o.titre, longueur)}`)),
      ...demainMatin.map((o) => `Demain ${heureCourte(o.debut)} ${couper(o.titre, longueur)}`),
    ];
    lignes = toutes.length <= max ? toutes : [...toutes.slice(0, max - 1), `+ ${toutes.length - (max - 1)} autres événements`];
  }
  return { anniversaires: [...anniversaires.values()], lignes };
}

/** Fenêtre d'agenda : aujourd'hui 0h → demain midi (Paris). */
export function fenetreAgenda(jour, cfg) {
  return { debut: instantParis(jour, '00:00'), fin: instantParis(ajouterJours(jour, 1), cfg.demain_matin_jusqua ?? '12:00') };
}

/**
 * Télécharge et lit tous les agendas. Une erreur sur un agenda n'empêche pas les autres.
 * @returns {Promise<{ agendas: {libelle, occurrences}[], echecs: string[] }>}
 */
export async function lireAgendas(calendriers, jour, cfg, { fetcher = fetch } = {}) {
  const fenetre = fenetreAgenda(jour, cfg);
  const echecs = [];
  const agendas = await Promise.all(
    calendriers.map(async ({ libelle, url }) => {
      try {
        const res = await fetcher(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'text/calendar' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const texte = await res.text();
        if (!texte.includes('BEGIN:VCALENDAR')) throw new Error("réponse qui n'est pas un agenda ICS");
        return { libelle, occurrences: occurrences(lireIcs(texte), fenetre) };
      } catch (e) {
        echecs.push(`agenda « ${libelle} » (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message})`);
        return { libelle, occurrences: [] };
      }
    }),
  );
  return { agendas, echecs };
}

