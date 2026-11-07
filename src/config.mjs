import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

export async function chargerConfig(fichier = new URL('../config.yaml', import.meta.url)) {
  return YAML.parse(await readFile(fichier, 'utf8'));
}
