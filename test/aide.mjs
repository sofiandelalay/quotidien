import { readFileSync } from 'node:fs';
import YAML from 'yaml';

export const cfg = YAML.parse(readFileSync(new URL('../config.yaml', import.meta.url), 'utf8'));
export const fixture = (nom) => JSON.parse(readFileSync(new URL(`./fixtures/${nom}`, import.meta.url), 'utf8'));
/** Copie profonde de la config avec surcharges : avec({ conseil: { vent_fort: { rafales: 60 } } }). */
export function avec(surcharges, base = cfg) {
  const fusion = (a, b) => {
    if (typeof b !== 'object' || b === null || Array.isArray(b)) return b;
    const r = { ...a };
    for (const [k, v] of Object.entries(b)) r[k] = fusion(a?.[k], v);
    return r;
  };
  return fusion(structuredClone(base), surcharges);
}
