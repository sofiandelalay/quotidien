# Quotidien

Chaque matin à 7h30, un briefing court en notification sur l'iPhone : météo, pluie, air, férié, fête, agenda, anniversaires et un conseil s'il est utile.
Le matin et le soir (19h00), des alertes « bon moment pour… » (rando, voiture, air, gel).
Tout est gratuit et sans serveur : GitHub Actions et [ntfy.sh](https://ntfy.sh). Cahier des charges : [Claude.md](Claude.md) ; sources : [docs/sources.md](docs/sources.md).

## Installer l'appli ntfy (iPhone)

1. Dans l'App Store, installez **ntfy** (éditeur Philipp Heckel) et autorisez les notifications.
2. Touchez **+** et saisissez le nom du sujet : c'est la valeur `NTFY_TOPIC_BRIEFING` de `.secrets.local` (sur le PC, jamais commité). Laissez le serveur `ntfy.sh` et validez.

Le nom du sujet fait office de mot de passe : ne le partagez pas.

> ⚠️ **Ne vous abonnez pas au sujet de position** (`NTFY_TOPIC_POSITION`). Il ne sert qu'au Raccourci ci-dessous pour envoyer votre position au script. S'y abonner n'apporterait rien et afficherait vos coordonnées en notification deux fois par jour.

### Je ne reçois pas les notifications

Sur iPhone, ntfy.sh passe par le service de notifications d'Apple. Cette liaison se casse parfois : les messages n'apparaissent alors que dans l'appli, quand on l'ouvre. La documentation de ntfy ([problèmes connus](https://docs.ntfy.sh/known-issues/)) recommande de **supprimer l'abonnement puis de le réajouter**.

1. Dans l'appli ntfy, faites glisser le sujet vers la gauche, puis **Supprimer**.
2. Fermez l'appli : balayez-la vers le haut dans le sélecteur d'applis.
3. Rouvrez-la, touchez **+**, saisissez le nom du sujet et laissez le serveur par défaut (**ntfy.sh**). N'activez pas « Use another server ».
4. Verrouillez l'iPhone, puis lancez une alerte d'essai depuis l'appli GitHub : Actions → **quotidien** → Run workflow → **essai** = `gel`. Une bannière doit arriver en moins d'une minute.

Si rien n'arrive, vérifiez dans **Réglages → Notifications → ntfy** :
- Écran verrouillé, Centre de notifications et Bannières sont cochés ;
- ntfy n'est pas dans le **Résumé programmé** ;
- aucun mode **Concentration** ne filtre ntfy.

Mettez aussi l'appli à jour depuis l'App Store.

## Raccourci iOS : envoyer la position

Le script calcule la météo là où vous êtes. Deux fois par jour, l'iPhone publie sa position, arrondie à 2 décimales (environ 1 km), sur le sujet ntfy privé. Le script lit le dernier message de moins de 12 h. Sans message récent, il utilise Lille. La position n'est jamais écrite dans un fichier, un commit, un log ni la page : seul le nom de la commune apparaît dans la notification.

Le nom du sujet de position est la valeur `NTFY_TOPIC_POSITION` de `.secrets.local` sur le PC. Notez-le dans le raccourci uniquement.

### 1. Créer le raccourci « Position quotidien »

App **Raccourcis** → onglet **Raccourcis** → **+**. Ajoutez ces actions dans l'ordre :

1. **Obtenir la position actuelle** (catégorie Localisation).
2. **Arrondir le nombre** : touchez « Nombre », choisissez la variable *Position actuelle*, touchez-la de nouveau et choisissez **Latitude**. Réglez « Arrondir à » sur **Centièmes**.
3. **Arrondir le nombre** une seconde fois, avec la propriété **Longitude** de *Position actuelle* et **Centièmes**.
4. **Texte** : insérez la variable *Nombre arrondi* (la latitude), tapez **`;`**, puis insérez *Nombre arrondi 2* (la longitude). Vous obtenez par exemple `50,63;3,06`.
   *Pourquoi `;` et pas `,` ?* Un iPhone réglé en français écrit `50,63` avec une virgule décimale. Le point-virgule évite toute ambiguïté. Le script accepte aussi `50.63,3.06` et `50,63,3,06`.
5. **Obtenir le contenu de l'URL** :
   - URL : `https://ntfy.sh/` suivi du nom du sujet de position ;
   - touchez **Afficher plus** : **Méthode** `POST`, **Corps de la requête** `Fichier`, **Fichier** = la variable *Texte*.

Nommez-le « Position quotidien ». **Lancez-le une fois à la main**. iOS demande alors :
- l'accès à la position : répondez **Autoriser lorsque l'app est active** (ou *Toujours*) ;
- la connexion à ntfy.sh : répondez **Toujours autoriser**.

Sans cette première exécution, les automatisations restent bloquées sur ces questions.

### 2. Deux automatisations : 7h00 et 19h30

Onglet **Automatisation** → **+** (ou **Nouvelle automatisation**) → **Heure de la journée** :

1. **Heure** 07:00, **Répéter** Quotidiennement.
2. Choisissez **Exécuter immédiatement** (et non « Exécuter après confirmation »). Désactivez **M'avertir lors de l'exécution**.
3. **Suivant** → choisissez le raccourci **Position quotidien** → **OK**.

Recommencez avec **19:30**.

> ℹ️ Pourquoi ces heures ? ntfy.sh ne garde les messages que 12 h.
> - Le briefing est préparé entre 5h23 et 7h23, puis programmé pour 7h30 : il utilise la position de 19h30 la veille, qui a moins de 12 h.
> - Le passage du soir est préparé entre 16h23 et 18h23 : il utilise celle de 7h00.
>
> Si vous déplacez une automatisation, gardez moins de 12 h entre elle et le passage qui s'en sert. Le Raccourci peut aussi être lancé à la main à tout moment.

Pour vérifier : lancez le raccourci, puis dans GitHub, Actions → **quotidien** → *Run workflow* (passage `matin`, force coché). Le log doit afficher « Position : Raccourci iPhone » (jamais les coordonnées), et la notification doit indiquer votre commune.

## Agenda et anniversaires

Pour que le briefing affiche vos rendez-vous, le script doit pouvoir lire vos agendas. Il le fait grâce à un **lien privé** (format « ICS ») que fournissent Outlook et Google. Ce lien est rangé dans un secret GitHub, `CALENDAR_URLS`, que personne d'autre ne voit. Trois étapes, à faire une seule fois, **sur un ordinateur** (les réglages ne sont pas dans les applis mobiles) :

**1. Récupérer le lien de chaque agenda**
- **Outlook** : sur outlook.live.com → ⚙️ Paramètres → Calendrier → **Calendriers partagés** → *Publier un calendrier*. Choisissez le calendrier, puis « Peut afficher tous les détails », et touchez **Publier**. Deux liens apparaissent : copiez celui qui se termine par **.ics**.
- **Google** : sur calendar.google.com → ⚙️ → **Paramètres** → dans la colonne de gauche, *Paramètres de mes agendas*, cliquez sur l'agenda → section *Intégrer l'agenda* → **Adresse secrète au format iCal** : copiez-la.
- **Anniversaires** (facultatif) : faites de même avec le calendrier « Anniversaires », s'il propose un lien. Sinon, les événements « toute la journée » dont le titre contient « anniversaire » sont reconnus dans vos agendas habituels.

**2. Écrire une ligne par agenda**, au format `nom|lien`, dans un bloc-notes (sans l'enregistrer). Par exemple :

```
Outlook|https://outlook.live.com/owa/calendar/…/calendar.ics
Google|https://calendar.google.com/calendar/ical/…/basic.ics
Anniversaires|https://…
```

**3. L'enregistrer dans GitHub** : sélectionnez et copiez toutes les lignes, ouvrez PowerShell et lancez :

```
Get-Clipboard | gh secret set CALENDAR_URLS --repo sofiandelalay/quotidien
```

Les liens ne sont écrits nulle part ailleurs. Pour vérifier, lancez le workflow `quotidien` (passage `matin`, force) : le log indique « Agenda : 2 agenda(s) configuré(s) », et la notification affiche vos rendez-vous.

Ce que fait ensuite le script :
- Récurrences, exceptions et fuseaux Windows d'Outlook (« Romance Standard Time »…) sont gérés.
- Le briefing affiche jusqu'à 3 lignes : aujourd'hui, puis demain jusqu'à midi (`10h Kiné`, `Demain 8h30 Contrôle technique`, `+ 2 autres événements`). Avec `agenda.detail: nombre`, une seule ligne s'affiche : `Agenda : 2 aujourd'hui, 1 demain matin`.
- **Hors travail** : `agenda.ignorer_agendas` ignore des agendas entiers ; `agenda.ignorer_mots_cles` ignore les événements dont le titre contient un de ces mots (réunion, teams…).
- **Anniversaires** : sont traités comme anniversaires les événements « toute la journée » d'un agenda listé dans `agenda.anniversaires.agendas`, ou dont le titre contient « anniversaire ». Ils sont affichés le jour même (`🎂 Anniversaire de Marie`), en tête de l'agenda et hors de la limite de 3 lignes, y compris avec `detail: nombre`. Pour les couper : `agenda.anniversaires.actif: false`.
- Les événements ne vont que dans la notification : jamais dans un log, un fichier, un commit ni la page.

## Page de détail

**https://sofiandelalay.github.io/quotidien/**

Une seule page mobile, mise à jour à chaque passage (matin et soir). Elle affiche :
- la commune ;
- la météo du jour : l'état du ciel en un mot (ensoleillé, nuageux, couvert…), la pluie avec une frise sur 24 h, le vent, les UV et le soleil ;
- l'air en un mot (bon, moyen, dégradé…) et les pollens notables ;
- le prochain férié et la fête du jour ;
- une section repliable **Hadith et verset** : le hadith (son numéro parmi les quarante hadiths de an-Nawawi), puis le verset (arabe et français, sourate:verset).

Un bandeau prévient si les données ont plus de 26 h. Toucher une notification ouvre cette page : l'adresse est `notification.lien` dans `config.yaml`. Ajouter `#du-jour` à l'adresse ouvre directement la section « Hadith et verset ».

La page est **publique**. Elle ne contient ni agenda, ni anniversaire, ni position : seulement le nom de la commune. Ses données (`data.json`) sont construites par liste blanche de champs, et vérifiées par `test/page.test.mjs`. Elle est déployée par GitHub Actions (`upload-pages-artifact` puis `deploy-pages`) ; aucun fichier généré n'est commité.

**L'installer sur l'écran d'accueil** :
1. Ouvrez l'adresse dans **Safari** (pas dans une autre appli).
2. Touchez **Partager** (le carré avec la flèche), puis **Sur l'écran d'accueil**.
3. Touchez **Ajouter**.

L'icône « Quotidien » (soleil et nuage) apparaît. La page s'ouvre alors en plein écran, sans barre d'adresse, en thème clair ou sombre selon l'iPhone. Il n'y a pas de mode hors ligne (aucun service worker) : la page recharge ses données chaque fois qu'on revient dessus.

## Modifier la configuration depuis l'iPhone

Tous les seuils sont dans [`config.yaml`](config.yaml), commenté en français : pluie, vent, UV, air, pollens, conseils, heures d'envoi, fenêtres, agenda et lien de la page. Les alertes sont dans [`rules.yaml`](rules.yaml) (voir « Écrire une règle »).

Pour les modifier depuis l'**appli GitHub** de l'iPhone :
1. Ouvrez le dépôt **sofiandelalay/quotidien** et touchez **Code**.
2. Ouvrez `config.yaml` ou `rules.yaml`, touchez **…** puis **Modifier le fichier** (l'icône crayon).
3. Modifiez une valeur, en gardant l'indentation (des espaces, jamais de tabulation).
4. Touchez **Valider les modifications**, ajoutez un message court, puis **Valider directement sur main**.

Le changement s'applique au prochain passage.

Si l'appli GitHub ne propose pas la modification, ouvrez le fichier sur github.com dans Safari : l'icône crayon y fait la même chose.

Pour vérifier tout de suite : onglet **Actions** → **quotidien** → **Run workflow** (voir « Lancer un test manuel »). Une faute de saisie dans `rules.yaml` apparaît en avertissement dans le log, en français, et le briefing part quand même. Une faute qui rend `config.yaml` illisible fait échouer le passage : GitHub vous envoie alors un e-mail, et il suffit de corriger le fichier.

## Écrire une règle (`rules.yaml`)

Chaque règle envoie **au plus une** notification courte (un titre et une ligne) quand ses conditions sont remplies.

```yaml
regles:
  - id: gel                    # identifiant (minuscules), sert à la clé anti-doublon
    nom: Gel                   # libre, pour vous
    moment: soir               # matin (avec le briefing, 7h30) ou soir (19h00)
    jours: [lundi, jeudi]      # facultatif : jours où la règle est regardée
    periode: { du: "11-01", au: "03-31" }   # facultatif : période de l'année (peut passer le nouvel an)
    evenement: demain          # jour concerné : aujourdhui (défaut), demain, lundi … dimanche
    delai_jours: 5             # facultatif : jours minimum entre deux alertes de cette règle
    conditions:                # toutes requises (liste) ; ou « tous: » / « un_des: », imbricables
      - { quand: nuit, mesure: temperature_min, moins_de: 0 }
    titre: "🥶 Gel cette nuit"
    message: "Jusqu'à {nuit.temperature_min}° : protéger les plantes."
    actif: true                # false pour couper la règle sans l'effacer
```

| Élément | Valeurs |
|---|---|
| `quand` | `aujourdhui`, `demain`, `lundi` … `dimanche` (de 7h à 22h ; « samedi » le samedi même = aujourd'hui), `nuit` (20h → 8h le lendemain), `prochaines_48h` (à partir de l'heure du passage) |
| `mesure` | `temperature_max`, `temperature_min`, `ressenti_min` (°C) ; `pluie` (`sec` ou `pluvieux`, d'après les seuils de `config.yaml`) ; `pluie_mm` (cumul) ; `probabilite_pluie_max` (%) ; `vent_max`, `rafales_max` (km/h) ; `uv_max` ; `air_indice_max` (indice européen, aujourd'hui et demain seulement) ; `air` (`bon`, `moyen`, `dégradé`, `mauvais`…) |
| opérateur | `au_moins` (≥), `au_plus` (≤), `plus_de` (>), `moins_de` (<), `est` (=, pour `pluie` et `air`) |
| variables | `{quand.mesure}` (ex. `{samedi.temperature_max}`), `{date}` (« samedi 14 nov »), `{commune}` |

Pour combiner :

```yaml
    conditions:
      tous:
        - { quand: demain, mesure: pluie, est: sec }
        - un_des:
            - { quand: demain, mesure: vent_max, au_plus: 20 }
            - { quand: demain, mesure: rafales_max, au_plus: 35 }
```

**Anti-doublon** : la clé d'une alerte est `id:date de l'événement` (ex. `rando:2026-11-14`, `gel:2026-11-08`). Elle est notée dans `state/state.json` dès l'envoi. Une même clé ne repart jamais, même si le workflow est relancé, forcé, ou s'il a échoué en cours de route. L'état est purgé après 14 jours.
Si une donnée manque (prévision trop courte, air indisponible), la règle ne se déclenche pas.
Une erreur de saisie dans `rules.yaml` est signalée en français dans le log (avertissement). Le briefing part quand même.

Règles de départ : **rando** (jeudi soir : samedi et dimanche secs et ≥ 15 °C), **voiture** (matin : 48 h sans pluie, au plus une fois tous les 5 jours), **air** (matin : indice européen ≥ 60 aujourd'hui), **gel** (soir : température négative la nuit suivante). La règle **barbecue** est un exemple désactivé.

## Lancer un test manuel

- Depuis GitHub : Actions → **quotidien** → *Run workflow* → choisir le passage (`matin` ou `soir`), cocher **force**. Tout part immédiatement. Le briefing forcé est un test : il ne compte pas comme celui du jour. Une alerte, en revanche, n'est jamais envoyée deux fois.
- En ligne de commande : `gh workflow run quotidien.yml -f passage=soir -f force=true`
- **Alerte d'essai sur l'iPhone** : *Run workflow* → **essai** = `gel` (ou `rando`, `voiture`, `air`), ou `gh workflow run quotidien.yml -f essai=gel`. L'alerte est calculée sur la fixture `test/fixtures/regles/gel-oui.json` et arrive tout de suite, avec un titre commençant par « [Essai] ». Rien n'est noté dans `state.json` : la vraie alerte partira quand même le moment venu.
- Simulation des règles, sans réseau ni envoi :
  - `npm run simulate` : toutes les fixtures de `test/fixtures/regles/` ;
  - `npm run simulate -- --regle gel` : une seule règle ;
  - `npm run simulate -- --regle gel --fixture test/fixtures/regles/gel-oui.json` : une règle sur une fixture.

  Une fixture décrit la météo jour par jour (`tmin`, `tmax`, `pluie` par heure, `air`…). Copiez-en une pour tester une idée de règle.
- Simulation du briefing : `npm run simulate:briefing`.
- Page en local, avec les données fictives de `test/fixtures/matin` : `npm run page`, puis ouvrez http://127.0.0.1:8080/ dans un navigateur.
- Tests : `npm test`. Ils couvrent les règles, l'agenda, la fenêtre du cron, la sélection du verset et du hadith, et l'absence de donnée sensible dans `data.json`.
- Depuis l'iPhone : appli GitHub → dépôt → **Actions** → **quotidien** → **Run workflow**. Choisissez le passage, cochez **force**, puis **Run workflow**. La notification arrive en moins d'une minute et la page se met à jour une minute plus tard.

## Fonctionnement

- Le workflow `quotidien` se déclenche à 04:23 et 05:23 UTC pour le matin, puis à 15:23 et 16:23 UTC pour le soir : deux déclenchements par passage, pour couvrir l'heure d'hiver et l'heure d'été.
- Le script choisit le passage d'après l'heure de Paris (fenêtres de `config.yaml`) et ne refait jamais un passage terminé.
- Il programme les notifications chez ntfy (champ `delay`) pour 7h30 et 19h00 pile.
- `state/state.json` est commité à chaque passage : il évite les doublons et garde le cron actif.
- La page de détail est republiée à chaque passage effectué (pas quand le passage était déjà fait).
- `diagnostic` vérifie que chaque source répond depuis GitHub Actions ; `donnees` recopie dans `data/` les fêtes, les hadiths et la liste des versets courts.
- Avant chaque commit : `npm run check-lock`. Le PC utilise un registre npm privé ; le projet force le registre public via `.npmrc`.
