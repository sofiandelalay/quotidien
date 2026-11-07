// Génère les fixtures (mêmes formes que les vraies réponses, cf. docs/sources.md).
// node test/fixtures/generer.mjs
import { writeFileSync } from 'node:fs';

const dossier = new URL('./matin/', import.meta.url);
const ecrire = (nom, o) => writeFileSync(new URL(nom, dossier), JSON.stringify(o, null, 1) + '\n');
const jours = ['2026-11-07', '2026-11-08', '2026-11-09'];
const time = jours.flatMap((j) => Array.from({ length: 24 }, (_, h) => `${j}T${String(h).padStart(2, '0')}:00`));

// Journée du 7 : pluie de 14h à 17h, une heure à 40 % le matin (non pluvieuse), ressenti frais.
const temp = time.map((t) => { const h = +t.slice(11, 13); return +(6.4 + 5.9 * Math.max(0, Math.sin(((h - 7) / 14) * Math.PI))).toFixed(1); });
const mm = time.map((t) => (t.startsWith('2026-11-07') ? { 14: 0.6, 15: 1.8, 16: 1.1 }[+t.slice(11, 13)] ?? 0 : 0));
const proba = time.map((t) => (t.startsWith('2026-11-07') ? { 9: 40, 13: 35, 14: 80, 15: 90, 16: 85, 17: 45 }[+t.slice(11, 13)] ?? 10 : 5));
ecrire('prevision.json', {
  latitude: 50.638, longitude: 3.074, timezone: 'Europe/Paris', utc_offset_seconds: 3600,
  hourly_units: { time: 'iso8601', temperature_2m: '°C', apparent_temperature: '°C', precipitation: 'mm', precipitation_probability: '%', weather_code: 'wmo code', wind_speed_10m: 'km/h', wind_gusts_10m: 'km/h', uv_index: '' },
  hourly: {
    time,
    temperature_2m: temp,
    apparent_temperature: temp.map((t) => +(t - 2.5).toFixed(1)),
    precipitation: mm,
    precipitation_probability: proba,
    weather_code: mm.map((x) => (x > 0 ? 61 : 3)),
    wind_speed_10m: time.map((t) => (+t.slice(11, 13) === 15 ? 22.3 : 14.1)),
    wind_gusts_10m: time.map((t) => (+t.slice(11, 13) === 15 ? 41.8 : 25)),
    uv_index: time.map((t) => (+t.slice(11, 13) === 13 ? 1.4 : 0.3)),
  },
  daily: {
    time: jours,
    weather_code: [61, 3, 3],
    temperature_2m_min: [6.4, 5.3, 2.4],
    temperature_2m_max: [12.3, 10.2, 11],
    sunrise: ['2026-11-07T07:49', '2026-11-08T07:50', '2026-11-09T07:52'],
    sunset: ['2026-11-07T17:13', '2026-11-08T17:11', '2026-11-09T17:09'],
  },
});

const t2 = time.slice(0, 48);
ecrire('air.json', {
  latitude: 50.6, longitude: 3.1, timezone: 'Europe/Paris',
  hourly: {
    time: t2,
    european_aqi: t2.map((t) => (+t.slice(11, 13) === 18 ? 35 : 22)),
    pm10: t2.map(() => 18.2), pm2_5: t2.map(() => 11.5),
    alder_pollen: t2.map(() => 0), birch_pollen: t2.map(() => 0), grass_pollen: t2.map(() => 0),
    mugwort_pollen: t2.map(() => 0), olive_pollen: t2.map(() => 0), ragweed_pollen: t2.map(() => 0),
  },
});

const f = (date, localName) => ({ date, localName, name: localName, countryCode: 'FR', fixed: false, global: true, counties: null, launchYear: null, types: ['Public'] });
ecrire('feries-2026.json', [f('2026-01-01', "Jour de l'an"), f('2026-11-01', 'Toussaint'), f('2026-11-11', 'Armistice 1918'), f('2026-12-25', 'Noël')]);
ecrire('feries-2027.json', [f('2027-01-01', "Jour de l'an")]);
ecrire('commune.json', [{ nom: 'Lille' }]);
ecrire('fete.json', { success: true, message: 'Namedays for 11-07', data: { fr: 'Carine', de: 'Carina' } });
ecrire('verset.json', {
  code: 200, status: 'OK',
  data: [
    { number: 6222, text: 'إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', edition: { identifier: 'quran-uthmani' }, surah: { number: 94, name: 'سُورَةُ الشَّرۡحِ', englishName: 'Ash-Sharh' }, numberInSurah: 6 },
    { number: 6222, text: 'à côté de la difficulté, est certes, une facilité!', edition: { identifier: 'fr.hamidullah' }, surah: { number: 94, name: 'سُورَةُ الشَّرۡحِ', englishName: 'Ash-Sharh' }, numberInSurah: 6 },
  ],
});
console.log('fixtures écrites');
