// Icônes de l'écran d'accueil, dessinées sans dépendance (encodeur PNG minimal avec zlib).
// Dégradé de ciel, soleil et nuage, lissés par suréchantillonnage. Fond opaque : iOS arrondit les coins.
import { deflateSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloc(type, data) {
  const t = Buffer.from(type, 'ascii');
  const lg = Buffer.alloc(4);
  lg.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([lg, t, data, crc]);
}

/** PNG RVB 8 bits à partir d'une fonction pixel(x, y) → [r, v, b] (x, y entre 0 et 1). */
export function png(taille, pixel, sur = 4) {
  const lignes = Buffer.alloc(taille * (taille * 3 + 1));
  for (let y = 0; y < taille; y++) {
    lignes[y * (taille * 3 + 1)] = 0; // filtre « aucun »
    for (let x = 0; x < taille; x++) {
      let r = 0, v = 0, b = 0;
      for (let sy = 0; sy < sur; sy++) {
        for (let sx = 0; sx < sur; sx++) {
          const [pr, pv, pb] = pixel((x + (sx + 0.5) / sur) / taille, (y + (sy + 0.5) / sur) / taille);
          r += pr; v += pv; b += pb;
        }
      }
      const n = sur * sur;
      const o = y * (taille * 3 + 1) + 1 + x * 3;
      lignes[o] = Math.round(r / n);
      lignes[o + 1] = Math.round(v / n);
      lignes[o + 2] = Math.round(b / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; // bits par composante
  ihdr[9] = 2; // RVB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(lignes, { level: 9 })), bloc('IEND', Buffer.alloc(0))]);
}

const melange = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const dans = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** Dessin de l'icône : ciel, soleil, nuage. */
export function pixelIcone(x, y) {
  let c = melange([88, 164, 246], [37, 99, 214], y); // ciel
  const soleil = dans(x, y, 0.62, 0.38, 0.2);
  const halo = dans(x, y, 0.62, 0.38, 0.27);
  if (halo && !soleil) c = melange(c, [255, 255, 255], 0.22);
  if (soleil) c = [255, 204, 51];
  const nuage =
    dans(x, y, 0.36, 0.62, 0.15) || dans(x, y, 0.53, 0.56, 0.18) || dans(x, y, 0.7, 0.64, 0.13) ||
    (x >= 0.24 && x <= 0.78 && y >= 0.62 && y <= 0.77) || dans(x, y, 0.25, 0.69, 0.08) || dans(x, y, 0.77, 0.7, 0.07);
  if (nuage) c = [255, 255, 255];
  return c;
}

export const TAILLES = [180, 192, 512];
