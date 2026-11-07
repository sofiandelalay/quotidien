import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paris, instantParis, decalageParis, ajouterJours, ecartJours, dateCourte } from '../src/temps.mjs';

test('7h30 à Paris en UTC, hiver et été', () => {
  assert.equal(instantParis('2026-01-15', '07:30').toISOString(), '2026-01-15T06:30:00.000Z');
  assert.equal(instantParis('2026-07-15', '07:30').toISOString(), '2026-07-15T05:30:00.000Z');
});

test("passage à l'heure d'été (dimanche 29 mars 2026, 2h → 3h)", () => {
  assert.equal(instantParis('2026-03-28', '07:30').toISOString(), '2026-03-28T06:30:00.000Z');
  assert.equal(instantParis('2026-03-29', '07:30').toISOString(), '2026-03-29T05:30:00.000Z');
  assert.equal(decalageParis(new Date('2026-03-29T00:59:00Z')), 60);
  assert.equal(decalageParis(new Date('2026-03-29T01:00:00Z')), 120);
  assert.equal(paris(new Date('2026-03-29T01:00:00Z')).hhmm, '03:00');
});

test("passage à l'heure d'hiver (dimanche 25 octobre 2026, 3h → 2h)", () => {
  assert.equal(instantParis('2026-10-24', '07:30').toISOString(), '2026-10-24T05:30:00.000Z');
  assert.equal(instantParis('2026-10-25', '07:30').toISOString(), '2026-10-25T06:30:00.000Z');
  assert.equal(decalageParis(new Date('2026-10-25T00:59:00Z')), 120);
  assert.equal(decalageParis(new Date('2026-10-25T01:00:00Z')), 60);
});

test('la date locale change à minuit Paris, pas à minuit UTC', () => {
  assert.equal(paris(new Date('2026-11-07T23:30:00Z')).date, '2026-11-08');
  assert.equal(paris(new Date('2026-07-07T22:30:00Z')).date, '2026-07-08');
  assert.equal(paris(new Date('2026-07-07T21:59:00Z')).date, '2026-07-07');
});

test('calendrier : jours, écarts et dates courtes', () => {
  assert.equal(ajouterJours('2026-12-31', 1), '2027-01-01');
  assert.equal(ajouterJours('2028-02-28', 1), '2028-02-29');
  assert.equal(ecartJours('2026-11-07', '2026-11-11'), 4);
  assert.equal(ecartJours('2026-03-28', '2026-03-30'), 2, 'le changement d\'heure ne fausse pas le compte');
  assert.equal(dateCourte('2026-11-11'), '11 nov');
  assert.equal(dateCourte('2027-01-01'), '1er janv');
  assert.equal(dateCourte('2026-08-15'), '15 août');
});
