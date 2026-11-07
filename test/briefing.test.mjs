import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composerBriefing, emojiMeteo, ligneFerie } from '../src/briefing.mjs';
import { resumerMeteo, resumerAir, motAir, pollensNotables } from '../src/analyse.mjs';
import { construireMessage } from '../src/ntfy.mjs';
import { instantParis } from '../src/temps.mjs';
import { cfg, fixture } from './aide.mjs';

const jour = '2026-11-07';
const meteo = resumerMeteo(fixture('matin/prevision.json'), jour, cfg);
const air = resumerAir(fixture('matin/air.json'), jour, cfg);
const base = { jour, commune: 'Lille', meteo, air, ferie: { date: '2026-11-11', nom: 'Armistice' }, fete: 'Carine', agenda: [] };

test('analyse de la fixture : créneau 14h–17h, cumul, vent, air', () => {
  assert.deepEqual(meteo.creneaux, [{ debut: 14, fin: 17 }]);
  assert.equal(Math.round(meteo.cumul * 10) / 10, 3.5);
  assert.equal(meteo.rafalesMax, 41.8);
  assert.equal(air.aqiMax, 35);
  assert.equal(motAir(air.aqiMax, cfg.air.niveaux), 'moyen');
});

test('briefing complet : ordre et contenu', () => {
  const b = composerBriefing(base, cfg);
  assert.equal(b.titre, '☂️ Lille 6–12° · pluie 14h–17h');
  assert.deepEqual(b.lignes, [
    'Pluie 14h–17h (4 mm) · vent 22 km/h',
    'Air moyen',
    'Armistice · 11 nov · dans 4 j',
    'Fête : Carine',
    'Parapluie conseillé (pluie 14h–17h).',
  ]);
});

test('journée sans pluie ni conseil : pas de ligne de conseil, emoji du ciel', () => {
  const sec = { ...meteo, code: 1, creneaux: [], cumul: 0, probaMax: 10 };
  const b = composerBriefing({ ...base, meteo: sec, ferie: null, fete: null }, cfg);
  assert.equal(b.titre, '☀️ Lille 6–12°');
  assert.deepEqual(b.lignes, ['Vent 22 km/h', 'Air moyen']);
});

test('rafales ≥ 50 et UV ≥ 3 affichés, pollens notables seulement', () => {
  const b = composerBriefing({ ...base, meteo: { ...meteo, creneaux: [], cumul: 0, probaMax: 0, rafalesMax: 55, uvMax: 3.2 }, air: { aqiMax: 15, pollens: { bouleau: 120, graminees: 4, aulne: 0 } } }, cfg);
  assert.equal(b.lignes[0], 'Vent 22 km/h, rafales 55 · UV 3');
  assert.equal(b.lignes[1], 'Air bon · pollens : bouleau');
  assert.deepEqual(pollensNotables({ aulne: 0, bouleau: 0 }, cfg.pollens.seuils), [], 'hors saison : rien');
});

test('sources en panne : lignes omises, le briefing part quand même', () => {
  const b = composerBriefing({ jour, commune: 'Ma position', meteo: null, air: null, ferie: null, fete: null, agenda: [] }, cfg);
  assert.equal(b.titre, 'Ma position · météo indisponible');
  assert.deepEqual(b.lignes, ['Air : indisponible']);
});

test('titre : le créneau de pluie le plus long, tous dans la ligne pluie', () => {
  const b = composerBriefing({ ...base, meteo: { ...meteo, creneaux: [{ debut: 8, fin: 9 }, { debut: 11, fin: 21 }] } }, cfg);
  assert.equal(b.titre, '☂️ Lille 6–12° · pluie 11h–21h');
  assert.match(b.lignes[0], /^Pluie 8h–9h, 11h–21h/);
  const egal = composerBriefing({ ...base, meteo: { ...meteo, creneaux: [{ debut: 8, fin: 10 }, { debut: 15, fin: 17 }] } }, cfg);
  assert.equal(egal.titre, '☂️ Lille 6–12° · pluie 8h–10h');
  const beaucoup = composerBriefing({ ...base, meteo: { ...meteo, creneaux: [8, 11, 14, 17].map((h) => ({ debut: h, fin: h + 1 })) } }, cfg);
  assert.equal(beaucoup.titre, '☂️ Lille 6–12° · pluie par moments');
});

test('agenda limité à 3 lignes, avant le conseil', () => {
  const b = composerBriefing({ ...base, agenda: ['a', 'b', 'c', 'd'] }, cfg);
  assert.deepEqual(b.lignes.slice(-4), ['a', 'b', 'c', 'Parapluie conseillé (pluie 14h–17h).']);
});

test('verset seulement si notification.verset est vrai', () => {
  const verset = { ref: '94:6', fr: 'à côté de la difficulté, est certes, une facilité!' };
  assert.ok(!composerBriefing({ ...base, verset }, cfg).message.includes('94:6'));
  assert.ok(composerBriefing({ ...base, verset }, { ...cfg, notification: { ...cfg.notification, verset: true } }).message.includes('(94:6)'));
});

test('férié : aujourd\'hui, demain, au-delà de l\'horizon', () => {
  assert.equal(ligneFerie({ date: jour, nom: 'Noël' }, jour, 60), "Noël · aujourd'hui");
  assert.equal(ligneFerie({ date: '2026-11-08', nom: 'X' }, jour, 60), 'X · demain');
  assert.equal(ligneFerie({ date: '2027-05-01', nom: 'X' }, jour, 60), null);
});

test('emoji météo', () => {
  assert.deepEqual([emojiMeteo(95, true), emojiMeteo(73, true), emojiMeteo(61, true), emojiMeteo(61, false), emojiMeteo(45, false), emojiMeteo(0, false)], ['⛈️', '❄️', '☂️', '☁️', '🌫️', '☀️']);
});

test('message ntfy JSON : champ delay en horodatage Unix pour 7h30 Paris', () => {
  const p = construireMessage({ topic: 't', titre: 'x', message: 'y', livraison: instantParis(jour, '07:30') });
  assert.equal(p.delay, String(Date.parse('2026-11-07T06:30:00Z') / 1000));
  assert.equal(construireMessage({ topic: 't', titre: 'x', message: 'y' }).delay, undefined);
});

test('données statiques : fêtes corrigées, hadiths numérotés, versets courts', async () => {
  const { fete, hadith } = await import('../src/sources.mjs');
  assert.equal(await fete('2026-11-07'), 'Carine');
  assert.equal(await fete('2027-04-01'), 'Hugues', 'pas « Pâques » figé à 2018');
  assert.equal(await fete('2026-11-01'), null, 'Toussaint : pas de prénom, ligne omise');
  const h = await hadith('2026-11-07');
  assert.ok(h.numero >= 1 && h.numero <= 42 && h.texte.length > 20 && h.source);
  const { readFileSync } = await import('node:fs');
  const { refs } = JSON.parse(readFileSync(new URL('../data/versets-courts.json', import.meta.url), 'utf8'));
  assert.ok(refs.length > 1000 && refs.every((r) => /^\d+:\d+$/.test(r)));
});
