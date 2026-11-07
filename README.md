# Quotidien

Chaque matin à 7h30, un briefing court en notification sur l'iPhone (météo, pluie, air, férié, fête, conseil utile).
Gratuit, sans serveur : GitHub Actions + [ntfy.sh](https://ntfy.sh). Cahier des charges : [Claude.md](Claude.md), sources : [docs/sources.md](docs/sources.md).

## Installer l'appli ntfy (iPhone)

1. App Store → « ntfy » (éditeur : Philipp Heckel) → installer, autoriser les notifications.
2. « + » → nom du sujet = la valeur `NTFY_TOPIC_BRIEFING` de `.secrets.local` (sur le PC, jamais commité) → serveur `ntfy.sh` par défaut → « Subscribe ».

Le nom du sujet fait office de mot de passe : ne le partagez pas.

## Modifier la configuration

Tous les seuils (pluie, vent, UV, air, pollens, conseils, heure d'envoi, fenêtre) sont dans [`config.yaml`](config.yaml), commenté en français.
On peut l'éditer depuis l'appli GitHub de l'iPhone : le changement s'applique au prochain passage.

## Lancer un test manuel

- Depuis GitHub : Actions → **quotidien** → *Run workflow* → cocher **force** → la notification arrive tout de suite (elle ne compte pas comme le briefing du jour).
- En ligne de commande : `gh workflow run quotidien.yml -f force=true`
- Sur le PC, sans réseau ni envoi : `npm run simulate` (données fictives de `test/fixtures/matin`).
- Tests : `npm test`.

## Fonctionnement

- Le workflow `quotidien` se déclenche à 04:23 et 05:23 UTC (heure d'hiver et d'été). Le script vérifie la fenêtre locale (5h–9h30 à Paris), n'envoie qu'une fois par jour (`state/state.json`) et programme la notification chez ntfy pour 7h30 pile (champ `delay`).
- `diagnostic` vérifie que chaque source répond depuis GitHub Actions ; `donnees` recopie dans `data/` les fêtes, les hadiths et la liste des versets courts.
- Avant chaque commit : `npm run check-lock` (le PC utilise un registre npm privé ; le projet force le registre public via `.npmrc`).
