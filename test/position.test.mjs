import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lirePosition, dernierePosition, positionActuelle } from '../src/position.mjs';
import { cfg } from './aide.mjs';

test('formats de position tolérés (iPhone en français), arrondi à 2 décimales', () => {
  const cas = {
    '50.63,3.06': { lat: 50.63, lon: 3.06 },
    '50,63,3,06': { lat: 50.63, lon: 3.06 }, // virgule décimale
    '50,63;3,06': { lat: 50.63, lon: 3.06 },
    ' 48.8566 2.3522 ': { lat: 48.86, lon: 2.35 },
    '-33.87,151.21': { lat: -33.87, lon: 151.21 },
    '50,3': { lat: 50, lon: 3 },
  };
  for (const [t, p] of Object.entries(cas)) assert.deepEqual(lirePosition(t), p, t);
  for (const t of ['', 'bonjour', '95,10', '50.6,200', '0,0', '50.63', null]) assert.equal(lirePosition(t), null, String(t));
});

test('dernier message valide de moins de 12 h', () => {
  const maintenant = new Date('2026-11-07T06:00:00Z');
  const t = maintenant.getTime() / 1000;
  const ligne = (age, message, event = 'message') => JSON.stringify({ id: String(age), time: t - age * 3600, event, topic: 'x', message });
  const nd = [ligne(13, '45.76,4.84'), ligne(5, '48.86,2.35'), ligne(2, 'texte invalide'), ligne(1, '', 'open'), ''].join('\n');
  assert.deepEqual(dernierePosition(nd, maintenant, 12), { lat: 48.86, lon: 2.35, time: t - 5 * 3600 });
  assert.equal(dernierePosition(ligne(13, '45.76,4.84'), maintenant, 12), null, 'trop vieux');
  assert.equal(dernierePosition('', maintenant, 12), null);
});

test('positionActuelle : Raccourci, sinon Lille ; le sujet est encodé dans l\'URL', async () => {
  const maintenant = new Date('2026-11-07T06:00:00Z');
  let url;
  const ok = async (u) => {
    url = u;
    return new Response(JSON.stringify({ id: 'a', time: maintenant.getTime() / 1000 - 600, event: 'message', message: '43,30,5,37' }) + '\n');
  };
  assert.deepEqual(await positionActuelle(cfg, { maintenant, topic: 'qp-abc', fetcher: ok }), { lat: 43.3, lon: 5.37, source: 'raccourci', raison: 'position du Raccourci' });
  assert.equal(url, 'https://ntfy.sh/qp-abc/json?poll=1&since=12h');

  const vide = async () => new Response('');
  const p = await positionActuelle(cfg, { maintenant, topic: 'qp-abc', fetcher: vide });
  assert.deepEqual([p.source, p.lat, p.lon, p.nomParDefaut], ['defaut', 50.6292, 3.0573, 'Lille']);
  assert.equal((await positionActuelle(cfg, { maintenant, topic: '', fetcher: ok })).source, 'defaut');
  const panne = async () => { throw new TypeError('fetch failed'); };
  assert.equal((await positionActuelle(cfg, { maintenant, topic: 'x', fetcher: panne })).raison, 'ntfy injoignable');
});
