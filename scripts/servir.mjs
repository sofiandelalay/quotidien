// Sert un dossier en local pour vérifier la page : node scripts/servir.mjs [_site] [8080]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const racine = resolve(process.argv[2] ?? '_site');
const port = Number(process.argv[3] ?? 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const fichier = normalize(join(racine, chemin.endsWith('/') ? chemin + 'index.html' : chemin));
  if (!fichier.startsWith(racine)) return res.writeHead(403).end();
  try {
    const corps = await readFile(fichier);
    res.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(corps);
  } catch {
    res.writeHead(404).end('introuvable');
  }
}).listen(port, '127.0.0.1', () => console.log(`Page servie sur http://127.0.0.1:${port}/`));
