# Quotidien — cahier des charges

Appli personnelle, en français, pour un seul utilisateur (iPhone 17 Pro, PC Windows). Elle envoie chaque matin un briefing en notification et, le soir, des alertes « bon moment pour… ». Une petite page web donne le détail. Tout est gratuit, sans serveur à gérer, et fonctionne PC éteint.

## Principes (à respecter dans chaque décision)
- Simple, calme, aucune information inutile : lisible en quelques secondes sur l'écran verrouillé.
- Tout en français (textes, dates, unités : °C, km/h, mm, heures « 14h–17h »).
- Gratuit, sans serveur, sans clé d'API. Si une API demande une clé, en chercher une autre.
- Ne prend pas de place avec le temps : rien ne s'accumule (pas d'historique, pas de fichiers générés commités, état purgé à 14 jours).
- Peu de dépendances npm. Pas de framework pour la page (HTML/CSS/JS simples, sans étape de build).
- Une défaillance d'une source ne bloque jamais le briefing : la ligne concernée est omise (ou « indisponible » si c'est important), le reste part.

## Architecture
- Dépôt GitHub **public** `quotidien` (GitHub Pages est impossible depuis un dépôt privé en compte gratuit). Il ne contient donc **aucune donnée sensible**.
- Moteur : script Node 22 (ESM, JavaScript), lancé par GitHub Actions (cron). Dates calculées en `Europe/Paris`.
- Notifications : ntfy.sh (appli iOS gratuite). Envoi en JSON (UTF-8) sur la racine, avec livraison différée (`delay`) pour partir à l'heure exacte malgré le retard du cron GitHub.
- Page de détail : GitHub Pages, déployée par GitHub Actions (`upload-pages-artifact` + `deploy-pages`), jamais par commit de fichiers générés.
- État : `state/state.json` (alertes déjà envoyées + date du dernier passage), commité par le workflow, purgé à 14 jours, toujours petit. Le commit quotidien sert aussi à garder le cron actif.
- Position : un Raccourci iOS publie « lat,lon » (arrondi à 2 décimales) sur un sujet ntfy privé ; le script lit le dernier message (`/json?poll=1&since=…`) ; sans message récent → Lille (50.6292, 3.0573). La position n'est jamais écrite dans un fichier, un commit, un log ni la page (seulement le nom de commune).

## Secrets et vie privée
- Secrets GitHub : `NTFY_TOPIC_BRIEFING`, `NTFY_TOPIC_POSITION` (noms aléatoires ≥ 24 caractères), `CALENDAR_URLS` (une ligne par agenda : `libellé|url_ics`).
- Aucun secret, aucune URL ICS, aucun nom de sujet ntfy dans un fichier suivi par git, un log (utiliser `::add-mask::`) ou la page. Un fichier local `.secrets.local` (dans `.gitignore`, créé avant tout le reste) garde une copie pour l'utilisateur.
- Les événements d'agenda ne vont que dans la notification (jamais sur la page). Option `agenda.detail: titres | nombre` dans la config.
- Les workflows n'ont que les déclencheurs `schedule` et `workflow_dispatch` (jamais `pull_request`).

## Environnement (leçons du projet précédent)
- Le PC utilise un registre npm privé configuré globalement : le **premier** fichier du projet est un `.npmrc` avec `registry=https://registry.npmjs.org/`. Vérifier que `package-lock.json` ne contient aucune autre adresse avant chaque commit.
- Certaines API ne sont pas joignables depuis le PC : tester le réseau uniquement depuis GitHub Actions (`workflow_dispatch`, logs lus avec `gh run view --log`) ou depuis l'iPhone. Les tests locaux utilisent des fixtures (`node:test`).
- `gh` est installé et connecté. Pas de Mac.

## Sources de données (à valider par un workflow de diagnostic avant de coder dessus)
- Météo : Open-Meteo forecast (horaire : température, ressenti, précipitations, probabilité, vent, rafales, UV ; quotidien : min/max, lever/coucher du soleil).
- Air et pollens : Open-Meteo Air Quality (`european_aqi`, PM10, PM2.5, pollens ; pollens nuls hors saison = normal, ne rien afficher).
- Jours fériés : Nager.Date (`/api/v3/PublicHolidays/{année}/FR`), prendre aussi l'année suivante en fin d'année ; repli : calendrier.api.gouv.fr.
- Nom de la commune : geo.api.gouv.fr (`/communes?lat=&lon=`), repli « Ma position ».
- Fête du jour : tester nameday.abalin.net (France) ; si instable, repli sur un fichier statique versionné dans le dépôt.
- Verset : AlQuran Cloud (texte arabe + traduction française ; sélection déterministe selon la date, versets courts uniquement).
- Hadith / règle de conduite : les 40 hadiths de Nawawi en français (fawazahmed0/hadith-api via CDN jsDelivr, ou autre source ouverte), copiés une fois dans le dépôt (`data/`) pour ne pas dépendre d'un service ; toujours afficher le numéro et la source.
- Agenda : liens ICS secrets (Outlook.com, Google « adresse secrète au format iCal »). Gérer les événements récurrents et les fuseaux Windows d'Outlook (ex. « Romance Standard Time »). Filtre « hors travail » par agenda et mots-clés, configurable.

## Briefing du matin (7h30, Paris)
Notification courte, dans cet ordre, une ligne chacune, lignes vides omises :
1. Titre : emoji météo + commune + min–max + créneau de pluie s'il y en a (ex. `☂️ Lille 6–12° · pluie 14h–17h`).
2. Pluie (créneaux regroupés), vent (+ rafales si ≥ 50 km/h), UV si ≥ 3.
3. Air (mot français : bon, moyen, dégradé, mauvais…) ; pollens seulement s'ils sont notables.
4. Prochain férié et dans combien de jours (ex. `Armistice · 11 nov · dans 4 j`).
5. Fête du jour.
6. Agenda : jusqu'à 3 lignes (aujourd'hui, puis demain matin).
7. Conseil : **une seule phrase, uniquement si utile** (parapluie, manteau, crème solaire, air mauvais, gel, vent fort). Aucun conseil sinon.
Le verset et le hadith ne sont pas dans la notification (option `notification.verset: false`) : ils sont sur la page.
Seuils (parapluie, manteau, vent, UV, AQI) dans `config.yaml`, pas dans le code.

## Alertes « bon moment pour… »
- Règles dans `rules.yaml` (commentaires en français, très lisible, modifiable depuis l'appli GitHub de l'iPhone). Vocabulaire déclaratif simple (période, jours de la semaine, moment `matin`/`soir`, conditions combinées en `tous`/`un_des`, message avec variables), documenté dans le README.
- Deux passages par jour : matin (briefing 7h30 + règles du matin) et soir (19h00 + règles du soir).
- Règles de départ : **Rando** (jeudi soir : samedi et dimanche secs et ≥ 15 °C), **Laver la voiture** (matin : pas de pluie pendant 48 h, délai de 5 jours entre deux alertes), **Sport dehors : air dégradé** (matin : indice européen ≥ 60 aujourd'hui), **Gel** (soir : température négative prévue la nuit suivante).
- Anti-doublon : chaque alerte a une clé `règle + événement` (ex. `rando:2026-11-14`, `gel:2026-11-08`) enregistrée dans `state.json` ; jamais deux envois pour la même clé, même si le workflow est relancé.
- Mode simulation : `npm run simulate -- --regle gel --fixture …` évalue les règles sur des données fictives sans rien envoyer.

## Page de détail
- Une seule page mobile (iOS), installable sur l'écran d'accueil (manifest + icône, sans service worker), thème clair/sombre automatique, polices système.
- Contenu : en-tête (commune, heure de mise à jour, avertissement si données de plus de 26 h), météo du jour (min/max, frise de 24 h de pluie, vent, UV), air et pollens, prochain férié, fête, puis une section repliable « Du jour » avec le verset (arabe `dir="rtl"` + français, référence sourate:verset) et le hadith (français + référence).
- Aucune donnée personnelle sur la page.

## Qualité
- Chaque module a des tests `node:test` avec fixtures (regroupement des créneaux de pluie, seuils des conseils, règles, anti-doublon, passage heure d'été/hiver, décalage du cron).
- Le cron est écrit pour l'heure d'été et d'hiver : deux déclenchements UTC par passage ; le script ne continue que s'il est dans la bonne fenêtre locale et si le passage du jour n'a pas déjà eu lieu. Minutes de cron décalées (pas :00).
- README court : installation de l'appli ntfy, Raccourci iOS, comment modifier la config et les règles, comment lancer un test manuel.