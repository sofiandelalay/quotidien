import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chargerRegles, validerRegles, creerContexte, evaluerRegle } from '../src/regles.mjs';
import { chargerFixture, simuler } from '../src/simuler.mjs';
import { fabriquerPrevision, fabriquerAir, joursDepuis } from '../src/fabrique.mjs';
import { etatVide } from '../src/etat.mjs';
import { cfg } from './aide.mjs';

const { regles, erreurs } = await chargerRegles();
const regle = (id) => regles.find((r) => r.id === id);
const DOSSIER = fileURLToPath(new URL('./fixtures/regles/', import.meta.url));
const fixtures = Object.fromEntries(await Promise.all(readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).map(async (f) => [f.replace('.json', ''), await chargerFixture(DOSSIER + f)])));

test('rules.yaml est valide et contient les quatre règles de départ', () => {
  assert.deepEqual(erreurs, []);
  assert.deepEqual(regles.map((r) => r.id), ['rando', 'voiture', 'air', 'gel'], 'barbecue est un exemple désactivé');
});

test('chaque règle se déclenche sur sa fixture « oui », et sur aucune autre', () => {
  for (const [nom, fx] of Object.entries(fixtures)) {
    const declenchees = regles.filter((r) => simuler(r, fx, cfg).declenche).map((r) => r.id);
    const attendue = nom.endsWith('-oui') ? [nom.split('-')[0]] : [];
    assert.deepEqual(declenchees, attendue, nom);
  }
});

test('rando : clé sur la date du samedi, message avec les températures', () => {
  const r = simuler(regle('rando'), fixtures['rando-oui'], cfg);
  assert.equal(r.cle, 'rando:2026-11-14');
  assert.equal(r.titre, '🥾 Bon moment pour une rando');
  assert.equal(r.message, 'Ce week-end sec : 17° samedi, 16° dimanche.');
});

test('rando : seulement le jeudi soir', () => {
  const fx = fixtures['rando-oui'];
  const vendredi = { ...fx, maintenant: new Date('2026-11-13T17:23:00Z') };
  assert.match(simuler(regle('rando'), vendredi, cfg).raison, /pas un jeudi/);
  assert.match(simuler(regle('rando'), { ...fx, passage: 'matin' }, cfg).raison, /règle du soir/);
});

test('gel : clé sur la date de demain, strictement négatif, « nuit » = 20h → 8h', () => {
  const r = simuler(regle('gel'), fixtures['gel-oui'], cfg);
  assert.deepEqual([r.cle, r.message], ['gel:2026-11-08', "Jusqu'à −2° : protéger les plantes, pare-brise à couvrir."]);
  assert.equal(simuler(regle('gel'), fixtures['gel-non'], cfg).declenche, false, '0° pile : pas de gel ; −4° la nuit suivante ne compte pas');
});

test('voiture : délai de 5 jours entre deux alertes', () => {
  const fx = fixtures['voiture-oui'];
  const il_y_a = (jours) => ({ ...fx, etat: { ...etatVide(), alertes: { 'voiture:x': new Date(fx.maintenant.getTime() - jours * 86400000).toISOString() } } });
  assert.equal(simuler(regle('voiture'), il_y_a(4), cfg).declenche, false);
  assert.equal(simuler(regle('voiture'), il_y_a(5), cfg).declenche, true);
  assert.equal(simuler(regle('voiture'), il_y_a(12), cfg).declenche, true);
});

test('air : seuil 60 inclus, mot français dans le message', () => {
  const fx = fixtures['air-oui'];
  assert.equal(simuler(regle('air'), fx, cfg).message, "Air mauvais aujourd'hui (indice 65) : plutôt du sport en salle.");
  const a60 = { ...fx, air: fabriquerAir({ jours: [{ date: '2026-11-10' }, { date: '2026-11-11' }], air: { '2026-11-10': 60 } }) };
  assert.equal(simuler(regle('air'), a60, cfg).declenche, true);
  assert.equal(simuler(regle('air'), { ...fx, air: null }, cfg).raison, 'données météo manquantes', 'air indisponible : pas d\'alerte');
});

test('anti-doublon : une clé déjà dans state.json bloque la règle', () => {
  for (const [nom, id] of [['rando-oui', 'rando'], ['voiture-oui', 'voiture'], ['air-oui', 'air'], ['gel-oui', 'gel']]) {
    const fx = fixtures[nom];
    const premiere = simuler(regle(id), fx, cfg);
    assert.equal(premiere.declenche, true, nom);
    const apres = { ...fx, etat: { ...etatVide(), alertes: { [premiere.cle]: fx.maintenant.toISOString() } } };
    const seconde = simuler(regle(id), apres, cfg);
    assert.equal(seconde.declenche, false, nom);
    assert.match(seconde.raison, /déjà envoyée/);
  }
});

test('prévision trop courte : aucune alerte (jamais de « sec » par manque de données)', () => {
  const fx = fixtures['rando-oui'];
  const courte = { ...fx, prevision: fabriquerPrevision({ jours: joursDepuis('2026-11-12', 3, { tmin: 10, tmax: 18 }) }) }; // s'arrête samedi
  assert.equal(simuler(regle('rando'), courte, cfg).raison, 'données météo manquantes');
});

// --- Vocabulaire -------------------------------------------------------------------

const ctxTest = (jours, maintenant = '2026-11-10T05:23:00Z', air = {}) =>
  creerContexte({ prevision: fabriquerPrevision({ jours }), air: fabriquerAir({ jours, air }), maintenant: new Date(maintenant), cfg, commune: 'Lille' });

test('un_des / tous imbriqués, opérateurs, période qui passe le nouvel an', () => {
  const jours = joursDepuis('2026-12-30', 4, { tmin: 1, tmax: 6 }, { '2026-12-31': { rafales: 80 } });
  const ctx = ctxTest(jours, '2026-12-30T17:23:00Z');
  const r = {
    id: 't', moment: 'soir', periode: { du: '11-01', au: '03-31' }, evenement: 'demain',
    conditions: { tous: [{ un_des: [{ quand: 'demain', mesure: 'rafales_max', au_moins: 70 }, { quand: 'demain', mesure: 'pluie', est: 'pluvieux' }] }, { quand: 'demain', mesure: 'temperature_max', plus_de: 5 }] },
    titre: 'Tempête {date}', message: 'Rafales {demain.rafales_max} km/h à {commune}',
  };
  const res = evaluerRegle(r, ctx, etatVide(), 'soir');
  assert.deepEqual([res.declenche, res.cle, res.titre, res.message], [true, 't:2026-12-31', 'Tempête jeudi 31 déc', 'Rafales 80 km/h à Lille']);
  assert.match(evaluerRegle({ ...r, periode: { du: '04-01', au: '10-31' } }, ctx, etatVide(), 'soir').raison, /hors période/);
  assert.equal(evaluerRegle({ ...r, conditions: [{ quand: 'demain', mesure: 'temperature_max', moins_de: 6 }] }, ctx, etatVide(), 'soir').declenche, false);
});

test('« samedi » le samedi même = aujourd\'hui ; prochaines_48h part de l\'heure actuelle', () => {
  const jours = joursDepuis('2026-11-14', 4, { tmin: 3, tmax: 9 }, { '2026-11-16': { pluie: { 10: 1 } } });
  const ctx = ctxTest(jours, '2026-11-14T05:23:00Z'); // samedi 6h23
  assert.equal(ctx.dateDe('samedi'), '2026-11-14');
  assert.equal(ctx.dateDe('dimanche'), '2026-11-15');
  assert.equal(ctx.mesurer('prochaines_48h', 'pluie'), 'sec', 'pluie lundi 10h : après 48 h');
  const ctx2 = ctxTest(jours, '2026-11-14T11:23:00Z'); // samedi 12h23 → lundi 12h23
  assert.equal(ctx2.mesurer('prochaines_48h', 'pluie'), 'pluvieux');
});

test('validation : erreurs lisibles en français, la règle fautive est signalée', () => {
  const { erreurs: e } = validerRegles({
    regles: [
      { id: 'ok', moment: 'matin', conditions: [{ quand: 'aujourdhui', mesure: 'uv_max', au_moins: 6 }], titre: 'a', message: 'b' },
      { id: 'Mauvais id', moment: 'midi', jours: ['jeudy'], conditions: [{ quand: 'mardi', mesure: 'neige', au_moins: 2 }, { quand: 'demain', mesure: 'pluie', au_moins: 3 }], titre: 'x', message: '{samedi.foo} {inconnu}', couleur: 'rouge' },
      { id: 'ok', moment: 'soir', conditions: [{ quand: 'nuit', mesure: 'temperature_min' }], titre: 'a\nb', message: 'c' },
    ],
  });
  const texte = e.join('\n');
  for (const attendu of ['« id » obligatoire', '« moment » doit valoir matin ou soir', '« jours »', '« mesure: neige » inconnue', "« pluie » s'utilise avec « est: sec | pluvieux »", 'variable {samedi.foo} inconnue', 'variable {inconnu} inconnue', 'champ « couleur » inconnu', 'id en double', 'exactement un opérateur', 'doit tenir sur une ligne']) {
    assert.ok(texte.includes(attendu), `manque : ${attendu}\n${texte}`);
  }
  assert.ok(!texte.includes('règle 1'), 'la règle correcte n\'est pas signalée');
});
