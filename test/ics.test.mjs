import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireIcs, lireLignes, occurrences, resoudreFuseau, datesRecurrence, lireRrule } from '../src/ics.mjs';
import { instantParis, paris } from '../src/temps.mjs';

const ics = (nom) => readFileSync(new URL(`./fixtures/agenda/${nom}`, import.meta.url), 'utf8');
const fen = (de, a) => ({ debut: new Date(de), fin: new Date(a) });
const jour = (d) => fen(instantParis(d, '00:00'), instantParis(d, '23:59'));
const titres = (occ) => occ.map((o) => (o.journee ? `[journée] ${o.titre}` : `${paris(o.debut).hhmm} ${o.titre}`));

test('lignes pliées (CRLF + espace), paramètres et échappements', () => {
  const evs = lireIcs(ics('outlook.ics'));
  const diner = evs.find((e) => e.uid === '0400000082-diner-famille');
  assert.equal(diner.titre, 'Dîner chez Mamie, Papa et les cousins (apporter le dessert)');
  assert.ok(evs.find((e) => e.titre === 'Kiné').uid.length > 80, 'UID plié sur deux lignes');
  assert.ok(ics('outlook.ics').includes('\r\n'), 'fixture au format CRLF, comme Outlook');
  const [l] = lireLignes('DTSTART;TZID="Pacific: Time";VALUE=DATE-TIME:20261109T100000');
  assert.deepEqual([l.nom, l.params.TZID, l.valeur], ['DTSTART', 'Pacific: Time', '20261109T100000']);
});

test("fuseaux Windows d'Outlook → IANA, repli sur Paris", () => {
  assert.equal(resoudreFuseau('Romance Standard Time'), 'Europe/Paris');
  assert.equal(resoudreFuseau('W. Europe Standard Time'), 'Europe/Berlin');
  assert.equal(resoudreFuseau('"Europe/Paris"'), 'Europe/Paris');
  assert.equal(resoudreFuseau('/mozilla.org/20050126_1/America/New_York'), 'America/New_York');
  assert.equal(resoudreFuseau('Customized Time Zone'), 'Europe/Paris');
  assert.equal(resoudreFuseau(undefined), 'Europe/Paris');
});

test('Outlook, lundi 9 novembre 2026 : récurrences, fuseaux, annulation', () => {
  const occ = occurrences(lireIcs(ics('outlook.ics')), jour('2026-11-09'));
  assert.deepEqual(titres(occ), [
    '[journée] Brocante du quartier',
    "09:00 Réunion d'équipe", // W. Europe Standard Time 9h = 9h à Paris
    '10:00 Kiné', // créé en septembre (heure d'été), toujours 10h en hiver
    '15:00 Point projet sur TEAMS',
    '18:00 Appel avec Montréal', // fuseau inconnu : heure lue comme heure de Paris
    '20:00 Dîner chez Mamie, Papa et les cousins (apporter le dessert)', // 2e lundi du mois
  ]); // Yoga de 19h : occurrence annulée (RECURRENCE-ID + STATUS:CANCELLED)
});

test('Outlook : EXDATE, occurrence déplacée (RECURRENCE-ID), UNTIL', () => {
  const evs = lireIcs(ics('outlook.ics'));
  const kine = (d) => titres(occurrences(evs, jour(d))).filter((t) => t.includes('Kiné'));
  assert.deepEqual(kine('2026-11-12'), [], 'jeudi 12 exclu (EXDATE)');
  assert.deepEqual(kine('2026-11-19'), ['10:00 Kiné']);
  assert.deepEqual(kine('2026-11-16'), ['11:30 Kiné (décalé)'], 'déplacé de 10h à 11h30');
  assert.deepEqual(kine('2027-06-28'), ['10:00 Kiné']);
  assert.deepEqual(kine('2027-07-01'), [], 'après UNTIL');
  assert.deepEqual(titres(occurrences(evs, jour('2026-11-16'))).filter((t) => t.includes('Yoga')), ['19:00 Yoga'], "seule l'occurrence du 9 est annulée");
});

test("Google : heure d'été → hiver, COUNT, UTC", () => {
  const evs = lireIcs(ics('google.ics'));
  assert.deepEqual(titres(occurrences(evs, jour('2026-11-09'))), ["[journée] Anniversaire d'Léa", '18:15 Ciné', '18:30 Piscine']);
  assert.deepEqual(titres(occurrences(evs, jour('2026-11-08'))), ['08:00 Antibiotique'], '4e et dernière prise');
  assert.deepEqual(titres(occurrences(evs, jour('2026-11-09'))).filter((t) => t.includes('Antibiotique')), [], 'COUNT=4 atteint');
  assert.deepEqual(titres(occurrences(evs, jour('2026-07-13'))), ['18:30 Piscine'], 'en été aussi 18h30');
});

test("jour du changement d'heure : un événement à 10h reste à 10h", () => {
  const evs = lireIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nSUMMARY:Marché\nDTSTART;TZID=Romance Standard Time:20260301T100000\nDTEND;TZID=Romance Standard Time:20260301T110000\nRRULE:FREQ=WEEKLY;BYDAY=SU\nEND:VEVENT\nEND:VCALENDAR');
  assert.deepEqual(titres(occurrences(evs, jour('2026-03-29'))), ['10:00 Marché']);
  assert.deepEqual(titres(occurrences(evs, jour('2026-10-25'))), ['10:00 Marché']);
});

test('événement de plusieurs jours (toute la journée)', () => {
  const evs = lireIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:v\nSUMMARY:Vacances\nDTSTART;VALUE=DATE:20261107\nDTEND;VALUE=DATE:20261111\nEND:VEVENT\nEND:VCALENDAR');
  assert.equal(occurrences(evs, jour('2026-11-10')).length, 1);
  assert.equal(occurrences(evs, jour('2026-11-11')).length, 0, 'DTEND exclu');
});

test('RRULE : rangs, BYSETPOS, fin de mois, 29 février, intervalle, COUNT', () => {
  const r = (s) => lireRrule(s);
  assert.deepEqual(datesRecurrence(r('FREQ=MONTHLY;BYDAY=-1FR'), '2026-01-30', '2026-04-30'), ['2026-01-30', '2026-02-27', '2026-03-27', '2026-04-24']);
  assert.deepEqual(datesRecurrence(r('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'), '2026-01-30', '2026-03-31'), ['2026-01-30', '2026-02-27', '2026-03-31']);
  assert.deepEqual(datesRecurrence(r('FREQ=MONTHLY'), '2026-01-31', '2026-05-31'), ['2026-01-31', '2026-03-31', '2026-05-31'], 'mois sans 31 sautés');
  assert.deepEqual(datesRecurrence(r('FREQ=YEARLY'), '1996-02-29', '2028-03-01').slice(-2), ['2024-02-29', '2028-02-29']);
  assert.deepEqual(datesRecurrence(r('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH'), '2026-11-03', '2026-11-20'), ['2026-11-03', '2026-11-05', '2026-11-17', '2026-11-19']);
  assert.deepEqual(datesRecurrence(r('FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU'), '2025-03-30', '2027-12-31'), ['2025-03-30', '2026-03-29', '2027-03-28']);
  assert.deepEqual(datesRecurrence(r('FREQ=DAILY;INTERVAL=3;COUNT=3'), '2026-11-01', '2026-12-31'), ['2026-11-01', '2026-11-04', '2026-11-07']);
});
