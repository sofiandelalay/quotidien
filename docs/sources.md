# Sources de données

Validées le 7 novembre 2026 par le workflow `diagnostic` (GitHub Actions, run 42370600486, lu avec `gh run view --log`).
Toutes sont gratuites et sans clé. Coordonnées de test : Lille (50.6292, 3.0573).

| Donnée | Source retenue | Repli | État |
|---|---|---|---|
| Météo | Open-Meteo forecast | (aucun : ligne « météo indisponible ») | ✅ 200, ~0,7 s |
| Air et pollens | Open-Meteo Air Quality | « Air : indisponible » | ✅ 200, ~0,7 s |
| Jours fériés | Nager.Date v3 | calendrier.api.gouv.fr | ✅ les deux |
| Commune | geo.api.gouv.fr | « Ma position » (« Lille » pour la position par défaut) | ✅ |
| Fête du jour | nameday.abalin.net **API V2** | `data/fetes.json` (copie statique) | ✅ V2 en GET ; V1 en 404 ; V2 en POST en 405 |
| Verset | AlQuran Cloud | ligne omise | ✅ |
| Hadith | fawazahmed0/hadith-api (jsDelivr), copié dans `data/nawawi-fr.json` | — (copie locale) | ✅ |
| Notifications | ntfy.sh | — | ✅ |

## Open-Meteo — prévisions

```
GET https://api.open-meteo.com/v1/forecast?latitude=50.6292&longitude=3.0573
    &hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index
    &daily=weather_code,temperature_2m_min,temperature_2m_max,sunrise,sunset
    &timezone=Europe%2FParis&forecast_days=3&wind_speed_unit=kmh
```

Réponse (JSON) :

```
{ latitude, longitude, timezone: "Europe/Paris", utc_offset_seconds: 3600, timezone_abbreviation: "GMT+1",
  hourly_units: { temperature_2m: "°C", precipitation: "mm", precipitation_probability: "%", wind_speed_10m: "km/h", uv_index: "" , … },
  hourly: { time: ["2026-11-07T00:00", …] (72 = 3 × 24, heure locale de Paris), temperature_2m: [number], … une liste par variable },
  daily:  { time: ["2026-11-07", …], weather_code: [61, …], temperature_2m_min: [6.6, …], temperature_2m_max: [9.3, …],
            sunrise: ["2026-11-07T07:49", …], sunset: ["2026-11-07T17:13", …] } }
```

- Avec `timezone=Europe/Paris`, les heures sont locales (sans suffixe) : on filtre un jour avec `time.startsWith("AAAA-MM-JJ")`.
- `weather_code` = code WMO (0 ciel clair, 1–3 nuageux, 45/48 brouillard, 51–67 pluie, 71–77 neige, 80–82 averses, 95–99 orage).
- Autres champs quotidiens disponibles (testés) : `precipitation_sum`, `uv_index_max`, `wind_gusts_10m_max`.

## Open-Meteo — qualité de l'air et pollens

```
GET https://air-quality-api.open-meteo.com/v1/air-quality?latitude=50.6292&longitude=3.0573
    &hourly=european_aqi,pm10,pm2_5,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen
    &timezone=Europe%2FParis&forecast_days=2
```

Réponse : `{ hourly_units: { european_aqi: "EAQI", pm10: "μg/m³", birch_pollen: "grains/m³", … }, hourly: { time: [48], european_aqi: [number], … } }`.

- Le 7/11 : indice européen max 56, PM10 max 48, **tous les pollens à 0** (hors saison, pas `null`) → rien n'est affiché.
- Pollens : aulne (`alder`), bouleau (`birch`), graminées (`grass`), armoise (`mugwort`), olivier (`olive`), ambroisie (`ragweed`).
- Niveaux de l'indice européen (mêmes bornes que l'indice ATMO) : < 20 bon, < 40 moyen, < 60 dégradé, < 80 mauvais, < 100 très mauvais, sinon extrêmement mauvais (dans `config.yaml`).

## Jours fériés

```
GET https://date.nager.at/api/v3/PublicHolidays/2026/FR      (et 2027 quand il n'en reste plus dans l'année)
→ [ { date: "2026-11-11", localName: "Armistice 1918", name: "Armistice Day", countryCode: "FR",
      fixed: false, global: true, counties: null, launchYear: null, types: ["Public"] }, … ]   (11 jours)
```

Repli :

```
GET https://calendrier.api.gouv.fr/jours-feries/metropole/2026.json
→ { "2026-01-01": "1er janvier", …, "2026-11-11": "11 novembre", "2026-12-25": "Jour de Noël" }
```

Les noms sont raccourcis dans `src/sources.mjs` (« Armistice », « Noël »…). Les entrées `global: false` (Alsace-Moselle) sont ignorées.

## Commune

```
GET https://geo.api.gouv.fr/communes?lat=50.6292&lon=3.0573&fields=nom&format=json
→ [ { "nom": "Lille" } ]        (en mer ou hors de France : [])
```

## Fête du jour

```
GET https://nameday.abalin.net/api/V2/date?day=7&month=11&country=fr
→ { success: true, message: "Namedays for 11-07", data: { fr: "Carine", de: "…", … } }
```

- `GET /api/V2/today?country=fr&timezone=Europe/Paris` marche aussi. On préfère `date`, qui ne dépend pas de l'heure du serveur.
- **API V1 supprimée** (404) ; `POST /api/V2/today` → 405.
- **Limite de débit : environ 60 requêtes par minute** (HTTP 429 à la 61ᵉ). Ce n'est pas gênant pour une requête par jour.
- Repli : `data/fetes.json` (`{ fetes: { "11-07": "Carine", … } }`), construit une fois par le workflow `donnees`.

## Verset — AlQuran Cloud

```
GET https://api.alquran.cloud/v1/ayah/94:6/editions/quran-uthmani,fr.hamidullah
→ { code: 200, status: "OK", data: [
     { number, text: "<arabe>", edition: { identifier: "quran-uthmani", language: "ar", direction: "rtl" },
       surah: { number, name: "<nom arabe>", englishName, numberOfAyahs, revelationType }, numberInSurah, juz, page, … },
     { …même forme, text: "<français>", edition.identifier: "fr.hamidullah" } ] }
```

- Une seule traduction française en texte : `fr.hamidullah` (Muhammad Hamidullah). `GET /v1/edition?language=fr` renvoie aussi `fr.leclerc`, qui est une édition audio.
- Le Coran entier tient en un appel : `GET /v1/quran/quran-uthmani` ou `/v1/quran/fr.hamidullah` (6236 versets). Le workflow `donnees` s'en sert pour dresser la liste `data/versets-courts.json` (références `"sourate:verset"`). Critères : texte français de 40 à 160 caractères, arabe ≤ 160, phrase complète, premier verset de chaque sourate exclu (le texte arabe y contient parfois la basmala).
- Sélection déterministe : `refs[jours_depuis_1970 % refs.length]`.

## Hadith — 40 hadiths de an-Nawawi en français

```
GET https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions.json
→ { nawawi: { name: "Forty Hadith of an-Nawawi", collection: [ { name: "fra-nawawi", language: "French", link, linkmin }, … ] }, … }

GET https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/fra-nawawi.min.json   (28 Ko)
→ { metadata: { name, sections, section_details },
    hadiths: [ { hadithnumber: 1, arabicnumber: 1, text: "Il est rapporté d’après…", grades: [], reference: { book: 1, hadith: 1 } }, … ] }  (42 entrées)
```

- Copié une fois dans `data/nawawi-fr.json` : `{ source, url, hadiths: [ { numero, texte } ] }`. À l'affichage : numéro + source.
- Autres éditions françaises existantes : abudawud, bukhari, dehlawi, ibnmajah, malik, muslim, nasai, qudsi.

## ntfy.sh

Publication en JSON (UTF-8) sur la **racine** :

```
POST https://ntfy.sh/
Content-Type: application/json; charset=utf-8
{ "topic": "<secret>", "title": "☂️ Lille 6–12° · pluie 14h–17h", "message": "ligne 1\nligne 2", "priority": 3, "delay": "1794033000" }   ← 7 nov. 2026, 7h30 à Paris
→ 200 { id, time, expires, event: "message", topic, title, message, … }
```

- **Livraison différée : champ JSON `delay`** (en-têtes équivalents `X-Delay`, `At`, `In`). Il accepte un horodatage Unix, une date RFC 3339, une durée (`30m`, `3h`) ou une heure en langage naturel (`9am`, `tomorrow, 3pm`), avec un champ `timezone` facultatif. On envoie un **horodatage Unix**, sans ambiguïté de fuseau. Délai entre **10 secondes et 3 jours**.
- Vérifié : avec `delay`, le champ `time` de la réponse vaut l'heure de livraison programmée. Les accents et les emoji arrivent intacts.
- Champs JSON disponibles : `topic` (obligatoire), `message`, `title`, `tags`, `priority` (1–5), `actions` (3 au plus), `click`, `attach`, `markdown`, `icon`, `filename`, `delay`, `timezone`, `email`, `call`, `sequence_id`.
- Lecture du sujet de position : `GET https://ntfy.sh/<sujet>/json?poll=1&since=12h` renvoie du NDJSON (un objet `{id, time, event, topic, message}` par ligne, rien si vide). `since` accepte une durée, un horodatage Unix, un id de message, `all` ou `latest`. `scheduled=1` inclut les messages programmés (non encore livrés).
- **Limites de ntfy.sh** (docs.ntfy.sh) :
  - message : 4 096 octets ; titre : 1 Ko ; étiquettes : 512 octets ;
  - 250 messages par jour et par visiteur (adresse IP) ;
  - rafale de 60 requêtes, puis 1 requête toutes les 5 s ;
  - cache de 12 h : un message lu par le Raccourci de position doit dater de moins de 12 h.
  - La doc se contredit sur les pièces jointes (2 Mo ou 15 Mo par fichier) : elles ne servent pas ici.
- iOS : ntfy.sh relaie les notifications vers APNs (via Firebase). Il n'y a rien à configurer pour les sujets hébergés sur ntfy.sh.
- Sujets : leur nom fait office de mot de passe (n'importe qui le connaissant peut lire ou écrire). Les nôtres sont aléatoires (31 caractères) et stockés uniquement dans les secrets GitHub et `.secrets.local`.
