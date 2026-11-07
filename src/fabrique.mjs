// Fabrique de données météo fictives, au format exact des réponses Open-Meteo
// (cf. docs/sources.md), à partir d'une description compacte et lisible :
//
//   { "jours": [ { "date": "2026-11-12", "tmin": 2, "tmax": 9, "pluie": { "15": 1.2 }, "rafales": 40, "uv": 1 } ],
//     "air": { "2026-11-12": 65 } }
//
// - Température : tmin à 6h, tmax à 15h, interpolée heure par heure (la nuit relie tmax au tmin du lendemain).
// - pluie : cumul (mm) par heure ; une heure citée a une probabilité de 90 %, les autres 5 %.
// - air : indice européen constant sur la journée.
import { ajouterJours } from './temps.mjs';

const pad = (n) => String(n).padStart(2, '0');

export function fabriquerPrevision({ jours }) {
  const ancres = []; // [heure absolue, température]
  jours.forEach((j, i) => {
    ancres.push([i * 24 + 6, j.tmin]);
    ancres.push([i * 24 + 15, j.tmax]);
  });
  const temperature = (h) => {
    if (h <= ancres[0][0]) return ancres[0][1];
    for (let k = 1; k < ancres.length; k++) {
      const [h1, t1] = ancres[k];
      const [h0, t0] = ancres[k - 1];
      if (h <= h1) return t0 + ((t1 - t0) * (h - h0)) / (h1 - h0);
    }
    return ancres.at(-1)[1];
  };

  const hourly = {
    time: [], temperature_2m: [], apparent_temperature: [], precipitation: [], precipitation_probability: [],
    weather_code: [], cloud_cover: [], wind_speed_10m: [], wind_gusts_10m: [], uv_index: [],
  };
  jours.forEach((j, i) => {
    for (let h = 0; h < 24; h++) {
      const t = Math.round(temperature(i * 24 + h) * 10) / 10;
      const mm = Number(j.pluie?.[h] ?? j.pluie?.[String(h)] ?? 0);
      hourly.time.push(`${j.date}T${pad(h)}:00`);
      hourly.temperature_2m.push(t);
      hourly.apparent_temperature.push(Math.round((t - (j.ecart_ressenti ?? 2)) * 10) / 10);
      hourly.precipitation.push(mm);
      hourly.precipitation_probability.push(mm > 0 ? 90 : 5);
      hourly.weather_code.push(mm > 0 ? (t <= 0 ? 71 : 61) : (j.code ?? 3));
      hourly.cloud_cover.push(mm > 0 ? 95 : (j.nuages ?? 60));
      hourly.wind_speed_10m.push(j.vent ?? 12);
      hourly.wind_gusts_10m.push(h >= 12 && h <= 16 ? (j.rafales ?? 25) : Math.min(j.rafales ?? 25, 25));
      hourly.uv_index.push(h >= 11 && h <= 15 ? (j.uv ?? 1) : 0);
    }
  });
  const daily = {
    time: jours.map((j) => j.date),
    weather_code: jours.map((j) => (Object.keys(j.pluie ?? {}).length ? 61 : (j.code ?? 3))),
    temperature_2m_min: jours.map((j) => j.tmin),
    temperature_2m_max: jours.map((j) => j.tmax),
    sunrise: jours.map((j) => `${j.date}T07:50`),
    sunset: jours.map((j) => `${j.date}T17:10`),
  };
  return { latitude: 50.63, longitude: 3.06, timezone: 'Europe/Paris', utc_offset_seconds: 3600, hourly, daily };
}

export function fabriquerAir({ jours, air = {} }) {
  const time = [];
  const european_aqi = [];
  for (const j of jours.slice(0, 2)) {
    for (let h = 0; h < 24; h++) {
      time.push(`${j.date}T${pad(h)}:00`);
      european_aqi.push(air[j.date] ?? 25);
    }
  }
  const zeros = time.map(() => 0);
  return {
    latitude: 50.6, longitude: 3.1, timezone: 'Europe/Paris',
    hourly: { time, european_aqi, pm10: zeros, pm2_5: zeros, alder_pollen: zeros, birch_pollen: zeros, grass_pollen: zeros, mugwort_pollen: zeros, olive_pollen: zeros, ragweed_pollen: zeros },
  };
}

/** Raccourci pour les tests : n jours consécutifs à partir de `debut`, mêmes valeurs sauf surcharges. */
export function joursDepuis(debut, n, base = { tmin: 5, tmax: 12 }, surcharges = {}) {
  return Array.from({ length: n }, (_, i) => {
    const date = ajouterJours(debut, i);
    return { date, ...base, ...(surcharges[date] ?? {}) };
  });
}
