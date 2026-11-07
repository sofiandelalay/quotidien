// Point d'entrée : node src/main.mjs --passage matin [--force] [--dry-run] [--fixtures dossier] [--maintenant ISO]
// Les logs GitHub d'un dépôt public sont publics : on n'y écrit ni sujet ntfy, ni position,
// ni contenu de notification (l'agenda y figurera) — seulement l'état des sources.
import { readFile } from 'node:fs/promises';
import { chargerConfig } from './config.mjs';
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { decider } from './fenetre.mjs';
import { lireEtat, ecrireEtat, purger } from './etat.mjs';
import { positionActuelle } from './position.mjs';
import * as src from './sources.mjs';
import { resumerMeteo, resumerAir } from './analyse.mjs';
import { composerBriefing } from './briefing.mjs';
import { construireMessage, publier } from './ntfy.mjs';
import { paris } from './temps.mjs';

const { values: opts } = parseArgs({
  options: {
    passage: { type: 'string', default: 'matin' },
    force: { type: 'boolean', default: process.env.FORCE === 'true' },
    'dry-run': { type: 'boolean', default: false },
    fixtures: { type: 'string' },
    maintenant: { type: 'string' },
  },
});

/** Exécute une récupération ; en cas d'échec, note la source et renvoie null. */
async function sur(nom, promesse, echecs) {
  try {
    return await promesse;
  } catch (e) {
    echecs.push(`${nom} (${e.name === 'TimeoutError' ? 'délai dépassé' : e.message})`);
    return null;
  }
}

/** Lecteur de fixtures pour --fixtures : associe chaque URL à un fichier local. */
function lecteurFixtures(dossier) {
  const table = [
    [/air-quality-api\.open-meteo\.com/, 'air.json'], // avant la prévision : son hôte contient « api.open-meteo.com »
    [/\/\/api\.open-meteo\.com/, 'prevision.json'],
    [/date\.nager\.at.*\/(\d{4})\/FR/, (m) => `feries-${m[1]}.json`],
    [/geo\.api\.gouv\.fr/, 'commune.json'],
    [/nameday\.abalin\.net/, 'fete.json'],
    [/alquran\.cloud/, 'verset.json'],
  ];
  return async (url) => {
    for (const [re, f] of table) {
      const m = url.match(re);
      if (m) return JSON.parse(await readFile(join(dossier, typeof f === 'function' ? f(m) : f), 'utf8'));
    }
    throw new Error('pas de fixture');
  };
}

async function passageMatin({ cfg, jour, get }) {
  const echecs = [];
  const pos = await positionActuelle(cfg);
  const [prev, air, ferie, nomCommune, fete, verset, hadith] = await Promise.all([
    sur('météo', src.prevision(pos, get), echecs),
    sur('air', src.qualiteAir(pos, get), echecs),
    sur('fériés', src.prochainFerie(jour, get), echecs),
    sur('commune', src.commune(pos, get), echecs),
    sur('fête', src.fete(jour, get), echecs),
    sur('verset', src.verset(jour, get), echecs),
    sur('hadith', src.hadith(jour), echecs),
  ]);
  const meteo = prev ? await sur('météo (analyse)', Promise.resolve().then(() => resumerMeteo(prev, jour, cfg)), echecs) : null;
  const resumeAir = air ? await sur('air (analyse)', Promise.resolve().then(() => resumerAir(air, jour, cfg)), echecs) : null;
  const commune = nomCommune ?? (pos.source === 'defaut' ? pos.nomParDefaut : 'Ma position');

  const donnees = { jour, commune, meteo, air: resumeAir, ferie, fete, agenda: [], verset, hadith };
  return { briefing: composerBriefing(donnees, cfg), echecs };
}

async function main() {
  const maintenant = opts.maintenant ? new Date(opts.maintenant) : new Date();
  const cfg = await chargerConfig();
  const reglage = cfg.passages[opts.passage];
  if (!reglage) throw new Error(`passage inconnu : ${opts.passage}`);

  const etat = await lireEtat();
  const decision = decider({ maintenant, reglage, nom: opts.passage, etat, force: opts.force });
  console.log(`Passage « ${opts.passage} » du ${decision.jour} à ${paris(maintenant).hhmm} (Paris) : ${decision.executer ? 'exécution' : 'rien à faire'} — ${decision.raison}.`);
  if (!decision.executer) return;

  const get = opts.fixtures ? lecteurFixtures(opts.fixtures) : undefined;
  const { briefing, echecs } = await passageMatin({ cfg, jour: decision.jour, get });
  console.log(echecs.length ? `Sources indisponibles (lignes omises) : ${echecs.join(' ; ')}` : 'Toutes les sources ont répondu.');
  console.log(`Notification : titre + ${briefing.lignes.length} ligne(s).`);

  const topic = process.env.NTFY_TOPIC_BRIEFING;
  const payload = construireMessage({
    topic: topic ?? '(sujet)',
    titre: briefing.titre,
    message: briefing.message,
    livraison: decision.livraison,
    priorite: cfg.notification.priorite,
    lien: cfg.notification.lien,
  });

  if (opts['dry-run']) {
    console.log('\n--- Simulation : rien n\'est envoyé ---');
    console.log(briefing.titre);
    console.log(briefing.message);
    console.log(`(livraison : ${decision.livraison ? decision.livraison.toISOString() : 'immédiate'})`);
    return;
  }
  if (!topic) throw new Error('NTFY_TOPIC_BRIEFING manquant');

  const rep = await publier(payload);
  const prevu = rep.time ? paris(new Date(rep.time * 1000)).hhmm : '?';
  console.log(`Envoyé à ntfy (id ${rep.id}), ${decision.livraison ? `livraison programmée à ${prevu} (Paris)` : `livré à ${prevu} (Paris)`}.`);

  // Mise à jour de l'état seulement après un envoi réussi. Un envoi forcé ne compte pas
  // comme le passage du jour (le briefing programmé partira quand même).
  const nouvel = purger(etat, maintenant, cfg.state.purge_jours);
  if (!opts.force) nouvel.passages = { ...nouvel.passages, [opts.passage]: decision.jour };
  nouvel.dernier_passage = maintenant.toISOString();
  await ecrireEtat(nouvel);
}

main().catch((e) => {
  console.error(`Échec : ${e.message}`);
  process.exitCode = 1;
});
