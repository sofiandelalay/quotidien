// state/state.json : passages déjà faits et alertes déjà envoyées. Toujours petit, purgé à N jours.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHEMIN_ETAT = fileURLToPath(new URL('../state/state.json', import.meta.url));

export function etatVide() {
  return { version: 1, dernier_passage: null, passages: {}, alertes: {} };
}

export async function lireEtat(chemin = CHEMIN_ETAT) {
  try {
    const e = JSON.parse(await readFile(chemin, 'utf8'));
    return { ...etatVide(), ...e, passages: e.passages ?? {}, alertes: e.alertes ?? {} };
  } catch (e) {
    if (e.code === 'ENOENT') return etatVide();
    throw new Error(`state.json illisible : ${e.message}`);
  }
}

/** Supprime les alertes envoyées il y a plus de `jours` jours. Ne modifie pas l'objet reçu. */
export function purger(etat, maintenant, jours) {
  const limite = maintenant.getTime() - jours * 86400000;
  const alertes = Object.fromEntries(Object.entries(etat.alertes ?? {}).filter(([, quand]) => Date.parse(quand) >= limite));
  return { ...etat, alertes };
}

export async function ecrireEtat(etat, chemin = CHEMIN_ETAT) {
  await mkdir(dirname(chemin), { recursive: true });
  const tri = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const propre = { ...etat, passages: tri(etat.passages), alertes: tri(etat.alertes) };
  await writeFile(chemin, JSON.stringify(propre, null, 2) + '\n');
}
