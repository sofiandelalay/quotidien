import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireIcs, occurrences } from '../src/ics.mjs';
import { composerAgenda, fenetreAgenda, lireCalendarUrls, nomAnniversaire, ligneAnniversaire, lireAgendas } from '../src/agenda.mjs';
import { composerBriefing } from '../src/briefing.mjs';
import { cfg, avec } from './aide.mjs';

const jour = '2026-11-09';
const ics = (nom) => readFileSync(new URL(`./fixtures/agenda/${nom}`, import.meta.url), 'utf8');
const agendas = (c = cfg.agenda, j = jour) =>
  [['Outlook', 'outlook.ics'], ['Google', 'google.ics'], ['Anniversaires', 'google-anniversaires.ics']].map(([libelle, f]) => ({
    libelle,
    occurrences: occurrences(lireIcs(ics(f)), fenetreAgenda(j, c)),
  }));

test('CALENDAR_URLS : « libellé|url », webcal, lignes vides et commentaires', () => {
  const texte = 'Outlook|https://outlook.live.com/owa/calendar/x/calendar.ics\r\n\n# test\nGoogle | webcal://calendar.google.com/a/basic.ics\nhttps://sans-libelle.example/c.ics\nmauvais|ftp://x';
  assert.deepEqual(lireCalendarUrls(texte), [
    { libelle: 'Outlook', url: 'https://outlook.live.com/owa/calendar/x/calendar.ics' },
    { libelle: 'Google', url: 'https://calendar.google.com/a/basic.ics' },
    { libelle: 'Agenda 3', url: 'https://sans-libelle.example/c.ics' }, // 3e agenda valide
  ]);
  assert.deepEqual(lireCalendarUrls(undefined), []);
});

test('filtre : réunions en visio et mots-clés (accents et majuscules ignorés), anniversaires à part', () => {
  const c = avec({ agenda: { lignes_max: 10 } });
  const { anniversaires, lignes } = composerAgenda(agendas(c.agenda), jour, c.agenda);
  assert.deepEqual(anniversaires, ['🎂 Anniversaire de Léa', '🎂 Anniversaire de Marie', "🎂 Anniversaire d'Alice Martin"]);
  assert.deepEqual(lignes, [
    "Aujourd'hui : Brocante du quartier",
    '10h Kiné',
    '14h Atelier client', // pro, en présentiel : gardé
    '18h Appel avec Montréal',
    '18h15 Ciné',
    '18h30 Piscine',
    '20h Dîner chez Mamie, Papa et les cousins…', // coupé à la fin d'un mot
    'Demain 8h30 Contrôle technique',
  ]); // filtrés : « Réunion d'équipe » (lieu Teams), « Point budget » (lien Zoom), « Point projet sur TEAMS » (titre) ; « Coiffeur » demain 14h : trop tard
});

test('jusqu\'à 3 lignes, au-delà « + N autres » ; anniversaires en tête et hors limite', () => {
  const { anniversaires, lignes } = composerAgenda(agendas(), jour, cfg.agenda);
  assert.deepEqual(lignes, ["Aujourd'hui : Brocante du quartier", '10h Kiné', '+ 6 autres événements']);
  assert.equal(anniversaires.length, 3);
  const b = composerBriefing({ jour, commune: 'Lille', meteo: null, air: null, ferie: null, fete: null, anniversaires, agenda: lignes }, cfg);
  assert.deepEqual(b.lignes.slice(1), [...anniversaires, ...lignes]);
});

test('agenda.detail: nombre — une seule ligne, les anniversaires restent affichés', () => {
  const c = avec({ agenda: { detail: 'nombre' } });
  const { anniversaires, lignes } = composerAgenda(agendas(c.agenda), jour, c.agenda);
  assert.deepEqual(lignes, ["Agenda : 7 aujourd'hui, 1 demain matin"]);
  assert.equal(anniversaires.length, 3);
});

test('anniversaires désactivés dans config.yaml', () => {
  const c = avec({ agenda: { anniversaires: { actif: false }, lignes_max: 20 } });
  const { anniversaires, lignes } = composerAgenda(agendas(c.agenda), jour, c.agenda);
  assert.deepEqual(anniversaires, []);
  assert.ok(lignes.includes("Aujourd'hui : Anniversaire d'Léa"), 'redevient un événement ordinaire');
});

test('anniversaire : le jour même seulement', () => {
  const { anniversaires } = composerAgenda(agendas(cfg.agenda, '2026-11-10'), '2026-11-10', cfg.agenda);
  assert.deepEqual(anniversaires, ['🎂 Anniversaire de Paul (demain)']);
});

test('ignorer un agenda entier', () => {
  const c = avec({ agenda: { ignorer_agendas: ['outlook'], lignes_max: 10 } });
  const { lignes } = composerAgenda(agendas(c.agenda), jour, c.agenda);
  assert.deepEqual(lignes, ['18h15 Ciné', '18h30 Piscine']);
});

test("nom d'anniversaire à partir du titre", () => {
  const cas = {
    'Anniversaire de Marie': 'Marie',
    "Anniversaire d'Alice": 'Alice',
    'Anniversaire : Paul Durand': 'Paul Durand',
    'Joyeux anniversaire Tom': 'Tom',
    "Bob Smith's birthday": 'Bob Smith',
    '🎂 Anniv Zoé': 'Zoé',
    'Hugo (anniversaire)': 'Hugo',
    'Inès - anniversaire': 'Inès',
    'Anniversaire de Jean (40 ans)': 'Jean',
    'Alice Martin': 'Alice Martin',
  };
  for (const [titre, nom] of Object.entries(cas)) assert.equal(nomAnniversaire(titre), nom, titre);
  assert.equal(ligneAnniversaire('Alice'), "🎂 Anniversaire d'Alice");
  assert.equal(ligneAnniversaire('Élodie'), "🎂 Anniversaire d'Élodie");
  assert.equal(ligneAnniversaire('Paul'), '🎂 Anniversaire de Paul');
});

test("un agenda en panne n'empêche pas les autres ; l'erreur ne contient pas l'URL", async () => {
  const secret = 'https://outlook.live.com/owa/calendar/SECRET123/calendar.ics';
  const fetcher = async (url) => (url === secret ? new Response('Not found', { status: 404 }) : new Response(ics('google.ics')));
  const { agendas: a, echecs } = await lireAgendas([{ libelle: 'Outlook', url: secret }, { libelle: 'Google', url: 'https://g/x.ics' }], jour, cfg.agenda, { fetcher });
  assert.equal(a[1].occurrences.length, 3);
  assert.deepEqual(echecs, ['agenda « Outlook » (HTTP 404)']);
  assert.ok(!echecs.join().includes('SECRET123'));
});

test('visio : ignorer_visio à false montre les réunions Teams et Zoom', () => {
  const c = avec({ agenda: { ignorer_visio: false, ignorer_mots_cles: [], lignes_max: 20 } });
  const { lignes } = composerAgenda(agendas(c.agenda), jour, c.agenda);
  for (const t of ["9h Réunion d'équipe", '16h Point budget', '15h Point projet sur TEAMS']) assert.ok(lignes.includes(t), t);
});
