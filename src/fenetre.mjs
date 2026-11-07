// Décide si un passage (matin) doit s'exécuter maintenant, et avec quel délai de livraison.
// Le cron GitHub est en UTC et peut être en retard : il déclenche deux fois par passage
// (une heure d'écart, pour couvrir l'heure d'hiver et l'heure d'été) ; c'est ce module qui
// vérifie l'heure locale et empêche un second envoi le même jour.
import { paris, minutes, instantParis } from './temps.mjs';

// ntfy refuse les délais inférieurs à 10 s : en dessous de cette marge, on envoie tout de suite.
const MARGE_DELAI_MS = 15000;

/**
 * @param {object} p
 * @param {Date} p.maintenant
 * @param {{heure_envoi: string, fenetre: {debut: string, fin: string}}} p.reglage  config.passages.<nom>
 * @param {string} p.nom          nom du passage (« matin »)
 * @param {object} p.etat         state.json
 * @param {boolean} [p.force]     envoi manuel : ignore la fenêtre et l'anti-doublon, envoi immédiat
 * @returns {{executer: boolean, raison: string, jour: string, livraison: Date|null}}
 */
export function decider({ maintenant, reglage, nom, etat, force = false }) {
  const local = paris(maintenant);
  const jour = local.date;

  if (force) return { executer: true, raison: 'forcé', jour, livraison: null };

  const m = minutes(local.hhmm);
  if (m < minutes(reglage.fenetre.debut) || m >= minutes(reglage.fenetre.fin)) {
    return { executer: false, raison: `hors fenêtre (${local.hhmm} à Paris)`, jour, livraison: null };
  }
  if (etat?.passages?.[nom] === jour) {
    return { executer: false, raison: `passage « ${nom} » déjà fait aujourd'hui`, jour, livraison: null };
  }
  const cible = instantParis(jour, reglage.heure_envoi);
  const livraison = cible.getTime() - maintenant.getTime() > MARGE_DELAI_MS ? cible : null;
  return { executer: true, raison: livraison ? 'dans la fenêtre' : 'dans la fenêtre (en retard : envoi immédiat)', jour, livraison };
}

/** Passage dont la fenêtre contient l'heure (déclenchement par le cron, simulation), ou null. */
export function passageDuMoment(maintenant, cfg) {
  const m = minutes(paris(maintenant).hhmm);
  for (const [nom, p] of Object.entries(cfg.passages)) {
    if (m >= minutes(p.fenetre.debut) && m < minutes(p.fenetre.fin)) return nom;
  }
  return null;
}
