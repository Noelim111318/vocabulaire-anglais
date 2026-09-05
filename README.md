# ⭐ Vocabulaire d'Anglais (PWA)

Appli web pour apprendre du vocabulaire anglais. On affiche un mot (en anglais **ou**
en français, tiré au hasard) et l'enfant choisit la bonne traduction parmi une liste
de propositions dont la taille dépend de la difficulté.

Installable (PWA), fonctionne hors-ligne, avec entraînement adapté aux mots pas
encore acquis, prononciation vocale, rapport d'erreurs et bilan par liste.

**Lien** : https://noelim111318.github.io/vocabulaire-anglais/

## Ajouter ou modifier des mots

Tout se passe dans **un seul fichier : [`words.js`](words.js)**.

```js
window.VOCAB_LISTS = [
  {
    name: "Les animaux",          // texte affiché sur le bouton de la liste
    icon: "🐶",                    // emoji affiché sur le bouton (facultatif, 📚 par défaut)
    words: [
      { en: "dog", fr: "chien" }, // en = anglais, fr = français
      { en: "cat", fr: "chat" },
      // plusieurs traductions acceptées : tableau, la 1re est celle affichée
      { en: "teacher", fr: ["professeur", "maître", "maîtresse"] },
      { en: ["trousers", "pants"], fr: "pantalon" },
    ],
  },
  // copie un bloc { name, icon, words: [...] } pour ajouter une liste
];
```

- `words.js` est déjà rempli avec **25 listes de vocabulaire du primaire**
  (cycles 2 et 3 : nombres, couleurs, famille, corps, animaux, nourriture,
  vêtements, école, maison, météo/saisons, émotions, verbes, métiers, ville,
  transports, nature, Halloween, Noël, adjectifs…). Modifie-les ou ajoute les tiennes.
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
coche les listes à travailler. Une partie fait au maximum **25 questions**
(tirées au hasard si les listes cochées en contiennent plus). Coche
**« 📖 Passer en revue tous les mots des listes cochées »** pour une partie
complète, sans limite (chaque mot une fois, dans un sens tiré au hasard). Le
défaut de 25 se règle via `MAX_QUESTIONS` en haut de `app.js`.

## Niveaux de difficulté

| Niveau | Propositions affichées |
|--------|------------------------|
| Facile | 3 |
| Moyen | 4 |
| Difficile | 6 |

La liste choisie et la difficulté sont mémorisées dans le navigateur pour la prochaine fois.
Le nombre cumulé d'erreurs par mot (« total : N » dans le rapport) est aussi conservé.

## Options (écran d'accueil)

| Option | Effet | Défaut |
|---|---|---|
| 🧠 **Entraînement intelligent** | Repropose surtout les mots **pas encore acquis** (un mot est « appris » après **3 bonnes réponses d'affilée**), et espace les mots acquis. Le compteur `12/45 appris` s'affiche sur chaque bouton de liste. | activé |
| 📖 **Passer en revue tous les mots** | Ignore la limite de 25 → chaque mot des listes cochées une fois. | désactivé |
| ↔️ **Chaque mot dans les deux sens** | Chaque mot est posé EN→FR *et* FR→EN (partie 2× plus longue). | désactivé |
| 🔊 **Prononcer les deux mots** | Lecture automatique après chaque réponse (voir plus bas). | activé |
| 🔔 **Petits sons** | Un « ding » / « boop » court quand on répond. | activé |

Un **🔥 compteur de jours d'affilée** s'affiche en haut quand l'enfant joue plusieurs jours de suite.
L'écran de bilan montre les **7 derniers jours** (mini-graphique + taux de réussite).
Le lien **« Réinitialiser la progression »** efface tout (mots appris, historique d'erreurs, série de jours).

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
4. Reporte ce lien dans ce README et dans `manifest.json` si besoin.

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

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des 3 écrans (réglages / jeu / bilan) |
| `app.css` | Styles |
| `words.js` | **Les listes de mots — le seul fichier à éditer** |
| `app.js` | Logique du jeu |
| `manifest.json` | Config PWA |
| `service-worker.js` | Cache hors-ligne |
| `fonts/` | Police Nunito auto-hébergée (fonctionne hors-ligne) |
| `icons/` | Icônes de l'appli |
| `favicon.ico` | Icône d'onglet |

## Icônes

Pour changer l'icône de l'appli, remplace les fichiers de `icons/` (et
`favicon.ico`) en gardant les mêmes noms et tailles : `icon-192.png` (192×192),
`icon-512.png` et `icon-512-maskable.png` (512×512, avec une marge autour du
dessin pour la version *maskable*), `apple-touch-icon.png` (180×180, sans
transparence).

## Idées d'évolution

- Éditeur de listes directement dans l'appli (sans toucher à `words.js`).
- Champ optionnel « exemple » ou image par mot.
