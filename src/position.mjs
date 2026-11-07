// Position utilisée pour la météo. Étape 1 : position fixe (Lille, config.yaml).
// La lecture du sujet ntfy privé publié par le Raccourci iOS viendra à l'étape suivante.
// La position n'est jamais écrite dans un fichier, un commit, un log ni la page.
export async function positionActuelle(cfg) {
  const d = cfg.position.defaut;
  return { lat: d.lat, lon: d.lon, nomParDefaut: d.nom, source: 'defaut' };
}
