// Rendu de la page de détail à partir de data.json. Fonction pure, utilisée par le navigateur
// (app.mjs) et par les tests Node. Tout texte venant des données est échappé.

const FUSEAU = 'Europe/Paris';
export const AGE_MAX_HEURES = 26;

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const deg = (t) => (t == null ? '?' : `${t < 0 ? '−' : ''}${Math.abs(Math.round(t))}°`);
const virgule = (n) => String(n).replace('.', ',');
const heureFr = (hhmm) => (hhmm ? hhmm.replace(/^0/, '').replace(':', 'h') : '');

function dateLongue(iso) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
}
function heure(iso) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).replace(':', 'h');
}
function heureParis(date) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSEAU, hour: '2-digit', hourCycle: 'h23' }).format(date));
}
function jourParis(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU }).format(date); // AAAA-MM-JJ
}
function dateCourteFr(aaaammjj) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(aaaammjj + 'T12:00:00Z'));
}

/** Frise de 24 h : une barre par heure, hauteur = cumul, opacité = probabilité. */
function frise(heures, heureActuelle) {
  const max = Math.max(2, ...heures.map((h) => h.mm));
  const barres = heures
    .map((h) => {
      const haut = h.mm > 0 ? Math.max(8, Math.round((h.mm / max) * 100)) : h.proba >= 30 ? 4 : 0;
      const op = (0.35 + 0.65 * Math.min(1, h.proba / 100)).toFixed(2);
      const titre = `${h.h}h : ${virgule(h.mm)} mm, ${h.proba} %`;
      return `<div class="h${h.h === heureActuelle ? ' maintenant' : ''}" title="${esc(titre)}"><span style="height:${haut}%;opacity:${op}"></span></div>`;
    })
    .join('');
  const pluvieuses = heures.filter((h) => h.mm > 0);
  const resume = pluvieuses.length ? `Pluie prévue à ${pluvieuses.map((h) => `${h.h}h`).join(', ')}` : 'Pas de pluie prévue';
  return `<div class="frise" role="img" aria-label="${esc(resume)}">${barres}</div>
      <div class="graduation" aria-hidden="true"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>`;
}

function sectionMeteo(m, conseil, heureActuelle) {
  if (!m) return '<section class="carte"><h2>Météo</h2><p class="discret">Météo indisponible pour le moment.</p></section>';
  const details = [
    m.vent_max != null ? `<div><dt>Vent</dt><dd>${m.vent_max} km/h${m.rafales_max != null ? `<small>rafales ${m.rafales_max}</small>` : ''}</dd></div>` : '',
    m.uv_max != null ? `<div><dt>UV</dt><dd>${m.uv_max}</dd></div>` : '',
    m.lever ? `<div><dt>Soleil</dt><dd>${esc(heureFr(m.lever))}<small>→ ${esc(heureFr(m.coucher))}</small></dd></div>` : '',
  ].join('');
  return `<section class="carte meteo">
      <div class="temp"><span class="emoji" aria-hidden="true">${esc(m.emoji)}</span><span><b>${deg(m.min)}</b> / <b>${deg(m.max)}</b></span></div>
      <p class="pluie">${m.pluie ? `Pluie ${esc(m.pluie)}${m.cumul >= 1 ? ` · ${esc(virgule(Math.round(m.cumul)))} mm` : ''}` : 'Pas de pluie en journée'}</p>
      ${Array.isArray(m.heures) && m.heures.length ? frise(m.heures, heureActuelle) : ''}
      <dl class="details">${details}</dl>
      ${conseil ? `<p class="conseil">${esc(conseil)}</p>` : ''}
    </section>`;
}

function sectionAir(a) {
  if (!a) return '';
  const pollens = (a.pollens ?? []).filter((p) => p.valeur > 0);
  const liste = pollens.length
    ? `<p>Pollens : ${pollens.map((p) => `${p.notable ? '<b>' : ''}${esc(p.nom)} ${esc(p.valeur)}${p.notable ? '</b>' : ''}`).join(', ')} <small>(grains/m³)</small></p>`
    : '<p class="discret">Pas de pollens notables.</p>';
  return `<section class="carte">
      <h2>Air</h2>
      <p class="air"><span class="pastille niveau-${esc((a.mot ?? '').replace(/\s/g, '-'))}"></span>${esc(a.mot ?? 'indisponible')}<small>indice européen ${esc(a.indice ?? '?')}${a.pm25 != null ? ` · PM2,5 ${esc(a.pm25)} · PM10 ${esc(a.pm10)}` : ''}</small></p>
      ${liste}
    </section>`;
}

function sectionRepere(ferie, fete) {
  const lignes = [];
  if (ferie) {
    const quand = ferie.dans === 0 ? "aujourd'hui" : ferie.dans === 1 ? 'demain' : `${esc(dateCourteFr(ferie.date))}, dans ${ferie.dans} jours`;
    lignes.push(`<div><dt>Prochain férié</dt><dd>${esc(ferie.nom)}<small>${quand}</small></dd></div>`);
  }
  if (fete) lignes.push(`<div><dt>Fête du jour</dt><dd>${esc(fete)}</dd></div>`);
  return lignes.length ? `<section class="carte"><dl class="reperes">${lignes.join('')}</dl></section>` : '';
}

function sectionDuJour(v, h) {
  if (!v && !h) return '';
  const verset = v
    ? `<figure class="verset">
        <blockquote>
          <p lang="ar" dir="rtl" class="arabe">${esc(v.ar)}</p>
          <p class="fr">${esc(v.fr)}</p>
        </blockquote>
        <figcaption>Sourate ${esc(v.sourate)}${v.sourate_ar ? ` <span lang="ar" dir="rtl">${esc(v.sourate_ar)}</span>` : ''} · <b>${esc(v.ref)}</b><br><small>Traduction Muhammad Hamidullah · AlQuran Cloud</small></figcaption>
      </figure>`
    : '';
  const hadith = h
    ? `<figure class="hadith">
        <blockquote><p>${esc(h.texte)}</p></blockquote>
        <figcaption>Hadith n° <b>${esc(h.numero)}</b> des quarante hadiths de an-Nawawi<br><small>${esc(h.source)}</small></figcaption>
      </figure>`
    : '';
  return `<details class="carte du-jour" id="du-jour"><summary><h2>Du jour</h2></summary>${verset}${hadith}</details>`;
}

/**
 * @param {object} d  contenu de data.json
 * @param {Date} [maintenant]
 * @returns {string} HTML du contenu de <main>
 */
export function rendre(d, maintenant = new Date()) {
  const ageH = (maintenant.getTime() - Date.parse(d.genere)) / 3600000;
  const perime = !(ageH <= AGE_MAX_HEURES);
  const heureActuelle = jourParis(maintenant) === d.jour ? heureParis(maintenant) : -1;
  return `<header>
      <h1>${esc(d.commune)}</h1>
      <p class="maj">${esc(dateLongue(d.genere))} · mis à jour à ${esc(heure(d.genere))}</p>
      ${perime ? `<p class="alerte" role="alert">Données de plus de ${AGE_MAX_HEURES} h : la dernière mise à jour date du ${esc(dateLongue(d.genere))}.</p>` : ''}
    </header>
    ${sectionMeteo(d.meteo, d.conseil, heureActuelle)}
    ${sectionAir(d.air)}
    ${sectionRepere(d.ferie, d.fete)}
    ${sectionDuJour(d.verset, d.hadith)}
    <footer>Sources : Open-Meteo, Nager.Date, geo.api.gouv.fr, AlQuran Cloud, fawazahmed0/hadith-api.</footer>`;
}
