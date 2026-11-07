// Point d'entrée : node src/main.mjs [--passage auto|matin|soir] [--force] [--dry-run] [--fixtures dossier] [--maintenant ISO]
//
// Les logs GitHub d'un dépôt public sont publics : on n'y écrit ni sujet ntfy, ni position,
// ni lien ou événement d'agenda, ni contenu du briefing — seulement l'état des sources et des règles.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerConfig } from './config.mjs';
import { decider, passageDuMoment } from './fenetre.mjs';
import { lireEtat, ecrireEtat, purger } from './etat.mjs';
import { positionActuelle } from './position.mjs';
import * as src from './sources.mjs';
import { resumerMeteo, resumerAir } from './analyse.mjs';
import { composerBriefing } from './briefing.mjs';
import { chargerRegles, creerContexte, evaluerRegles } from './regles.mjs';
import { lireCalendarUrls, lireAgendas, composerAgenda } from './agenda.mjs';
import { construireMessage, publier } from './ntfy.mjs';
import { paris } from './temps.mjs';

/** Exécute une récupération ; en cas d'échec, note la source et renvoie null. */
export async function sur(nom, promesse, echecs) {
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

/** Prépare le briefing du matin (notification à composer). */
async function preparerBriefing({ cfg, jour, pos, prev, air, get, echecs, agendaTexte, lecteurIcs }) {
  const calendriers = lireCalendarUrls(agendaTexte);
  const [ferie, nomCommune, fete, verset, hadith, agenda] = await Promise.all([
    sur('fériés', src.prochainFerie(jour, get), echecs),
    sur('commune', src.commune(pos, get), echecs),
    sur('fête', src.fete(jour), echecs),
    sur('verset', src.verset(jour, get), echecs),
    sur('hadith', src.hadith(jour), echecs),
    calendriers.length ? lireAgendas(calendriers, jour, cfg.agenda, lecteurIcs ? { fetcher: lecteurIcs } : {}) : null,
  ]);
  if (agenda) echecs.push(...agenda.echecs);
  const meteo = prev ? await sur('météo (analyse)', Promise.resolve().then(() => resumerMeteo(prev, jour, cfg)), echecs) : null;
  const resumeAir = air ? await sur('air (analyse)', Promise.resolve().then(() => resumerAir(air, jour, cfg)), echecs) : null;
  const commune = nomCommune ?? (pos.source === 'defaut' ? pos.nomParDefaut : 'Ma position');
  const { anniversaires, lignes } = agenda ? composerAgenda(agenda.agendas, jour, cfg.agenda) : { anniversaires: [], lignes: [] };
  const b = composerBriefing({ jour, commune, meteo, air: resumeAir, ferie, fete, anniversaires, agenda: lignes, verset, hadith }, cfg);
  console.log(`Agenda : ${calendriers.length ? `${calendriers.length} agenda(s) configuré(s)` : 'aucun agenda configuré (secret CALENDAR_URLS absent)'}.`);
  return { briefing: b, commune };
}

export async function executer({ opts, env = process.env, maintenant = new Date(), lecteurIcs, cheminEtat } = {}) {
  const cfg = await chargerConfig();
  const etat = await lireEtat(cheminEtat);

  const passage = opts.passage === 'auto' ? passageDuMoment(maintenant, cfg) : opts.passage;
  if (!passage) {
    console.log(`Aucun passage à ${paris(maintenant).hhmm} (Paris) : hors des fenêtres du matin et du soir.`);
    return { envoyes: [] };
  }
  const reglage = cfg.passages[passage];
  if (!reglage) throw new Error(`passage inconnu : ${passage}`);

  const decision = decider({ maintenant, reglage, nom: passage, etat, force: opts.force });
  console.log(`Passage « ${passage} » du ${decision.jour} à ${paris(maintenant).hhmm} (Paris) : ${decision.executer ? 'exécution' : 'rien à faire'} — ${decision.raison}.`);
  if (!decision.executer) return { envoyes: [] };
  const jour = decision.jour;

  const echecs = [];
  const get = opts.fixtures ? lecteurFixtures(opts.fixtures) : undefined;
  const pos = opts.fixtures
    ? { ...cfg.position.defaut, nomParDefaut: cfg.position.defaut.nom, source: 'defaut', raison: 'fixtures' }
    : await positionActuelle(cfg, { maintenant, topic: env.NTFY_TOPIC_POSITION });
  console.log(`Position : ${pos.source === 'raccourci' ? 'Raccourci iPhone' : `par défaut (${pos.raison})`}.`);

  const [prev, air] = await Promise.all([sur('météo', src.prevision(pos, get), echecs), sur('air', src.qualiteAir(pos, get), echecs)]);

  /** @type {{cle: string, titre: string, message: string, priorite?: number, briefing?: boolean}[]} */
  const aEnvoyer = [];
  let commune = '';
  if (passage === 'matin') {
    const r = await preparerBriefing({ cfg, jour, pos, prev, air, get, echecs, agendaTexte: env.CALENDAR_URLS, lecteurIcs });
    commune = r.commune;
    aEnvoyer.push({ cle: `briefing:${jour}`, titre: r.briefing.titre, message: r.briefing.message, briefing: true });
    console.log(`Briefing : titre + ${r.briefing.lignes.length} ligne(s).`);
  }

  // Alertes « bon moment pour… »
  const { regles, erreurs } = await chargerRegles().catch((e) => ({ regles: [], erreurs: [`rules.yaml illisible : ${e.message}`] }));
  for (const e of erreurs) console.log(`::warning::rules.yaml — ${e}`);
  if (prev) {
    const ctx = creerContexte({ prevision: prev, air, maintenant, cfg, commune });
    for (const r of evaluerRegles(regles, ctx, etat, passage)) {
      console.log(`Règle ${r.id} : ${r.declenche ? 'à envoyer' : r.raison}.`);
      if (r.declenche) aEnvoyer.push({ cle: r.cle, titre: r.titre, message: r.message, priorite: r.priorite });
    }
  } else if (regles.length) {
    console.log('Règles : non évaluées (météo indisponible).');
  }
  console.log(echecs.length ? `Sources indisponibles (lignes omises) : ${echecs.join(' ; ')}` : 'Toutes les sources ont répondu.');

  if (opts['dry-run']) {
    console.log("\n--- Simulation : rien n'est envoyé ---");
    for (const n of aEnvoyer) console.log(`\n[${n.cle}]\n${n.titre}\n${n.message}`);
    console.log(`\n(livraison : ${decision.livraison ? paris(decision.livraison).hhmm + ' à Paris' : 'immédiate'})`);
    return { envoyes: aEnvoyer.map((n) => n.cle) };
  }

  const topic = env.NTFY_TOPIC_BRIEFING;
  if (!topic && aEnvoyer.length) throw new Error('NTFY_TOPIC_BRIEFING manquant');

  // Envoi un par un ; chaque envoi réussi est noté tout de suite dans state.json,
  // pour qu'une relance après une erreur ne renvoie jamais ce qui est déjà parti.
  let nouvel = purger(etat, maintenant, cfg.state.purge_jours);
  const envoyes = [];
  let erreursEnvoi = 0;
  for (const n of aEnvoyer) {
    const dejaFait = Boolean(nouvel.alertes[n.cle]);
    if (dejaFait && !(n.briefing && opts.force)) {
      console.log(`${n.cle} : déjà envoyé, ignoré.`);
      continue;
    }
    try {
      const rep = await publier(
        construireMessage({ topic, titre: n.titre, message: n.message, livraison: decision.livraison, priorite: n.priorite ?? cfg.notification.priorite, lien: cfg.notification.lien }),
      );
      const prevu = rep.time ? paris(new Date(rep.time * 1000)).hhmm : '?';
      console.log(`${n.cle} : envoyé (id ${rep.id}), ${decision.livraison ? `livraison programmée à ${prevu}` : `livré à ${prevu}`} (Paris).`);
      envoyes.push(n.cle);
      // Un briefing forcé est un test : il ne compte pas comme le briefing du jour.
      if (!(n.briefing && opts.force)) {
        nouvel = { ...nouvel, alertes: { ...nouvel.alertes, [n.cle]: maintenant.toISOString() } };
        await ecrireEtat(nouvel, cheminEtat);
      }
    } catch (e) {
      erreursEnvoi++;
      console.log(`::error::${n.cle} : échec de l'envoi (${e.message}).`);
    }
  }

  if (!erreursEnvoi && !opts.force) nouvel = { ...nouvel, passages: { ...nouvel.passages, [passage]: jour } };
  nouvel = { ...nouvel, dernier_passage: maintenant.toISOString() };
  await ecrireEtat(nouvel, cheminEtat);
  if (erreursEnvoi) throw new Error(`${erreursEnvoi} envoi(s) en échec ; le prochain déclenchement réessaiera`);
  return { envoyes };
}

const estLanceDirectement = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (estLanceDirectement) {
  const { values: opts } = parseArgs({
    options: {
      passage: { type: 'string', default: process.env.PASSAGE || 'auto' },
      force: { type: 'boolean', default: process.env.FORCE === 'true' },
      'dry-run': { type: 'boolean', default: false },
      fixtures: { type: 'string' },
      maintenant: { type: 'string' },
    },
  });
  executer({ opts, maintenant: opts.maintenant ? new Date(opts.maintenant) : new Date() }).catch((e) => {
    console.error(`Échec : ${e.message}`);
    process.exitCode = 1;
  });
}
