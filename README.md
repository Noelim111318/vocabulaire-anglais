# Vocabulaire d'Anglais (PWA)

Appli web pour apprendre du vocabulaire anglais. On affiche un mot (en anglais **ou**
en français, tiré au hasard) et l'enfant choisit la bonne traduction parmi une liste
de propositions dont la taille dépend de la difficulté.

Installable (PWA), fonctionne hors-ligne, avec entraînement adapté aux mots pas
encore acquis, prononciation vocale, rapport d'erreurs et bilan par liste.

**Lien** : https://noelim111318.github.io/vocabulaire-anglais/

Construite sur `pwa-engine` (dossier `engine/` : service worker, bandeau
d'installation, stockage, sons, série de jours). Même esprit que les appli des
tables d'addition et de multiplication.

## Ajouter ou modifier des mots

Tout se passe dans **un seul fichier : [`words.js`](words.js)**.

```js
window.VOCAB_LISTS = [
  {
    name: "Les animaux",          // texte affiché sur le bouton de la liste
    icon: "🐶",                    // emoji affiché sur le bouton (facultatif, 📚 par défaut)
    level: "avance",              // facultatif : "avance" = vocabulaire avancé (sinon "primaire")
    words: [
      { en: "dog", fr: "chien" }, // en = anglais, fr = français
      { en: "cat", fr: "chat" },
      // plusieurs traductions acceptées : tableau, la 1re est celle affichée
      { en: "teacher", fr: ["professeur", "maître", "maîtresse"] },
      { en: ["trousers", "pants"], fr: "pantalon" },
      // un mot peut forcer son propre niveau (ici : plus difficile que le reste)
      { en: "hedgehog", fr: "hérisson", level: "avance" },
    ],
  },
  // copie un bloc { name, icon, words: [...] } pour ajouter une liste
];
```

- `words.js` est déjà rempli avec **40 listes (~710 mots)** :
  - **25 listes thématiques** (nombres, couleurs, famille, corps, animaux, nourriture,
    vêtements, école, maison, météo, émotions, verbes, métiers, ville, transports,
    nature, Halloween, Noël, adjectifs…) : majoritairement primaire, **avec en fin
    de chaque liste ~5 mots plus difficiles** (`level: "avance"`) sur le même thème ;
  - **15 listes entièrement avancées** (`level: "avance"`, niveau A2–B1 :
    caractère, décrire une personne, maison en détail, environnement, corps/santé,
    verbes du collège, matières scolaires, adverbes/connecteurs, géographie…).
  Modifie-les ou ajoute les tiennes.
- **Niveau** : `level: "avance"` classe en avancé (sans ce champ → « primaire »).
  Il se met sur une **liste** *et/ou* sur un **mot précis**
  (`{ en: "hedgehog", fr: "hérisson", level: "avance" }`) — une liste peut donc
  mélanger des mots primaire et avancés. Sur l'écran d'accueil, le sélecteur
  **Primaire / Avancé / Tout** filtre les mots affichés.
- **Plusieurs traductions** : mets un tableau à la place d'une chaîne pour `en`
  ou `fr`. La **1re valeur** est celle qui s'affiche (le mot montré et le bouton
  « bonne réponse ») ; les suivantes sont *aussi acceptées* — elles ne seront
  jamais proposées comme mauvaise réponse, et l'enfant a juste s'il en choisit une.
- Mets **au moins 6 mots par liste** (idéalement 8+) pour que le niveau « Difficile »
  (6 propositions) ait assez de choix. Si une liste est trop courte, l'appli complète
  les propositions avec les mots des autres listes cochées.
- Évite, **dans une même liste**, deux mots dont la traduction **principale** est identique.
- Les accents et les majuscules ne comptent pas pour la correction (« Chien » = « chien »),
  mais les mots s'affichent tels que tu les écris.
- Attention aux **virgules** : une après chaque `{ en: ..., fr: ... }`.
- Après modification : recharge la page (ou redéploie).

Au premier lancement, **seule la 1re liste est cochée** : sur l'écran d'accueil,
coche les listes à travailler.

## Difficulté et longueur de la partie

| Réglage | Choix |
|---|---|
| **Difficulté** | Facile (3 propositions) · Moyen (4) · Difficile (6) |
| **Longueur de la partie** | 10 · 20 · 40 questions · **Tous** (tous les mots des listes cochées) — défaut : **20** |

Les mots sont tirés au hasard parmi les listes cochées ; si tu en coches plus que
la longueur choisie, une partie n'en pose que ce nombre. Réglages, listes et
progression sont mémorisés dans le navigateur.

## Options (écran d'accueil)

| Option | Effet | Défaut |
|---|---|---|
| 🧠 **Entraînement intelligent** | Repropose surtout les mots **pas encore acquis** (un mot est « appris » après **3 bonnes réponses d'affilée**), et espace les mots acquis. Le compteur `12/45 appris` s'affiche sur chaque bouton de liste. | activé |
| ↔️ **Chaque mot dans les deux sens** | Chaque mot est posé EN→FR *et* FR→EN (partie 2× plus longue). | désactivé |
| 🔊 **Prononcer les deux mots** | Lecture automatique après chaque réponse (voir plus bas). | activé |
| 🔔 **Petits sons** | Un « ding » / « boop » court quand on répond. | activé |

Un **🔥 compteur de jours d'affilée** s'affiche en haut quand l'enfant joue plusieurs jours de suite.
L'écran de bilan montre les **7 derniers jours** (mini-graphique + taux de réussite).
En bas de l'écran d'accueil, le lien **« Réinitialiser la progression »** efface tout
(mots appris, historique d'erreurs, série de jours) ; il est volontairement à
l'écart des réglages pour éviter les faux clics.

Quitter une partie en cours (« Changer les listes ») enregistre quand même ce qui a
été répondu. Une **nouvelle version** de l'appli n'est appliquée que depuis l'écran
d'accueil, jamais en pleine partie ni pendant la lecture du bilan.

Réglages de l'appli (seuil d'hésitation, longueurs de partie, mascottes, phrases du
bilan…) : [`data.js`](data.js).

## Ce que l'appli garde en mémoire (dans le navigateur, jamais envoyé ailleurs)

Clés `localStorage`, préfixées par `vocab-anglais:` :

| Donnée | Clé |
|---|---|
| Listes cochées, difficulté, longueur, niveau, options | `prefs` |
| Mots appris (série de bonnes réponses par mot) | `mastery` |
| Total cumulé d'erreurs par mot (`liste::mot`) | `errors` |
| Série de jours d'affilée | `streak` |
| Questions par jour (60 jours, pour le graphique 7 j) | `daily` |
| Bandeau « Installer » masqué | `install-hidden` |
| Version du schéma de stockage | `__schema` |

**Reprise des anciennes données.** Avant la v1.2.0, les clés s'appelaient
`vocab_prefs_v1`, `vocab_error_history_v1`, `vocab_mastery_v1`, `vocab_streak_v1`,
`vocab_daily_v1` et `vocab_install_hidden`. Au premier lancement, `store.migrate`
(étape 1, tout en haut de `app.js`) les recopie vers les clés ci-dessus puis supprime
les anciennes : personne ne perd ses mots appris, sa série ni son historique.

## Diagnostic

En bas de l'écran d'accueil, le lien **Diagnostic** ouvre [`diag.html`](diag.html) :
ce que l'appli a en mémoire sur l'appareil (clés, espace utilisé, service worker,
caches) et un **journal des 30 dernières ouvertures** (clé `diag:log`, hors espace de
l'appli) qui permet de situer un éventuel effacement des données. Boutons **Copier**
et **Partager**. Lecture seule, rien n'est envoyé ; les valeurs très longues (mots
appris) sont tronquées.

## Écouter les mots

Pendant le jeu, le bouton **🔊 Écouter** prononce les mots (voix du navigateur) :

- **avant de répondre** : lit le mot affiché, dans sa langue (sans donner la réponse) ;
- **après avoir répondu** : lit le mot affiché dans sa langue, **puis** sa traduction
  dans l'autre langue. Donc mot anglais → français, ou mot français → anglais.

La case **« Prononcer les deux mots après chaque réponse »** sur l'écran d'accueil
fait cette lecture automatiquement à chaque réponse (activée par défaut). Après une
bonne réponse, on ne passe à la question suivante qu'une fois les deux mots
entièrement prononcés (donc jamais coupés). Si l'appareil n'a pas de synthèse
vocale, le bouton et l'option n'apparaissent pas.

## Démarrage local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(Un simple double-clic sur `index.html` empêche le Service Worker de se charger :
passe par un petit serveur local comme ci-dessus.)

## Déployer sur GitHub Pages

1. Crée un dépôt GitHub et pousse tous ces fichiers à la racine.
2. **Settings → Pages → Build and deployment → Source : _Deploy from a branch_**,
   branche `main`, dossier `/ (root)`.
3. Attends une minute : le site est publié sur `https://<compte>.github.io/<dépôt>/`.
4. Reporte ce lien dans ce README et adapte `id` dans `manifest.json`.

Le `manifest.json` déclare `"id": "/vocabulaire-anglais/index.html"` : c'est l'identité
que les navigateurs déduisaient déjà de `start_url`, donc les installations
existantes restent la même appli. Ne le change pas.

## Installer sur mobile

Quand l'appli est installable et pas encore installée, un bandeau **📲 Installer
l'appli** apparaît tout seul **en haut de l'écran d'accueil** :

- **Android / Chrome / Edge** : le bouton lance la vraie fenêtre d'installation du
  navigateur (via l'événement `beforeinstallprompt`).
- **iOS / Safari** : le bouton affiche la marche à suivre (Partager → « Sur l'écran
  d'accueil »), car iOS ne permet pas d'installer par un bouton.
- Le lien **« Masquer »** à côté fait disparaître le bouton définitivement
  (mémorisé dans le navigateur) ; il disparaît aussi tout seul une fois l'appli installée.

Installation manuelle si besoin : menu ⋮ → « Installer l'application » (Android),
ou Partager → « Sur l'écran d'accueil » (iOS).

## Livrer une nouvelle version

1. `./tools/bump-version.sh vX.Y.Z` — bumpe la version dans `index.html`,
   `app.js`, `service-worker.js` et `manifest.json` d'un coup.
2. Ajoute tout nouveau fichier statique à `APP_SHELL` dans `service-worker.js`.
3. Déploie : les appareils déjà installés se mettent à jour tout seuls (au
   prochain passage par l'accueil).

## Mettre à jour le moteur

`engine/` est une **copie** de `toolbox/pwa-engine/engine/` : ne la modifie pas
ici. Depuis `toolbox/pwa-engine/` :

```bash
./tools/sync-engine.sh <chemin>/vocabulaire-anglais
```

puis `./tools/bump-version.sh vX.Y.Z` ici (le cache du service worker inclut
`engine/*`). `engine/.version` indique la version du moteur embarquée. API du
moteur : [`engine/README.md`](engine/README.md).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des 3 écrans (réglages / jeu / bilan) |
| `words.js` | **Les listes de mots — le seul fichier à éditer pour changer les mots** |
| `data.js` | Réglages et contenu de l'appli (`window.APP_DATA`) |
| `app.js` | Logique du jeu, du bilan et de la voix |
| `app.css` | Styles (importe `engine/engine.css`) |
| `manifest.json` | Config PWA |
| `service-worker.js` | Identité du cache + liste des fichiers ; logique dans `engine/sw-core.js` |
| `diag.html` | Page de diagnostic (lecture seule) |
| `engine/` | Le moteur PWA (copie de `toolbox/pwa-engine`), avec la police Nunito |
| `icons/`, `favicon.ico` | Icônes de l'appli |
| `tools/` | `make-icon.py` (icônes, facultatif), `bump-version.sh` (version) |

## Icônes

L'icône (bulle jaune « Aa » sur le fond violet étoilé) est générée par
[`tools/make-icon.py`](tools/make-icon.py) :

```bash
pip install pillow
python3 tools/make-icon.py
```

Modifie les couleurs / la géométrie de la bulle en haut du script, puis relance-le.
Pour une icône complètement différente, remplace directement les fichiers de
`icons/` (et `favicon.ico`) en gardant les mêmes noms et tailles : `icon-192.png`
(192×192), `icon-512.png` et `icon-512-maskable.png` (512×512, avec une marge
autour du dessin pour la version *maskable*), `apple-touch-icon.png` (180×180,
sans transparence).

## Idées d'évolution

- Éditeur de listes directement dans l'appli (sans toucher à `words.js`).
- Champ optionnel « exemple » ou image par mot.
