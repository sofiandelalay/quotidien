// Diagnostic des sources : appelle chaque API depuis GitHub Actions et affiche
// le statut, le temps de réponse et la forme de la réponse (types, extraits courts).
// Aucun secret n'est affiché : les noms de sujets ntfy sont masqués (::add-mask::).
import { randomBytes } from 'node:crypto';

const LAT = 50.6292;
const LON = 3.0573;
const now = new Date();
const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Paris', year: 'numeric' }).format(now));
const md = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Paris', month: 'numeric', day: 'numeric' })
  .formatToParts(now)
  .reduce((acc, p) => ({ ...acc, [p.type]: Number(p.value) }), {});

function mask(value) {
  if (value) console.log(`::add-mask::${value}`);
}

function shape(v, depth = 0, maxDepth = 4) {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (!v.length) return '[] (vide)';
    if (depth >= maxDepth) return `Array(${v.length})`;
    return `Array(${v.length}) of ${shape(v[0], depth + 1, maxDepth)}`;
  }
  if (typeof v === 'object') {
    if (depth >= maxDepth) return `{${Object.keys(v).slice(0, 12).join(', ')}}`;
    const keys = Object.keys(v);
    const pad = '  '.repeat(depth + 1);
    const lines = keys.slice(0, 30).map((k) => `${pad}${k}: ${shape(v[k], depth + 1, maxDepth)}`);
    if (keys.length > 30) lines.push(`${pad}… (${keys.length - 30} clés de plus)`);
    return `{\n${lines.join('\n')}\n${'  '.repeat(depth)}}`;
  }
  if (typeof v === 'string') return `string ${JSON.stringify(v.length > 70 ? v.slice(0, 70) + '…' : v)}`;
  return `${typeof v} ${JSON.stringify(v)}`;
}

const results = [];

async function probe(name, url, { init, show = (j) => shape(j), text = false, hideUrl = false } = {}) {
  const t0 = Date.now();
  console.log(`\n::group::${name}`);
  console.log(`URL : ${hideUrl ? '(masquée)' : url}`);
  let ok = false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), ...init });
    const ms = Date.now() - t0;
    const ct = res.headers.get('content-type');
    console.log(`HTTP ${res.status} · ${ms} ms · ${ct}`);
    const body = await res.text();
    console.log(`Taille : ${body.length} octets`);
    if (text) {
      console.log(body.slice(0, 1500));
    } else {
      try {
        const j = JSON.parse(body);
        console.log(show(j));
      } catch {
        console.log('Réponse non JSON :', body.slice(0, 500));
      }
    }
    ok = res.ok;
  } catch (e) {
    console.log(`ERREUR : ${e.name} ${e.message}`);
  }
  console.log('::endgroup::');
  results.push({ name, ok });
  return ok;
}

// --- Météo -----------------------------------------------------------------
await probe(
  'open-meteo forecast',
  'https://api.open-meteo.com/v1/forecast?latitude=50.63&longitude=3.06' +
    '&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index' +
    '&daily=weather_code,temperature_2m_min,temperature_2m_max,sunrise,sunset,precipitation_sum,uv_index_max,wind_gusts_10m_max' +
    '&timezone=Europe%2FParis&forecast_days=3&wind_speed_unit=kmh',
  {
    show: (j) =>
      shape(j, 0, 2) +
      `\nhourly.time[0..2] = ${JSON.stringify(j.hourly?.time?.slice(0, 3))} (n=${j.hourly?.time?.length})` +
      `\nhourly_units = ${JSON.stringify(j.hourly_units)}` +
      `\ndaily = ${JSON.stringify(j.daily)}`,
  },
);

await probe(
  'open-meteo air quality + pollens',
  'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=50.63&longitude=3.06' +
    '&hourly=european_aqi,pm10,pm2_5,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen' +
    '&timezone=Europe%2FParis&forecast_days=2',
  {
    show: (j) => {
      const h = j.hourly ?? {};
      const stats = Object.fromEntries(
        Object.entries(h)
          .filter(([k]) => k !== 'time')
          .map(([k, arr]) => {
            const nums = arr.filter((x) => typeof x === 'number');
            return [k, { n: arr.length, nulls: arr.length - nums.length, max: nums.length ? Math.max(...nums) : null }];
          }),
      );
      return shape(j, 0, 2) + `\nhourly_units = ${JSON.stringify(j.hourly_units)}\nstats = ${JSON.stringify(stats, null, 1)}`;
    },
  },
);

// --- Jours fériés ------------------------------------------------------------
for (const y of [year, year + 1]) {
  await probe(`nager.date FR ${y}`, `https://date.nager.at/api/v3/PublicHolidays/${y}/FR`, {
    show: (j) => shape(j) + `\nnoms : ${j.map((h) => `${h.date} ${h.localName}${h.global ? '' : ' (régional:' + h.counties + ')'}`).join(' | ')}`,
  });
}
await probe('calendrier.api.gouv.fr (repli)', `https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`, {
  show: (j) => JSON.stringify(j),
});

// --- Commune -----------------------------------------------------------------
await probe('geo.api.gouv.fr communes', `https://geo.api.gouv.fr/communes?lat=${LAT}&lon=${LON}&fields=nom,code,codesPostaux&format=json`, {
  show: (j) => JSON.stringify(j),
});
await probe('geo.api.gouv.fr communes (en mer, attendu vide)', 'https://geo.api.gouv.fr/communes?lat=50.00&lon=0.50&fields=nom&format=json', {
  show: (j) => JSON.stringify(j),
});

// --- Fête du jour ------------------------------------------------------------
const nd = [
  ['abalin V2 today (POST)', 'https://nameday.abalin.net/api/V2/today', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ country: 'fr', timezone: 'Europe/Paris' }) }],
  ['abalin V2 today (GET)', 'https://nameday.abalin.net/api/V2/today?country=fr&timezone=Europe/Paris'],
  ['abalin V2 date (GET)', `https://nameday.abalin.net/api/V2/date?day=${md.day}&month=${md.month}&country=fr`],
  ['abalin V1 today', 'https://nameday.abalin.net/api/V1/today?country=fr&timezone=Europe%2FParis'],
  ['abalin V1 getdate', `https://nameday.abalin.net/api/V1/getdate?day=${md.day}&month=${md.month}&country=fr`],
];
for (const [label, url, init] of nd) {
  await probe(`fête du jour : ${label}`, url, { init, show: (j) => JSON.stringify(j).slice(0, 800) });
}
// Candidats de repli pour constituer un fichier statique (calendrier des fêtes).
await probe('fête : abalin V1 getdate 1er janvier (repli statique)', 'https://nameday.abalin.net/api/V1/getdate?day=1&month=1&country=fr', {
  show: (j) => JSON.stringify(j).slice(0, 400),
});

// --- Verset ------------------------------------------------------------------
await probe('alquran.cloud éditions françaises', 'https://api.alquran.cloud/v1/edition?language=fr', {
  show: (j) => JSON.stringify(j.data?.map((e) => `${e.identifier} (${e.format}/${e.type}) ${e.englishName}`)),
});
await probe('alquran.cloud ayah 2:255 arabe + français', 'https://api.alquran.cloud/v1/ayah/2:255/editions/quran-uthmani,fr.hamidullah', {
  show: (j) => shape(j, 0, 5),
});
await probe('alquran.cloud ayah numéro global 6236', 'https://api.alquran.cloud/v1/ayah/6236/editions/quran-simple,fr.hamidullah', {
  show: (j) => JSON.stringify(j.data?.map((d) => ({ n: d.number, s: d.surah?.number, a: d.numberInSurah, len: d.text.length, text: d.text }))),
});
await probe('alquran.cloud meta', 'https://api.alquran.cloud/v1/meta', { show: (j) => shape(j, 0, 3) });

// --- Hadith ------------------------------------------------------------------
await probe('fawazahmed0 editions.json', 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions.json', {
  show: (j) => {
    const fr = [];
    for (const [k, col] of Object.entries(j)) for (const c of col.collection ?? []) if (c.language === 'French') fr.push(`${k}: ${c.name} ${c.link}`);
    return `collections : ${Object.keys(j).join(', ')}\nnawawi = ${JSON.stringify(j.nawawi, null, 1)}\néditions françaises :\n${fr.join('\n')}`;
  },
});
for (const url of [
  'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/fra-nawawi.min.json',
  'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/fra-nawawi.json',
  'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/fra-nawawi/1.json',
]) {
  await probe(`fawazahmed0 ${url.split('/editions/')[1]}`, url, {
    show: (j) => shape(j, 0, 3) + `\nexemple : ${JSON.stringify(j.hadiths?.[0] ?? j).slice(0, 700)}\nnombre : ${j.hadiths?.length}`,
  });
}

// --- ntfy.sh -----------------------------------------------------------------
const tmpTopic = 'diag-' + randomBytes(16).toString('hex');
mask(tmpTopic);
mask(process.env.NTFY_TOPIC_POSITION);
mask(process.env.NTFY_TOPIC_BRIEFING);

await probe('ntfy.sh health', 'https://ntfy.sh/v1/health', { show: (j) => JSON.stringify(j) });
await probe('ntfy.sh publication JSON différée (sujet jetable, delay=10m)', 'https://ntfy.sh/', {
  hideUrl: true,
  init: {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ topic: tmpTopic, title: '☂️ Test accentué é à ç', message: 'Ligne 1\nLigne 2 · 14h–17h', delay: '10m', tags: ['umbrella'] }),
  },
  show: (j) => JSON.stringify({ ...j, topic: '(masqué)' }),
});
await probe('ntfy.sh lecture des messages programmés (scheduled=1)', `https://ntfy.sh/${tmpTopic}/json?poll=1&scheduled=1`, {
  hideUrl: true,
  text: true,
});
if (process.env.NTFY_TOPIC_POSITION) {
  await probe('ntfy.sh lecture sujet de position (poll, since=24h)', `https://ntfy.sh/${process.env.NTFY_TOPIC_POSITION}/json?poll=1&since=24h`, {
    hideUrl: true,
    text: true,
  });
}

console.log('\n=== Résumé ===');
for (const r of results) console.log(`${r.ok ? 'OK ' : 'KO '} ${r.name}`);
