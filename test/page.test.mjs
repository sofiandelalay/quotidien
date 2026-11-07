import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verset, hadith } from '../src/sources.mjs';
import { construireDonneesPage } from '../src/page.mjs';
import { resumerMeteo, resumerAir } from '../src/analyse.mjs';
import { rendre, esc } from '../page/rendu.mjs';
import { png, pixelIcone } from '../scripts/icones.mjs';
import { ajouterJours, numeroJour } from '../src/temps.mjs';
import { cfg, fixture } from './aide.mjs';

const { refs } = JSON.parse(readFileSync(new URL('../data/versets-courts.json', import.meta.url), 'utf8'));
const jour = '2026-11-07';

// Faux AlQuran Cloud : renvoie un texte qui contient la référence demandée.
function faux(urls = []) {
  return async (url) => {
    urls.push(url);
    const ref = url.match(/ayah\/(\d+:\d+)\//)[1];
    return { data: [{ text: `عربي ${ref}`, surah: { englishName: 'Sourate', name: 'سورة' } }, { text: `Verset ${ref}.` }] };
  };
}

test('verset : choix déterministe selon la date, parmi les versets courts, référence sourate:verset', async () => {
  const urls = [];
  const a = await verset(jour, faux(urls));
  const b = await verset(jour, faux());
  assert.deepEqual(a, b, 'même jour → même verset');
  assert.equal(a.ref, refs[numeroJour(jour) % refs.length]);
  assert.match(a.ref, /^\d{1,3}:\d{1,3}$/);
  assert.equal(urls[0], `https://api.alquran.cloud/v1/ayah/${a.ref}/editions/quran-uthmani,fr.hamidullah`);
  assert.deepEqual([a.ar, a.fr], [`عربي ${a.ref}`, `Verset ${a.ref}.`]);
  const semaine = await Promise.all(Array.from({ length: 7 }, (_, i) => verset(ajouterJours(jour, i), faux())));
  assert.equal(new Set(semaine.map((v) => v.ref)).size, 7, 'un verset différent chaque jour');
});

test('versets courts : liste non vide, références valides', () => {
  assert.ok(refs.length > 1000);
  for (const r of refs) {
    const [s, v] = r.split(':').map(Number);
    assert.ok(s >= 1 && s <= 114 && v >= 2, r); // premier verset de sourate exclu
  }
});

test('hadith : un par jour, déterministe, les 42 en 42 jours, avec numéro et source', async () => {
  const h1 = await hadith(jour);
  assert.deepEqual(await hadith(jour), h1);
  const numeros = new Set();
  for (let i = 0; i < 42; i++) numeros.add((await hadith(ajouterJours(jour, i))).numero);
  assert.equal(numeros.size, 42);
  assert.match(h1.source, /an-Nawawi.*fawazahmed0\/hadith-api/);
  assert.ok(h1.texte.length > 100);
});

test('hadiths copiés dans data/ : 42 textes en français, sans balise ni problème d\'encodage', () => {
  const { hadiths, source, url } = JSON.parse(readFileSync(new URL('../data/nawawi-fr.json', import.meta.url), 'utf8'));
  assert.equal(hadiths.length, 42);
  assert.deepEqual(hadiths.map((h) => h.numero), Array.from({ length: 42 }, (_, i) => i + 1));
  for (const h of hadiths) assert.doesNotMatch(h.texte, /Ã|â€|<[a-z/]|&[a-z]+;|�/, `n° ${h.numero}`);
  assert.ok(source && url.startsWith('https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api'));
});

// --- data.json -----------------------------------------------------------------------

const donneesCompletes = () => ({
  jour,
  commune: 'Lille',
  meteo: resumerMeteo(fixture('matin/prevision.json'), jour, cfg),
  air: resumerAir(fixture('matin/air.json'), jour, cfg),
  ferie: { date: '2026-11-11', nom: 'Armistice' },
  fete: 'Carine',
  verset: { ref: '94:6', ar: 'إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', fr: 'Oui, à côté de la difficulté est une facilité.', sourate: 'Ash-Sharh', sourateAr: 'سُورَةُ الشَّرۡحِ' },
  hadith: { numero: 13, texte: 'Aucun de vous ne croit vraiment…', source: 'Les quarante hadiths de an-Nawawi' },
  // Champs sensibles qui ne doivent JAMAIS atteindre la page :
  agenda: ['10h Kiné SECRET-AGENDA'],
  anniversaires: ['🎂 Anniversaire de Marie-SECRETE'],
  lat: 43.2965,
  lon: 5.3698,
  position: { lat: 43.2965, lon: 5.3698, source: 'raccourci' },
  topic: 'qb-sujet-SECRET',
  calendriers: [{ libelle: 'Outlook', url: 'https://outlook.live.com/owa/calendar/SECRET/calendar.ics' }],
});

test('data.json : liste blanche de champs, aucun champ sensible', () => {
  const d = construireDonneesPage(donneesCompletes(), { genere: new Date('2026-11-07T05:23:00Z'), passage: 'matin', cfg });
  const json = JSON.stringify(d);
  assert.deepEqual(Object.keys(d).sort(), ['air', 'commune', 'conseil', 'ferie', 'fete', 'genere', 'hadith', 'jour', 'meteo', 'passage', 'verset', 'version']);
  assert.deepEqual(Object.keys(d.meteo).sort(), ['coucher', 'cumul', 'emoji', 'heures', 'lever', 'max', 'min', 'pluie', 'rafales_max', 'uv_max', 'vent_max']);
  assert.deepEqual(Object.keys(d.meteo.heures[0]).sort(), ['h', 'mm', 'proba', 'temp']);
  assert.equal(d.meteo.heures.length, 24);
  for (const interdit of ['SECRET', 'Kiné', 'Marie', 'Anniversaire', '43.29', '5.36', '5.37', 'qb-', 'outlook', 'raccourci', 'lat', 'lon']) {
    assert.ok(!json.includes(interdit), `« ${interdit} » dans data.json`);
  }
  assert.equal(d.commune, 'Lille');
  assert.equal(d.ferie.dans, 4);
});

test('data.json : sources en échec → sections nulles, le reste est présent', () => {
  const d = construireDonneesPage({ jour, commune: 'Lille', meteo: null, air: null, ferie: null, fete: null, verset: null, hadith: null }, { genere: new Date(), passage: 'soir', cfg });
  assert.deepEqual([d.meteo, d.air, d.ferie, d.fete, d.verset, d.hadith, d.conseil], [null, null, null, null, null, null, null]);
  assert.equal(d.commune, 'Lille');
});

// --- Rendu HTML ------------------------------------------------------------------------

const data = () => construireDonneesPage(donneesCompletes(), { genere: new Date('2026-11-07T05:23:00Z'), passage: 'matin', cfg });

test('rendu : toutes les sections, verset arabe en rtl avec sa référence, hadith avec numéro et source', () => {
  const html = rendre(data(), new Date('2026-11-07T10:00:00Z'));
  for (const attendu of ['<h1>Lille</h1>', 'mis à jour à 6h23', '<b>6°</b> / <b>12°</b>', 'Pluie 14h–17h', 'class="frise"', 'Parapluie conseillé', 'moyen', 'Armistice', 'dans 4 jours', 'Carine', 'lang="ar" dir="rtl"', '<b>94:6</b>', 'Hadith n° <b>13</b>', 'Les quarante hadiths de an-Nawawi']) {
    assert.ok(html.includes(attendu), `manque : ${attendu}`);
  }
  assert.ok(!html.includes('class="alerte"'), 'données récentes : pas d\'avertissement');
  assert.equal((html.match(/class="h( maintenant)?"/g) ?? []).length, 24, 'frise de 24 h');
  assert.ok(html.includes('class="h maintenant"'), 'heure actuelle marquée');
});

test('rendu : avertissement au-delà de 26 h', () => {
  const d = data();
  assert.ok(!rendre(d, new Date(Date.parse(d.genere) + 25.9 * 3600000)).includes('class="alerte"'));
  assert.match(rendre(d, new Date(Date.parse(d.genere) + 26.1 * 3600000)), /class="alerte" role="alert">Données de plus de 26 h/);
});

test('rendu : section omise quand la source a échoué', () => {
  const d = data();
  const sansVerset = rendre({ ...d, verset: null });
  assert.ok(!sansVerset.includes('dir="rtl"') && sansVerset.includes('Hadith n°'));
  const sansRien = rendre({ ...d, verset: null, hadith: null, air: null, ferie: null, fete: null });
  assert.ok(!sansRien.includes('Du jour') && !sansRien.includes('<h2>Air</h2>') && !sansRien.includes('Prochain férié'));
  assert.match(rendre({ ...d, meteo: null }), /Météo indisponible/);
});

test('rendu : tout texte des données est échappé', () => {
  const piege = '<img src=x onerror=alert(1)>';
  const html = rendre({ ...data(), commune: piege, fete: piege, conseil: piege, verset: { ...data().verset, fr: piege } });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes(esc(piege)));
});

test('icône : PNG valide, opaque, aux bonnes dimensions', () => {
  const p = png(180, pixelIcone);
  assert.deepEqual([...p.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(p.readUInt32BE(16), 180);
  assert.equal(p.readUInt32BE(20), 180);
  assert.equal(p[25], 2, 'RVB sans transparence (iOS remplirait la transparence en noir)');
});

test('page : pas de service worker, manifest et icône déclarés, aucune dépendance externe', () => {
  const html = readFileSync(new URL('../page/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../page/app.mjs', import.meta.url), 'utf8') + readFileSync(new URL('../page/rendu.mjs', import.meta.url), 'utf8');
  assert.ok(!/serviceWorker/.test(js + html));
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="icone-180.png"/);
  assert.ok(!/https?:\/\//.test(html.replace(/<meta[^>]*>/g, '')), 'aucune ressource externe');
  const manifest = JSON.parse(readFileSync(new URL('../page/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map((i) => i.sizes), ['192x192', '512x512']);
});
