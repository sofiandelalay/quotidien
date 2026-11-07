// Assemble le site de la page de détail dans un dossier (par défaut _site/, jamais commité) :
// fichiers de page/ + icônes générées. data.json y est écrit par src/main.mjs --site _site.
//   node scripts/site.mjs [dossier]
import { mkdir, readdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { png, pixelIcone, TAILLES } from './icones.mjs';

const PAGE = fileURLToPath(new URL('../page/', import.meta.url));

export async function construireSite(dossier = '_site') {
  await mkdir(dossier, { recursive: true });
  const fichiers = await readdir(PAGE);
  for (const f of fichiers) await copyFile(join(PAGE, f), join(dossier, f));
  for (const t of TAILLES) await writeFile(join(dossier, `icone-${t}.png`), png(t, pixelIcone));
  await writeFile(join(dossier, '.nojekyll'), '');
  return [...fichiers, ...TAILLES.map((t) => `icone-${t}.png`)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1])) {
  const dossier = process.argv[2] ?? '_site';
  const f = await construireSite(dossier);
  console.log(`Site assemblé dans ${dossier}/ : ${f.join(', ')}`);
}
