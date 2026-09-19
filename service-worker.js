/* Vocabulaire d'Anglais — service worker.
 * Toute la logique (precache tolerant, cache d'abord + revalidation, purge,
 * cache runtime) est dans engine/sw-core.js. Ici on declare juste l'identite
 * du cache et la liste des fichiers de la coque.
 *
 * >>> A chaque livraison : ./tools/bump-version.sh vX.Y.Z
 *     (bumpe APP_VERSION ici + index.html + app.js + manifest.json d'un coup)
 *     puis ajoute tout nouveau fichier statique a APP_SHELL ci-dessous.
 *
 * APP_SLUG reste « vocab-anglais » (prefixe des anciens caches) : le moteur
 * purge ainsi tout seul l'ancien cache « vocab-anglais-v1.1.1 ».
 */
self.APP_SLUG = 'vocab-anglais';
self.APP_VERSION = 'v1.2.0';

self.APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './data.js',
  './words.js',
  './manifest.json',
  './diag.html',
  './favicon.ico',
  './engine/engine.js',
  './engine/engine.css',
  './engine/sw-core.js',
  './engine/fonts/nunito-latin.woff2',
  './engine/fonts/nunito-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

importScripts('./engine/sw-core.js');
