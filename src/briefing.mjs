// Composition de la notification du matin (fonction pure).
// Ordre (Claude.md, « Briefing du matin ») : titre, pluie/vent/UV, air/pollens, férié, fête,
// agenda (≤ 3 lignes), conseil (seulement s'il est utile). Lignes vides omises.
import { texteCreneaux } from './pluie.mjs';
import { motAir, pollensNotables } from './analyse.mjs';
import { choisirConseil, deg } from './conseil.mjs';
import { dateCourte, ecartJours } from './temps.mjs';

/** Emoji selon le code météo WMO du jour et la présence de pluie en journée. */
export function emojiMeteo(code, pluie) {
  if ([95, 96, 99].includes(code)) return '⛈️';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄️';
  if (pluie) return '☂️';
  if (code === 45 || code === 48) return '🌫️';
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  return '☁️';
}

const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function ligneFerie(ferie, jour, horizon) {
  if (!ferie) return null;
  const n = ecartJours(jour, ferie.date);
  if (n < 0 || n > horizon) return null;
  if (n === 0) return `${ferie.nom} · aujourd'hui`;
  if (n === 1) return `${ferie.nom} · demain`;
  return `${ferie.nom} · ${dateCourte(ferie.date)} · dans ${n} j`;
}

/**
 * @param {object} d  données du jour : { jour, commune, meteo, air, ferie, fete, agenda, verset }
 *                    (chaque champ peut être null si la source a échoué)
 * @param {object} cfg config complète
 * @returns {{titre: string, lignes: string[], message: string}}
 */
export function composerBriefing(d, cfg) {
  const m = d.meteo;
  const pluie = m ? texteCreneaux(m.creneaux, cfg.pluie.creneaux_max) : null;

  // 1. Titre
  let titre;
  if (m) {
    const premier = m.creneaux.length && m.creneaux.length <= cfg.pluie.creneaux_max ? texteCreneaux(m.creneaux.slice(0, 1), 1) : pluie;
    titre = `${emojiMeteo(m.code, m.creneaux.length > 0)} ${d.commune} ${deg(m.min)}–${deg(m.max)}°${premier ? ` · pluie ${premier}` : ''}`;
  } else {
    titre = `${d.commune} · météo indisponible`;
  }

  const lignes = [];

  // 2. Pluie, vent, UV
  if (m) {
    const morceaux = [];
    if (pluie) morceaux.push(`pluie ${pluie}${m.cumul >= 1 ? ` (${Math.round(m.cumul)} mm)` : ''}`);
    if (m.ventMax != null) {
      let vent = `vent ${Math.round(m.ventMax)} km/h`;
      if (m.rafalesMax != null && m.rafalesMax >= cfg.vent.rafales_affichees) vent += `, rafales ${Math.round(m.rafalesMax)}`;
      morceaux.push(vent);
    }
    if (m.uvMax != null && m.uvMax >= cfg.uv.affiche_a_partir_de) morceaux.push(`UV ${Math.round(m.uvMax)}`);
    if (morceaux.length) lignes.push(majuscule(morceaux.join(' · ')));
  }

  // 3. Air, pollens
  if (d.air) {
    const mot = motAir(d.air.aqiMax, cfg.air.niveaux);
    const pollens = pollensNotables(d.air.pollens ?? {}, cfg.pollens.seuils);
    const morceaux = [];
    if (mot) morceaux.push(`Air ${mot}`);
    if (pollens.length) morceaux.push(`pollens : ${pollens.join(', ')}`);
    if (morceaux.length) lignes.push(majuscule(morceaux.join(' · ')));
  } else {
    lignes.push('Air : indisponible');
  }

  // 4. Prochain férié
  const ferie = ligneFerie(d.ferie, d.jour, cfg.feries.horizon_jours);
  if (ferie) lignes.push(ferie);

  // 5. Fête
  if (d.fete) lignes.push(`Fête : ${d.fete}`);

  // 6. Agenda
  for (const l of (d.agenda ?? []).slice(0, cfg.agenda.lignes_max)) lignes.push(l);

  // 7. Conseil
  const conseil = choisirConseil(m, d.air, cfg);
  if (conseil) lignes.push(conseil);

  // Option : verset (désactivé par défaut, il est sur la page)
  if (cfg.notification.verset && d.verset) lignes.push(`${d.verset.fr} (${d.verset.ref})`);

  return { titre, lignes, message: lignes.join('\n') };
}
