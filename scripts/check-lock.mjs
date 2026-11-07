// Vérifie que package-lock.json ne référence que le registre public npmjs :
//  - chaque champ "resolved" pointe sur https://registry.npmjs.org/ ;
//  - aucune adresse de registre privé (artifactory, jfrog, nexus, verdaccio…) n'apparaît nulle part.
import { readFileSync, existsSync } from 'node:fs';

const fichier = new URL('../package-lock.json', import.meta.url);
if (!existsSync(fichier)) {
  console.log('check-lock : pas de package-lock.json, rien à vérifier.');
  process.exit(0);
}
const texte = readFileSync(fichier, 'utf8');
const lock = JSON.parse(texte);
const erreurs = [];

for (const [chemin, pkg] of Object.entries(lock.packages ?? {})) {
  if (pkg.resolved && !pkg.resolved.startsWith('https://registry.npmjs.org/')) {
    erreurs.push(`${chemin || '(racine)'} : resolved = ${pkg.resolved}`);
  }
}
const suspectes = /(artifactory|jfrog|nexus|verdaccio|npm\.pkg\.github|pkgs\.dev\.azure|\/api\/npm\/)/i;
for (const m of texte.matchAll(/https?:\/\/[^"\s]+/g)) {
  if (suspectes.test(m[0])) erreurs.push(`adresse suspecte : ${m[0]}`);
}

if (erreurs.length) {
  console.error('check-lock : registre non public détecté :');
  for (const e of [...new Set(erreurs)].slice(0, 20)) console.error('  ' + e);
  process.exit(1);
}
const n = Object.values(lock.packages ?? {}).filter((p) => p.resolved).length;
console.log(`check-lock : OK (${n} paquet(s), tous sur registry.npmjs.org).`);
