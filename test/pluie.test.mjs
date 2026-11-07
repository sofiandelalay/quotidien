import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creneauxPluie, texteCreneaux, formatCreneau } from '../src/pluie.mjs';
import { cfg } from './aide.mjs';

const P = cfg.pluie; // seuil 0.2 mm ou 60 %, trou fusionné ≤ 1 h
const jour = (pluvieuses, { de = 7, a = 22 } = {}) =>
  Array.from({ length: a - de }, (_, i) => de + i).map((heure) => ({ heure, mm: pluvieuses.includes(heure) ? 1 : 0, proba: 10 }));

test('journée sèche : aucun créneau', () => {
  assert.deepEqual(creneauxPluie(jour([]), P), []);
  assert.equal(texteCreneaux([], 3), null);
});

test('heures consécutives regroupées, fin exclue', () => {
  const c = creneauxPluie(jour([14, 15, 16]), P);
  assert.deepEqual(c, [{ debut: 14, fin: 17 }]);
  assert.equal(texteCreneaux(c, 3), '14h–17h');
});

test('une heure sèche entre deux averses : un seul créneau', () => {
  assert.deepEqual(creneauxPluie(jour([9, 11]), P), [{ debut: 9, fin: 12 }]);
});

test('deux heures sèches : deux créneaux', () => {
  const c = creneauxPluie(jour([8, 11, 12]), P);
  assert.deepEqual(c, [{ debut: 8, fin: 9 }, { debut: 11, fin: 13 }]);
  assert.equal(texteCreneaux(c, 3), '8h–9h, 11h–13h');
});

test('la probabilité seule suffit, sous le seuil non', () => {
  const heures = [
    { heure: 10, mm: 0, proba: 60 },
    { heure: 11, mm: 0, proba: 59 },
    { heure: 12, mm: 0.1, proba: 20 },
    { heure: 13, mm: 0.2, proba: 0 },
  ];
  assert.deepEqual(creneauxPluie(heures, P), [{ debut: 10, fin: 11 }, { debut: 13, fin: 14 }]);
});

test('valeurs manquantes (null) traitées comme sèches', () => {
  assert.deepEqual(creneauxPluie([{ heure: 9, mm: null, proba: null }, { heure: 10, mm: 2, proba: null }], P), [{ debut: 10, fin: 11 }]);
});

test('plus de créneaux que le maximum : « par moments »', () => {
  const c = creneauxPluie(jour([8, 11, 14, 17]), P);
  assert.equal(c.length, 4);
  assert.equal(texteCreneaux(c, 3), 'par moments');
});

test('pluie jusqu\'à la fin de journée et jusqu\'à minuit', () => {
  assert.equal(texteCreneaux(creneauxPluie(jour([20, 21]), P), 3), '20h–22h');
  assert.equal(formatCreneau({ debut: 22, fin: 24 }), '22h–minuit');
});

test('fusion désactivée (trou 0) : une heure sèche sépare', () => {
  assert.deepEqual(creneauxPluie(jour([9, 11]), { ...P, fusion_trou_heures: 0 }), [{ debut: 9, fin: 10 }, { debut: 11, fin: 12 }]);
});
