// Construit une fois les données statiques versionnées dans data/ :
//  - data/fetes.json          : fête du jour (repli si nameday.abalin.net ne répond pas)
//  - data/nawawi-fr.json      : les 40 hadiths de an-Nawawi en français (fawazahmed0/hadith-api)
//  - data/versets-courts.json : références des versets courts (sélection déterministe par date)
// Lancé depuis GitHub Actions (workflow « donnees »), jamais depuis le PC.
import { writeFile, mkdir } from 'node:fs/promises';
import { corrigerFetes } from './fetes-corrections.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      if (res.status === 429 && i < tries) {
        const attente = Number(res.headers.get("retry-after")) || 65;
        console.log(`429 sur ${new URL(url).host}, pause de ${attente} s`);
        await sleep(attente * 1000);
        continue;
      }
      if (i >= tries) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i >= tries) throw new Error(`${url} : ${e.message}`);
    }
    await sleep(1500 * i);
  }
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
const out = (name, obj) => writeFile(new URL(`../data/${name}`, import.meta.url), JSON.stringify(obj, null, 1) + '\n');

// --- Fêtes ---------------------------------------------------------------------
const fetes = {};
const jours = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= jours[m - 1]; d++) {
    const j = await getJson(`https://nameday.abalin.net/api/V2/date?day=${d}&month=${m}&country=fr`);
    const nom = j?.data?.fr;
    if (nom && nom !== 'n/a') fetes[`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`] = nom;
    await sleep(1100); // limite d'abalin : ~60 requêtes par minute
  }
}
const { fetes: corrigees, suspectes } = corrigerFetes(fetes);
if (suspectes.length) console.log(`::warning::fêtes à vérifier : ${JSON.stringify(suspectes)}`);
await out('fetes.json', { source: 'nameday.abalin.net (API V2, pays fr), corrigé par scripts/fetes-corrections.mjs', fetes: corrigees });
console.log(`fetes.json : ${Object.keys(corrigees).length} jours`);

// --- Hadiths de Nawawi -----------------------------------------------------------
const nawawi = await getJson('https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/fra-nawawi.min.json');
const hadiths = nawawi.hadiths
  .filter((h) => h.text && h.text.trim())
  .map((h) => ({ numero: h.hadithnumber, texte: h.text.trim() }));
await out('nawawi-fr.json', {
  source: 'Les quarante hadiths de an-Nawawi, édition française fra-nawawi de fawazahmed0/hadith-api',
  url: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/fra-nawawi.json',
  hadiths,
});
console.log(`nawawi-fr.json : ${hadiths.length} hadiths`);

// --- Versets courts ----------------------------------------------------------------
const [ar, fr] = await Promise.all([
  getJson('https://api.alquran.cloud/v1/quran/quran-uthmani'),
  getJson('https://api.alquran.cloud/v1/quran/fr.hamidullah'),
]);
const refs = [];
for (const [i, sFr] of fr.data.surahs.entries()) {
  const sAr = ar.data.surahs[i];
  for (const [k, aFr] of sFr.ayahs.entries()) {
    const aAr = sAr.ayahs[k];
    const t = aFr.text.trim();
    const ouvertes = (t.match(/[(«]/g) ?? []).length;
    const fermees = (t.match(/[)»]/g) ?? []).length;
    const ok =
      aFr.numberInSurah > 1 && // le 1er verset contient parfois la basmala dans le texte arabe
      t.length >= 40 &&
      t.length <= 160 &&
      aAr.text.length <= 160 &&
      /^[«A-ZÀ-ÖØ-Ý]/.test(t) && // commence comme une phrase
      /[.!?»]$/.test(t) && // se termine comme une phrase
      ouvertes === fermees;
    if (ok) refs.push(`${sFr.number}:${aFr.numberInSurah}`);
  }
}
await out('versets-courts.json', {
  source: 'api.alquran.cloud (quran-uthmani + fr.hamidullah), versets courts formant une phrase complète',
  criteres: 'français 40–160 caractères, arabe ≤ 160, phrase complète, hors premier verset de sourate',
  refs,
});
console.log(`versets-courts.json : ${refs.length} versets`);
