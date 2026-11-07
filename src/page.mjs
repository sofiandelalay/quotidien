// Données de la page de détail (data.json, publié sur GitHub Pages, donc PUBLIC).
// Construites par liste blanche : chaque champ est recopié explicitement. Jamais d'agenda,
// d'anniversaire, de coordonnées, de sujet ntfy ni de lien ICS — seulement le nom de commune.
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { texteCreneaux } from './pluie.mjs';
import { motAir, NOMS_POLLENS } from './analyse.mjs';
import { choisirConseil } from './conseil.mjs';
import { emojiMeteo } from './briefing.mjs';
import { ecartJours } from './temps.mjs';

const nombre = (v, dec = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** dec) / 10 ** dec : null);
const texte = (v, max = 4000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const heureHHMM = (v) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);

/**
 * @param {object} d  données du jour (collecterJour) ; les champs non listés ici sont ignorés
 * @param {{ genere: Date, passage: string, cfg: object }} o
 */
export function construireDonneesPage(d, { genere, passage, cfg }) {
  const m = d.meteo;
  const a = d.air;
  const seuils = cfg.pollens.seuils;
  return {
    version: 1,
    genere: genere.toISOString(),
    jour: d.jour,
    passage,
    commune: texte(d.commune, 80) ?? 'Ma position',
    meteo: m
      ? {
          emoji: emojiMeteo(m.code, m.creneaux.length > 0),
          min: nombre(m.min, 0),
          max: nombre(m.max, 0),
          pluie: texteCreneaux(m.creneaux, cfg.pluie.creneaux_max),
          cumul: nombre(m.cumul),
          vent_max: nombre(m.ventMax, 0),
          rafales_max: nombre(m.rafalesMax, 0),
          uv_max: nombre(m.uvMax, 0),
          lever: heureHHMM(m.lever),
          coucher: heureHHMM(m.coucher),
          heures: m.heures.map((h) => ({ h: h.heure, temp: nombre(h.temp, 0), mm: nombre(h.mm) ?? 0, proba: nombre(h.proba, 0) ?? 0 })),
        }
      : null,
    conseil: choisirConseil(m, a, cfg),
    air: a
      ? {
          indice: nombre(a.aqiMax, 0),
          mot: motAir(a.aqiMax, cfg.air.niveaux),
          pm10: nombre(a.pm10Max, 0),
          pm25: nombre(a.pm25Max, 0),
          pollens: Object.entries(a.pollens ?? {})
            .filter(([, v]) => typeof v === 'number' && v > 0)
            .map(([nom, v]) => ({ nom: NOMS_POLLENS[nom] ?? nom, valeur: nombre(v, 0), notable: seuils[nom] !== undefined && v >= seuils[nom] })),
        }
      : null,
    ferie: d.ferie ? { nom: texte(d.ferie.nom, 60), date: d.ferie.date, dans: ecartJours(d.jour, d.ferie.date) } : null,
    fete: texte(d.fete, 80),
    verset: d.verset?.ar && d.verset?.fr
      ? { ref: String(d.verset.ref), ar: texte(d.verset.ar, 1000), fr: texte(d.verset.fr, 1000), sourate: texte(d.verset.sourate, 60), sourate_ar: texte(d.verset.sourateAr, 60) }
      : null,
    hadith: d.hadith?.texte ? { numero: d.hadith.numero, texte: texte(d.hadith.texte, 4000), source: texte(d.hadith.source, 200) } : null,
  };
}

export async function ecrireDonneesPage(dossier, donnees) {
  await mkdir(dossier, { recursive: true });
  await writeFile(join(dossier, 'data.json'), JSON.stringify(donnees) + '\n');
}
