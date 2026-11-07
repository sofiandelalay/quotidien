// Regroupement des heures pluvieuses en créneaux lisibles (« 14h–17h »).

/** Une heure est pluvieuse si le cumul ou la probabilité atteint son seuil. */
export function heurePluvieuse(h, cfg) {
  return (h.mm ?? 0) >= cfg.seuil_mm || (h.proba ?? 0) >= cfg.seuil_probabilite;
}

/**
 * @param {{heure: number, mm?: number, proba?: number}[]} heures  heures de la journée, triées
 * @param {{seuil_mm: number, seuil_probabilite: number, fusion_trou_heures: number}} cfg
 * @returns {{debut: number, fin: number}[]}  fin exclue : {14, 17} = de 14h à 17h
 */
export function creneauxPluie(heures, cfg) {
  const creneaux = [];
  for (const h of heures) {
    if (!heurePluvieuse(h, cfg)) continue;
    const dernier = creneaux.at(-1);
    // h - dernier.fin = nombre d'heures sèches entre les deux
    if (dernier && h.heure >= dernier.fin && h.heure - dernier.fin <= cfg.fusion_trou_heures) dernier.fin = h.heure + 1;
    else if (!dernier || h.heure >= dernier.fin) creneaux.push({ debut: h.heure, fin: h.heure + 1 });
  }
  return creneaux;
}

export function formatCreneau({ debut, fin }) {
  return `${debut}h–${fin === 24 ? 'minuit' : fin + 'h'}`;
}

/** « 14h–17h », « 8h–9h, 14h–17h » ou « par moments » au-delà de `max` créneaux ; null si sec. */
export function texteCreneaux(creneaux, max) {
  if (!creneaux.length) return null;
  if (creneaux.length > max) return 'par moments';
  return creneaux.map(formatCreneau).join(', ');
}
