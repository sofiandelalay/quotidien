import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choisirConseil, deg } from '../src/conseil.mjs';
import { cfg, avec } from './aide.mjs';

// Journée calme : aucun seuil atteint.
const calme = { creneaux: [], cumul: 0, probaMax: 10, rafalesMax: 30, tempMinGel: 6, ressentiMatin: 6, uvMax: 2 };
const airBon = { aqiMax: 25, pollens: {} };
const m = (x) => ({ ...calme, ...x });

test('journée calme : aucun conseil', () => {
  assert.equal(choisirConseil(calme, airBon, cfg), null);
});

test('parapluie : cumul ≥ 1 mm ou probabilité ≥ 70 %', () => {
  const pluie = { creneaux: [{ debut: 14, fin: 17 }] };
  assert.equal(choisirConseil(m({ ...pluie, cumul: 1, probaMax: 40 }), airBon, cfg), 'Parapluie conseillé (pluie 14h–17h).');
  assert.equal(choisirConseil(m({ ...pluie, cumul: 0.3, probaMax: 70 }), airBon, cfg), 'Parapluie conseillé (pluie 14h–17h).');
  assert.equal(choisirConseil(m({ ...pluie, cumul: 0.9, probaMax: 69 }), airBon, cfg), null, 'petite bruine : pas de conseil');
  assert.equal(choisirConseil(m({ cumul: 3, probaMax: 90 }), airBon, cfg), null, 'pluie la nuit seulement (aucun créneau en journée)');
});

test('manteau : ressenti du matin ≤ 3°', () => {
  assert.equal(choisirConseil(m({ ressentiMatin: 3 }), airBon, cfg), 'Manteau conseillé : ressenti 3° ce matin.');
  assert.equal(choisirConseil(m({ ressentiMatin: -1.6 }), airBon, cfg), 'Manteau conseillé : ressenti −2° ce matin.');
  assert.equal(choisirConseil(m({ ressentiMatin: 3.1 }), airBon, cfg), null);
});

test('gel : température ≤ 0 entre 5h et 10h', () => {
  assert.equal(choisirConseil(m({ tempMinGel: 0 }), airBon, cfg), 'Gel ce matin (0°) : prudence sur la route.');
  assert.equal(choisirConseil(m({ tempMinGel: -0.4 }), airBon, cfg), 'Gel ce matin (0°) : prudence sur la route.', 'jamais « −0 »');
  assert.equal(choisirConseil(m({ tempMinGel: 0.1, ressentiMatin: 4 }), airBon, cfg), null);
});

test('vent fort : rafales ≥ 70 km/h', () => {
  assert.equal(choisirConseil(m({ rafalesMax: 70 }), airBon, cfg), 'Vent fort, rafales jusqu\'à 70 km/h : prudence à vélo.');
  assert.equal(choisirConseil(m({ rafalesMax: 69.4 }), airBon, cfg), null);
});

test('crème solaire : UV ≥ 6', () => {
  assert.equal(choisirConseil(m({ uvMax: 6 }), airBon, cfg), 'Crème solaire conseillée : UV 6 en milieu de journée.');
  assert.equal(choisirConseil(m({ uvMax: 5.9 }), airBon, cfg), null);
});

test('air mauvais : indice ≥ 80, mot français', () => {
  assert.equal(choisirConseil(calme, { aqiMax: 80 }, cfg), 'Air très mauvais : éviter l\'effort intense dehors.');
  assert.equal(choisirConseil(calme, { aqiMax: 79 }, cfg), null);
});

test('un seul conseil, selon la priorité de config.yaml', () => {
  const tout = m({ creneaux: [{ debut: 8, fin: 10 }], cumul: 5, probaMax: 90, rafalesMax: 80, tempMinGel: -3, ressentiMatin: -6, uvMax: 7 });
  assert.match(choisirConseil(tout, { aqiMax: 90 }, cfg), /^Air/);
  assert.match(choisirConseil(tout, airBon, cfg), /^Vent fort/);
  assert.match(choisirConseil(m({ tempMinGel: -3, ressentiMatin: -6, cumul: 5, probaMax: 90, creneaux: [{ debut: 8, fin: 10 }] }), airBon, cfg), /^Gel/);
  const inverse = avec({ conseil: { priorite: ['creme_solaire', 'parapluie'] } });
  assert.match(choisirConseil(tout, airBon, inverse), /^Crème solaire/);
});

test('seuils lus dans la config, pas dans le code', () => {
  assert.equal(choisirConseil(m({ rafalesMax: 60 }), airBon, avec({ conseil: { vent_fort: { rafales: 60 } } })), 'Vent fort, rafales jusqu\'à 60 km/h : prudence à vélo.');
});

test('données absentes (source en panne) : pas d\'erreur, pas de conseil', () => {
  assert.equal(choisirConseil(null, null, cfg), null);
});

test('conseil inconnu dans la config : erreur explicite', () => {
  assert.throws(() => choisirConseil(calme, airBon, avec({ conseil: { priorite: ['bonnet'] } })), /bonnet/);
});

test('format des degrés', () => {
  assert.deepEqual([deg(5.5), deg(-0.2), deg(-2.6), deg(0)], ['6', '0', '−3', '0']);
});
