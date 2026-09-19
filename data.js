/* Vocabulaire d'Anglais — réglages de l'app.
 *
 * Tout ce qu'on peut vouloir régler sans toucher à la logique (app.js).
 * Les mots eux-mêmes sont dans words.js.
 */
window.APP_DATA = {
  title: "Vocabulaire d'Anglais",

  // Au-delà, une bonne réponse compte comme une hésitation (à revoir).
  slowMs: 5000,

  // Bonnes réponses d'affilée pour qu'un mot compte comme « appris ».
  masteredStreak: 3,

  // Longueur d'une partie : choix proposés sur l'écran d'accueil (+ « Tous »).
  lengthChoices: [10, 20, 40],
  defaultLength: 20,

  // Une question ratée revient entre 1 et `requeueSpan` questions plus loin.
  requeueSpan: 4,

  mascots: ['🦊', '🐸', '🦁', '🐼', '🦄', '🐯', '🐧', '🦋'],

  // Du meilleur au moins bon ; {rate} = taux de réussite en %.
  tiers: [
    { min: 100, emoji: '🏆', title: 'Parfait !', sub: 'Tout juste du premier coup, champion !' },
    { min: 80, emoji: '⭐', title: 'Excellent !', sub: '{rate}% de bonnes réponses, c\'est super !' },
    { min: 60, emoji: '👍', title: 'Bien joué !', sub: '{rate}% de bonnes réponses, continue comme ça !' },
    { min: 0, emoji: '💪', title: 'Courage !', sub: '{rate}% — encore un peu d\'entraînement et ça rentrera !' },
  ],
};
