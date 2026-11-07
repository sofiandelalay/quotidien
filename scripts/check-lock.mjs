// Vérifie que package-lock.json ne référence que le registre public npmjs.
import { readFileSync, existsSync } from 'node:fs';

const fichier = new URL('../package-lock.json', import.meta.url);
if (!existsSync(fichier)) {
  console.log('check-lock : pas de package-lock.json, rien à vérifier.');
  process.exit(0);
}
const texte = readFileSync(fichier, 'utf8');
const urls = [...texte.matchAll(/https?:\/\/[^"\s]+/g)].map((m) => m[0]);
const interdites = urls.filter((u) => !u.startsWith('https://registry.npmjs.org/'));
if (interdites.length) {
  console.error('check-lock : adresses hors registre public :');
  for (const u of [...new Set(interdites)].slice(0, 10)) console.error('  ' + u);
  process.exit(1);
}
console.log(`check-lock : OK (${urls.length} URL, toutes sur registry.npmjs.org).`);
