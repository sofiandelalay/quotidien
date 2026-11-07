import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { decider } from '../src/fenetre.mjs';
import { paris, ajouterJours, instantParis } from '../src/temps.mjs';
import { cfg } from './aide.mjs';

const reglage = cfg.passages.matin;
const vide = { passages: {}, alertes: {} };
const fait = (jour) => ({ passages: { matin: jour }, alertes: {} });

// Les crons réellement déclarés dans le workflow (format « M H * * * », UTC).
const workflow = YAML.parse(readFileSync(new URL('../.github/workflows/quotidien.yml', import.meta.url), 'utf8'));
const crons = workflow.on.schedule.map(({ cron }) => {
  const [mi, h, ...reste] = cron.split(/\s+/);
  assert.deepEqual(reste, ['*', '*', '*'], `cron inattendu : ${cron}`);
  return { h: Number(h), mi: Number(mi) };
});
const declenchements = (jour, retardMin = 0) =>
  crons.map(({ h, mi }) => new Date(Date.parse(`${jour}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00Z`) + retardMin * 60000));

test('workflow : deux déclenchements, minutes décalées (pas :00 ni :30)', () => {
  assert.equal(crons.length, 2);
  for (const c of crons) assert.ok(c.mi % 30 !== 0, `minute ${c.mi}`);
  assert.equal(Math.abs(crons[0].h - crons[1].h), 1, 'une heure d\'écart (hiver/été)');
});

test('chaque jour de 2026, hiver comme été : un déclenchement à l\'heure tombe dans la fenêtre avant 7h30', () => {
  for (let jour = '2026-01-01'; jour <= '2026-12-31'; jour = ajouterJours(jour, 1)) {
    const utiles = declenchements(jour).filter((t) => {
      const d = decider({ maintenant: t, reglage, nom: 'matin', etat: vide });
      return d.executer && d.livraison && d.jour === jour;
    });
    assert.ok(utiles.length >= 1, `aucun déclenchement utile le ${jour}`);
  }
});

test('jours de changement d\'heure : livraison à 7h30 heure de Paris', () => {
  for (const jour of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) {
    const [premier] = declenchements(jour).map((t) => decider({ maintenant: t, reglage, nom: 'matin', etat: vide })).filter((d) => d.executer);
    assert.ok(premier, jour);
    assert.equal(paris(premier.livraison).hhmm, '07:30', jour);
    assert.equal(premier.livraison.getTime(), instantParis(jour, '07:30').getTime());
  }
});

test('simulation d\'une année : un seul envoi par jour, même avec les deux crons et des retards', () => {
  for (const retard of [0, 17, 48, 95]) {
    let etat = { passages: {}, alertes: {} };
    let envois = 0;
    let jours = 0;
    for (let jour = '2026-01-01'; jour <= '2026-12-31'; jour = ajouterJours(jour, 1)) {
      jours++;
      for (const t of declenchements(jour, retard)) {
        const d = decider({ maintenant: t, reglage, nom: 'matin', etat });
        if (d.executer) {
          envois++;
          etat = { ...etat, passages: { matin: d.jour } };
        }
      }
    }
    assert.equal(envois, jours, `retard ${retard} min : ${envois} envois pour ${jours} jours`);
  }
});

test('hors fenêtre : rien (déclenchement manuel l\'après-midi, cron très en retard)', () => {
  const a = decider({ maintenant: new Date('2026-11-07T14:00:00Z'), reglage, nom: 'matin', etat: vide });
  assert.equal(a.executer, false);
  assert.match(a.raison, /hors fenêtre \(15:00/);
  assert.equal(decider({ maintenant: new Date('2026-11-07T03:59:00Z'), reglage, nom: 'matin', etat: vide }).executer, false, '04:59 Paris');
  assert.equal(decider({ maintenant: new Date('2026-11-07T08:30:00Z'), reglage, nom: 'matin', etat: vide }).executer, false, '09:30 Paris (fin exclue)');
});

test('déjà fait aujourd\'hui : rien ; fait la veille : on envoie', () => {
  const t = new Date('2026-11-07T05:23:00Z');
  assert.equal(decider({ maintenant: t, reglage, nom: 'matin', etat: fait('2026-11-07') }).executer, false);
  assert.equal(decider({ maintenant: t, reglage, nom: 'matin', etat: fait('2026-11-06') }).executer, true);
});

test('en retard après 7h30 mais dans la fenêtre : envoi immédiat (pas de delay)', () => {
  const d = decider({ maintenant: new Date('2026-11-07T06:41:00Z'), reglage, nom: 'matin', etat: vide });
  assert.equal(d.executer, true);
  assert.equal(d.livraison, null);
  const juste = decider({ maintenant: new Date('2026-11-07T06:29:50Z'), reglage, nom: 'matin', etat: vide });
  assert.equal(juste.livraison, null, 'moins de 15 s avant : ntfy refuserait le délai');
});

test('force : ignore fenêtre et anti-doublon, envoi immédiat', () => {
  const d = decider({ maintenant: new Date('2026-11-07T14:00:00Z'), reglage, nom: 'matin', etat: fait('2026-11-07'), force: true });
  assert.deepEqual([d.executer, d.livraison, d.jour], [true, null, '2026-11-07']);
});
