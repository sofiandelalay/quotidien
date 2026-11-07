// Corrections du calendrier des fêtes d'abalin (pays fr). Sa source recopie un calendrier
// imprimé de 2018 : abréviations, fêtes mobiles figées aux dates de 2018 (Pâques le 1er avril…),
// phases de lune (« Basile Pleine ») et changements d'heure (« Rameaux +1h »).
// Valeur = prénom(s) à souhaiter ; null = pas de prénom ce jour-là (la ligne « Fête » est omise).
export const CORRECTIONS = {
  '01-01': null, // Jour de l'an
  '01-02': 'Basile',
  '01-06': 'Mélaine', // Épiphanie (mobile)
  '01-24': 'François de Sales',
  '01-25': null, // Conversion de saint Paul
  '01-28': "Thomas d'Aquin",
  '02-02': null, // Présentation du Seigneur
  '02-11': null, // Notre-Dame de Lourdes
  '02-14': 'Valentin', // Cendres en 2018
  '02-21': 'Pierre Damien',
  '03-02': 'Charles le Bon',
  '03-24': 'Catherine de Suède',
  '03-25': null, // Annonciation (« Rameaux +1h » en 2018)
  '03-30': 'Amédée', // Vendredi saint en 2018
  '04-01': 'Hugues', // Pâques en 2018
  '04-02': 'Sandrine', // lundi de Pâques en 2018
  '04-07': 'Jean-Baptiste de la Salle',
  '04-29': 'Catherine de Sienne', // « Jour du souvenir » en 2018
  '05-01': null, // Fête du Travail
  '05-03': 'Philippe, Jacques',
  '05-10': 'Solange', // Ascension en 2018
  '05-12': 'Achille', // fête de Jeanne d'Arc (dimanche) en 2018
  '05-20': 'Bernardin', // Pentecôte en 2018
  '05-21': 'Constantin', // lundi de Pentecôte en 2018
  '05-27': 'Augustin', // fête des Mères en 2018
  '05-31': 'Perrine', // Visitation
  '06-16': 'Jean-François Régis',
  '06-17': 'Hervé', // fête des Pères en 2018
  '06-24': 'Jean-Baptiste',
  '07-14': 'Camille', // Fête nationale
  '07-22': 'Marie-Madeleine',
  '07-26': 'Anne, Joachim',
  '07-31': 'Ignace de Loyola',
  '08-02': 'Julien Eymard',
  '08-04': 'Jean-Marie Vianney',
  '08-06': null, // Transfiguration
  '08-15': 'Marie', // Assomption
  '08-23': 'Rose de Lima',
  '09-08': null, // Nativité de Notre-Dame
  '09-14': null, // Croix glorieuse
  '09-26': 'Côme, Damien',
  '09-27': 'Vincent de Paul',
  '10-01': "Thérèse de l'Enfant-Jésus",
  '10-04': "François d'Assise",
  '10-15': "Thérèse d'Avila",
  '10-23': 'Jean de Capistran',
  '10-28': 'Simon, Jude', // « -1h » en 2018
  '11-01': null, // Toussaint
  '11-02': null, // Défunts
  '11-11': 'Martin', // Armistice
  '11-21': null, // Présentation de Marie
  '11-25': 'Catherine', // Christ Roi en 2018
  '11-28': 'Jacques de la Marche',
  '12-08': null, // Immaculée Conception
  '12-12': 'Jeanne-Françoise de Chantal',
};

/** Applique les corrections ; signale toute valeur encore suspecte. */
export function corrigerFetes(brutes) {
  const fetes = { ...brutes };
  for (const [jour, nom] of Object.entries(CORRECTIONS)) {
    if (nom === null) delete fetes[jour];
    else fetes[jour] = nom;
  }
  const suspectes = Object.entries(fetes).filter(([, v]) => /\.|\+|\d|Pleine|Lune|Saint|Fête|Jour /.test(v));
  return { fetes: Object.fromEntries(Object.entries(fetes).sort(([a], [b]) => a.localeCompare(b))), suspectes };
}
