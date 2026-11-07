// Bout en bout : src/main.mjs (executer) avec un réseau simulé (ntfy, Open-Meteo, agendas…).
// Prouve qu'une alerte n'est jamais envoyée deux fois, même après relance du workflow ou
// échec partiel, et qu'aucun secret, position ou événement n'apparaît dans les logs.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executer } from '../src/main.mjs';
import { fabriquerPrevision, fabriquerAir } from '../src/fabrique.mjs';

const SUJET = 'qb-sujet-de-test-0123456789abcdef';
const SUJET_POS = 'qp-sujet-de-test-0123456789abcdef';
const ICS_URL = 'https://outlook.live.com/owa/calendar/00000000SECRET/cid/calendar.ics';
const ics = readFileSync(new URL('./fixtures/agenda/outlook.ics', import.meta.url), 'utf8');

let envois, urls, journal, echouerSi, position, meteo;
const vraiFetch = globalThis.fetch;
const vraiLog = console.log;
const vraiErr = console.error;

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  envois = [];
  urls = [];
  journal = [];
  echouerSi = () => false;
  position = null;
  meteo = null;
  console.log = (...a) => journal.push(a.join(' '));
  console.error = (...a) => journal.push(a.join(' '));
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    urls.push(url);
    if (url === 'https://ntfy.sh/' && init.method === 'POST') {
      const p = JSON.parse(init.body);
      if (echouerSi(p)) return new Response('{"error":"boom"}', { status: 500 });
      envois.push(p);
      return json({ id: `id${envois.length}`, time: p.delay ? Number(p.delay) : Math.floor(Date.now() / 1000), event: 'message' });
    }
    if (url.startsWith(`https://ntfy.sh/${SUJET_POS}/json`)) {
      return new Response(position ? JSON.stringify({ id: 'p', time: position.time, event: 'message', message: position.texte }) + '\n' : '');
    }
    if (url.startsWith('https://air-quality-api.open-meteo.com/')) return json(fabriquerAir(meteo));
    if (url.startsWith('https://api.open-meteo.com/')) return json(fabriquerPrevision(meteo));
    if (url.startsWith('https://geo.api.gouv.fr/')) return json([{ nom: 'Marseille' }]);
    if (url.startsWith('https://date.nager.at/')) return json([{ date: '2026-12-25', localName: 'Noël', global: true }]);
    if (url.startsWith('https://api.alquran.cloud/')) return json({ data: [{ text: 'ar', surah: { englishName: 'x', name: 'y' } }, { text: 'fr' }] });
    if (url === ICS_URL) return new Response(ics, { headers: { 'content-type': 'text/calendar' } });
    return new Response('inconnu', { status: 404 });
  };
});
afterEach(() => {
  globalThis.fetch = vraiFetch;
  console.log = vraiLog;
  console.error = vraiErr;
});

const env = { NTFY_TOPIC_BRIEFING: SUJET, NTFY_TOPIC_POSITION: SUJET_POS, CALENDAR_URLS: `Outlook|${ICS_URL}` };
const etatTemp = async () => join(await mkdtemp(join(tmpdir(), 'quotidien-')), 'state.json');
const lancer = (cheminEtat, maintenant, opts = {}) =>
  executer({ opts: { passage: 'auto', force: false, 'dry-run': false, ...opts }, env, maintenant: new Date(maintenant), cheminEtat });
const lireEtat = async (f) => JSON.parse(await readFile(f, 'utf8'));

// Samedi 7 novembre : gel prévu dans la nuit de samedi à dimanche.
const SEMAINE_GEL = {
  jours: [
    { date: '2026-11-07', tmin: 3, tmax: 8 },
    { date: '2026-11-08', tmin: -2, tmax: 6 },
    { date: '2026-11-09', tmin: 1, tmax: 7 },
    { date: '2026-11-10', tmin: 2, tmax: 8 },
  ],
};

test('soir : alerte gel envoyée une fois, programmée à 19h00 ; relances, second cron et force : rien de plus', async () => {
  meteo = SEMAINE_GEL;
  const f = await etatTemp();
  await lancer(f, '2026-11-07T15:23:00Z'); // 16h23 à Paris
  assert.equal(envois.length, 1);
  assert.equal(envois[0].title, '🥶 Gel cette nuit');
  assert.equal(envois[0].message.includes('\n'), false, 'une seule ligne');
  assert.equal(envois[0].delay, String(Date.parse('2026-11-07T18:00:00Z') / 1000), '19h00 à Paris');
  const e = await lireEtat(f);
  assert.ok(e.alertes['gel:2026-11-08']);
  assert.equal(e.passages.soir, '2026-11-07');

  await lancer(f, '2026-11-07T15:23:00Z'); // relance manuelle du même workflow
  await lancer(f, '2026-11-07T16:23:00Z'); // second cron du soir
  await lancer(f, '2026-11-07T16:40:00Z', { force: true, passage: 'soir' }); // relance forcée
  assert.equal(envois.length, 1, 'jamais deux fois la clé gel:2026-11-08');
  assert.ok(journal.some((l) => l.includes('gel : déjà envoyée') || l.includes('Règle gel : déjà envoyée')));
});

test('échec partiel : ce qui est parti ne repart pas, le reste part à la relance', async () => {
  // Mardi 10 novembre au matin : 48 h sèches (voiture) et air mauvais (air) → briefing + 2 alertes.
  meteo = { jours: [{ date: '2026-11-10', tmin: 4, tmax: 11 }, { date: '2026-11-11', tmin: 5, tmax: 12 }, { date: '2026-11-12', tmin: 6, tmax: 12 }, { date: '2026-11-13', tmin: 6, tmax: 12 }], air: { '2026-11-10': 70 } };
  const f = await etatTemp();
  echouerSi = (p) => p.title.startsWith('😷');
  await assert.rejects(lancer(f, '2026-11-10T05:23:00Z'), /1 envoi\(s\) en échec/);
  assert.deepEqual(envois.map((p) => p.title.slice(0, 2)), ['☁️', '🚗'].map((s) => s.slice(0, 2)));
  let e = await lireEtat(f);
  assert.ok(e.alertes['briefing:2026-11-10'] && e.alertes['voiture:2026-11-10']);
  assert.equal(e.passages.matin, undefined, 'passage non terminé : le second cron réessaiera');

  echouerSi = () => false;
  await lancer(f, '2026-11-10T06:23:00Z'); // second cron du matin
  assert.equal(envois.length, 3);
  assert.equal(envois[2].title, '😷 Sport dehors déconseillé');
  e = await lireEtat(f);
  assert.equal(e.passages.matin, '2026-11-10');

  await lancer(f, '2026-11-10T06:40:00Z', { force: true, passage: 'matin' });
  assert.equal(envois.length, 4, 'force : seul le briefing de test repart');
  assert.match(envois[3].title, /Marseille|Lille/);
  assert.equal(envois[3].delay, undefined, 'envoi forcé immédiat');
});

test('voiture : jamais deux alertes à moins de 5 jours, même si la météo reste sèche', async () => {
  meteo = { jours: Array.from({ length: 4 }, (_, i) => ({ date: `2026-11-${10 + i}`, tmin: 4, tmax: 11 })) };
  const f = await etatTemp();
  await lancer(f, '2026-11-10T05:23:00Z');
  const voiture = () => envois.filter((p) => p.title.startsWith('🚗')).length;
  assert.equal(voiture(), 1);
  for (const j of [11, 12, 13, 14]) {
    meteo = { jours: Array.from({ length: 4 }, (_, i) => ({ date: `2026-11-${j + i}`, tmin: 4, tmax: 11 })) };
    await lancer(f, `2026-11-${j}T05:23:00Z`);
  }
  assert.equal(voiture(), 1, 'du 11 au 14 : délai');
  meteo = { jours: Array.from({ length: 4 }, (_, i) => ({ date: `2026-11-${15 + i}`, tmin: 4, tmax: 11 })) };
  await lancer(f, '2026-11-15T05:23:00Z');
  assert.equal(voiture(), 2, 'le 15 : 5 jours après');
});

test('position du Raccourci utilisée ; logs sans sujet, position, lien ni événement ; agenda dans la notification', async () => {
  meteo = { jours: Array.from({ length: 4 }, (_, i) => ({ date: `2026-11-${String(9 + i).padStart(2, '0')}`, tmin: 4, tmax: 11 })) };
  position = { time: Date.parse('2026-11-09T05:00:00Z') / 1000, texte: '43,30,5,37' };
  const f = await etatTemp();
  await lancer(f, '2026-11-09T05:23:00Z'); // lundi 6h23
  const briefing = envois.find((p) => p.title.includes('Marseille'));
  assert.ok(briefing, 'commune de la position du Raccourci');
  assert.ok(urls.some((u) => u.includes('latitude=43.3000&longitude=5.3700')), 'météo à la position du Raccourci');
  assert.match(briefing.message, /Aujourd'hui : Brocante du quartier\n10h Kiné\n\+ 3 autres événements/);
  assert.ok(!briefing.message.includes('Réunion'), 'filtre hors travail');

  const logs = journal.join('\n');
  for (const interdit of [SUJET, SUJET_POS, ICS_URL, '00000000SECRET', '43.3', '43,3', '5.37', 'Marseille', 'Kiné', 'Brocante', 'Dîner']) {
    assert.ok(!logs.includes(interdit), `« ${interdit} » apparaît dans les logs :\n${logs}`);
  }
  assert.match(logs, /Position : Raccourci iPhone/);
  assert.ok(!JSON.stringify(await lireEtat(f)).match(/43\.3|5\.37|Kiné|Marseille/), 'rien de tout cela dans state.json');
});

test('sans position récente : Lille ; sans agenda configuré : pas de ligne d\'agenda', async () => {
  meteo = { jours: Array.from({ length: 4 }, (_, i) => ({ date: `2026-11-${String(9 + i).padStart(2, '0')}`, tmin: 4, tmax: 11 })) };
  position = { time: Date.parse('2026-11-08T12:00:00Z') / 1000, texte: '43.30,5.37' }; // 17 h : trop vieux
  const f = await etatTemp();
  await executer({ opts: { passage: 'matin', force: true }, env: { ...env, CALENDAR_URLS: '' }, maintenant: new Date('2026-11-09T05:23:00Z'), cheminEtat: f });
  assert.ok(urls.some((u) => u.includes('latitude=50.6292&longitude=3.0573')));
  assert.match(journal.join('\n'), /Position : par défaut \(aucune position de moins de 12 h\)/);
  assert.ok(!envois[0].message.includes('Kiné'));
});

test("alerte d'essai : titre « [Essai] », envoi immédiat, state.json inchangé", async () => {
  const f = await etatTemp();
  for (const id of ['rando', 'voiture', 'air', 'gel']) {
    await executer({ opts: { essai: id }, env, cheminEtat: f });
  }
  assert.deepEqual(envois.map((p) => p.title), ['[Essai] 🥾 Bon moment pour une rando', '[Essai] 🚗 Bon moment pour laver la voiture', '[Essai] 😷 Sport dehors déconseillé', '[Essai] 🥶 Gel cette nuit']);
  assert.ok(envois.every((p) => p.delay === undefined && !p.message.includes('\n')));
  await assert.rejects(readFile(f, 'utf8'), /ENOENT/, 'aucun state.json écrit');
});
