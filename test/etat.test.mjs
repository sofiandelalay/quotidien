import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { purger, lireEtat, ecrireEtat, etatVide } from '../src/etat.mjs';

test('purge : supprime les alertes de plus de 14 jours, garde les autres', () => {
  const etat = { ...etatVide(), passages: { matin: '2026-11-07' }, alertes: { 'gel:2026-10-20': '2026-10-19T17:05:00Z', 'gel:2026-10-25': '2026-10-24T17:05:00Z', 'rando:2026-11-14': '2026-11-05T17:05:00Z' } };
  const p = purger(etat, new Date('2026-11-07T06:00:00Z'), 14);
  assert.deepEqual(Object.keys(p.alertes), ['gel:2026-10-25', 'rando:2026-11-14']);
  assert.equal(Object.keys(etat.alertes).length, 3, 'l\'objet reçu n\'est pas modifié');
  assert.deepEqual(p.passages, { matin: '2026-11-07' });
});

test('lecture d\'un fichier absent : état vide ; écriture triée et relue', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'etat-'));
  const f = join(dir, 'state', 'state.json');
  assert.deepEqual(await lireEtat(f), etatVide());
  await ecrireEtat({ ...etatVide(), alertes: { b: '2026-11-07T00:00:00Z', a: '2026-11-06T00:00:00Z' } }, f);
  assert.deepEqual(Object.keys(JSON.parse(await readFile(f, 'utf8')).alertes), ['a', 'b']);
  assert.deepEqual((await lireEtat(f)).alertes.a, '2026-11-06T00:00:00Z');
});
