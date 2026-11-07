// Simulation des alertes : évalue les règles de rules.yaml sur des données météo fictives, sans rien envoyer.
//
//   npm run simulate                                         toutes les fixtures de test/fixtures/regles
//   npm run simulate -- --regle gel                          seulement la règle « gel », sur toutes les fixtures
//   npm run simulate -- --regle gel --fixture test/fixtures/regles/gel-oui.json
//
// Une fixture décrit la météo jour par jour (cf. src/fabrique.mjs) :
//   { "description": "…", "maintenant": "2026-11-12T17:23:00Z", "passage": "soir" (facultatif),
//     "jours": [ { "date": "2026-11-12", "tmin": 8, "tmax": 13, "pluie": { "15": 0.8 } }, … ],
//     "air": { "2026-11-12": 65 }, "etat": { "alertes": { "voiture:2026-11-06": "2026-11-06T05:30:00Z" } } }
// Elle peut aussi contenir directement les réponses Open-Meteo : { "prevision": {…}, "air": {…} }.
import { readFile, readdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerConfig } from './config.mjs';
import { chargerRegles, creerContexte, evaluerRegle } from './regles.mjs';
import { fabriquerPrevision, fabriquerAir } from './fabrique.mjs';
import { etatVide } from './etat.mjs';
import { paris } from './temps.mjs';
import { passageDuMoment } from './fenetre.mjs';


const DOSSIER = fileURLToPath(new URL('../test/fixtures/regles/', import.meta.url));

export async function chargerFixture(chemin) {
  const f = JSON.parse(await readFile(chemin, 'utf8'));
  const prevision = f.prevision ?? fabriquerPrevision(f);
  const air = f.air?.hourly ? f.air : fabriquerAir({ jours: f.jours ?? [], air: f.air ?? {} });
  return { nom: basename(chemin, '.json'), description: f.description ?? '', maintenant: new Date(f.maintenant), passage: f.passage, prevision, air, etat: { ...etatVide(), ...(f.etat ?? {}) } };
}

/**
 * Évalue une règle sur une fixture. Passage : celui de la fixture, sinon celui dont la fenêtre
 * contient l'heure de la fixture (comme le cron), sinon celui de la règle.
 */
export function simuler(regle, fixture, cfg) {
  const ctx = creerContexte({ prevision: fixture.prevision, air: fixture.air, maintenant: fixture.maintenant, cfg, commune: cfg.position.defaut.nom });
  const passage = fixture.passage ?? passageDuMoment(fixture.maintenant, cfg) ?? regle.moment;
  return evaluerRegle(regle, ctx, fixture.etat, passage);
}

async function principal() {
  const { values: o } = parseArgs({ options: { regle: { type: 'string' }, fixture: { type: 'string' } } });
  const cfg = await chargerConfig();
  const { regles, erreurs } = await chargerRegles();
  if (erreurs.length) {
    console.log('rules.yaml contient des erreurs :');
    for (const e of erreurs) console.log(`  - ${e}`);
    process.exitCode = 1;
  }
  const choisies = o.regle ? regles.filter((r) => r.id === o.regle) : regles;
  if (o.regle && !choisies.length) throw new Error(`règle « ${o.regle} » introuvable (règles actives : ${regles.map((r) => r.id).join(', ')})`);

  let fichiers = o.fixture ? [o.fixture] : (await readdir(DOSSIER)).filter((f) => f.endsWith('.json')).sort().map((f) => join(DOSSIER, f));
  if (o.regle && !o.fixture) {
    const propres = fichiers.filter((f) => basename(f).startsWith(o.regle + '-'));
    if (propres.length) fichiers = propres;
  }

  console.log("Simulation : rien n'est envoyé, state.json n'est pas modifié.\n");
  for (const f of fichiers) {
    const fx = await chargerFixture(f);
    const p = paris(fx.maintenant);
    console.log(`■ ${fx.nom} — ${fx.description}`);
    console.log(`  (${p.date} ${p.hhmm} à Paris)`);
    for (const r of choisies) {
      const res = simuler(r, fx, cfg);
      if (res.declenche) {
        console.log(`  ✅ ${r.id} : envoyée — clé ${res.cle}`);
        console.log(`     ${res.titre}`);
        console.log(`     ${res.message}`);
      } else {
        console.log(`  ·  ${r.id} : non — ${res.raison}`);
      }
      for (const d of res.details) console.log(`       ${d.ok ? '✓' : '✗'} ${d.texte} (valeur : ${d.valeur === null ? 'inconnue' : typeof d.valeur === 'number' ? Math.round(d.valeur * 10) / 10 : d.valeur})`);
    }
    console.log('');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1])) {
  principal().catch((e) => {
    console.error(`Échec : ${e.message}`);
    process.exitCode = 1;
  });
}
