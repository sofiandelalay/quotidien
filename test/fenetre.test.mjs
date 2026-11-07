import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { decider, passageDuMoment } from '../src/fenetre.mjs';
import { paris, ajouterJours, instantParis } from '../src/temps.mjs';
import { cfg } from './aide.mjs';

const reglage = cfg.passages.matin;
const vide = { passages: {}, alertes: {} };
const fait = (jour) => ({ passages: { matin: jour }, alertes: {} });
const PASSAGES = Object.keys(cfg.passages);

// Les crons réellement déclarés dans le workflow (format « M H * * * », UTC).
const workflow = YAML.parse(readFileSync(new URL('../.github/workflows/quotidien.yml', import.meta.url), 'utf8'));
const crons = workflow.on.schedule.map(({ cron }) => {
  const [mi, h, ...reste] = cron.split(/\s+/);
  assert.deepEqual(reste, ['*', '*', '*'], `cron inattendu : ${cron}`);
  return { h: Number(h), mi: Number(mi) };
});
const declenchements = (jour, retardMin = 0) =>
  crons.map(({ h, mi }) => new Date(Date.parse(`${jour}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00Z`) + retardMin * 60000));

/** Ce que fait le script pour un déclenchement du cron (passage « auto »). */
function auto(t, etat) {
  const p = passageDuMoment(t, cfg);
  if (!p) return { passage: null, executer: false };
  return { passage: p, ...decider({ maintenant: t, reglage: cfg.passages[p], nom: p, etat }) };
}

test('workflow : deux déclenchements par passage, à une heure d\'écart, minutes décalées', () => {
  assert.equal(crons.length, 2 * PASSAGES.length);
  for (const c of crons) assert.ok(c.mi % 30 !== 0, `minute ${c.mi}`);
  const heures = crons.map((c) => c.h).sort((a, b) => a - b);
  for (let i = 0; i < heures.length; i += 2) assert.equal(heures[i + 1] - heures[i], 1);
});

test('workflow : seulement schedule et workflow_dispatch (jamais pull_request)', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
});

test('chaque jour de 2026, hiver comme été, chaque passage a un déclenchement à l\'heure avant l\'envoi', () => {
  for (let jour = '2026-01-01'; jour <= '2026-12-31'; jour = ajouterJours(jour, 1)) {
    for (const p of PASSAGES) {
      const utiles = declenchements(jour).map((t) => auto(t, vide)).filter((d) => d.passage === p && d.executer && d.livraison && d.jour === jour);
      assert.ok(utiles.length >= 1, `aucun déclenchement utile pour « ${p} » le ${jour}`);
    }
  }
});

test('jours de changement d\'heure : livraison à 7h30 et 19h00 heure de Paris', () => {
  for (const jour of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) {
    for (const p of PASSAGES) {
      const premier = declenchements(jour).map((t) => auto(t, vide)).find((d) => d.passage === p && d.executer);
      assert.ok(premier, `${p} ${jour}`);
      assert.equal(paris(premier.livraison).hhmm, cfg.passages[p].heure_envoi, `${p} ${jour}`);
      assert.equal(premier.livraison.getTime(), instantParis(jour, cfg.passages[p].heure_envoi).getTime());
    }
  }
});

test('simulation d\'une année : un seul passage par jour et par moment, même avec les deux crons et des retards', () => {
  for (const retard of [0, 17, 48, 95]) {
    let etat = { passages: {}, alertes: {} };
    const compte = Object.fromEntries(PASSAGES.map((p) => [p, 0]));
    let jours = 0;
    for (let jour = '2026-01-01'; jour <= '2026-12-31'; jour = ajouterJours(jour, 1)) {
      jours++;
      for (const t of declenchements(jour, retard)) {
        const d = auto(t, etat);
        if (d.executer) {
          compte[d.passage]++;
          etat = { ...etat, passages: { ...etat.passages, [d.passage]: d.jour } };
        }
      }
    }
    for (const p of PASSAGES) assert.equal(compte[p], jours, `retard ${retard} min, ${p} : ${compte[p]} passages pour ${jours} jours`);
  }
});

test('hors fenêtre : rien (déclenchement manuel l\'après-midi, cron très en retard)', () => {
  const a = decider({ maintenant: new Date('2026-11-07T14:00:00Z'), reglage, nom: 'matin', etat: vide });
  assert.equal(a.executer, false);
  assert.match(a.raison, /hors fenêtre \(15:00/);
  assert.equal(decider({ maintenant: new Date('2026-11-07T03:59:00Z'), reglage, nom: 'matin', etat: vide }).executer, false, '04:59 Paris');
  assert.equal(decider({ maintenant: new Date('2026-11-07T08:30:00Z'), reglage, nom: 'matin', etat: vide }).executer, false, '09:30 Paris (fin exclue)');
  assert.equal(passageDuMoment(new Date('2026-11-07T12:00:00Z'), cfg), null, '13h : ni matin ni soir');
  assert.equal(passageDuMoment(new Date('2026-11-07T17:23:00Z'), cfg), 'soir');
});

test('déjà fait aujourd\'hui : rien ; fait la veille : on envoie', () => {
  const t = new Date('2026-11-07T05:23:00Z');
  assert.equal(decider({ maintenant: t, reglage, nom: 'matin', etat: fait('2026-11-07') }).executer, false);
  assert.equal(decider({ maintenant: t, reglage, nom: 'matin', etat: fait('2026-11-06') }).executer, true);
  assert.equal(decider({ maintenant: new Date('2026-11-07T17:23:00Z'), reglage: cfg.passages.soir, nom: 'soir', etat: fait('2026-11-07') }).executer, true, 'le matin fait ne bloque pas le soir');
});

test('en retard après l\'heure d\'envoi mais dans la fenêtre : envoi immédiat (pas de delay)', () => {
  const d = decider({ maintenant: new Date('2026-11-07T06:41:00Z'), reglage, nom: 'matin', etat: vide });
  assert.equal(d.executer, true);
  assert.equal(d.livraison, null);
  const juste = decider({ maintenant: new Date('2026-11-07T06:29:50Z'), reglage, nom: 'matin', etat: vide });
  assert.equal(juste.livraison, null, 'moins de 15 s avant : ntfy refuserait le délai');
  const soir = decider({ maintenant: new Date('2026-11-07T18:10:00Z'), reglage: cfg.passages.soir, nom: 'soir', etat: vide });
  assert.deepEqual([soir.executer, soir.livraison], [true, null], '19h10 : alerte du soir immédiate');
});

test('force : ignore fenêtre et passage déjà fait, envoi immédiat', () => {
  const d = decider({ maintenant: new Date('2026-11-07T14:00:00Z'), reglage, nom: 'matin', etat: fait('2026-11-07'), force: true });
  assert.deepEqual([d.executer, d.livraison, d.jour], [true, null, '2026-11-07']);
});
