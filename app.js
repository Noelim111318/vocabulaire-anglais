/* Vocabulaire d'Anglais — logique de l'app.
 *
 * La coque PWA (service worker, bandeau installer, stockage, sons, série de
 * jours…) vient d'AppEngine (engine/engine.js). Ici : les mots, le jeu, le bilan
 * et la voix. Les mots sont dans words.js, les réglages dans data.js.
 */
(function () {
  'use strict';

  const APP_VERSION = 'v1.4.0';
  const APP_ID = 'vocab-anglais';
  const E = window.AppEngine;
  const D = window.APP_DATA;
  const $ = E.$;

  E.boot({
    id: APP_ID,
    version: APP_VERSION,
    updateWhen: true,       // une nouvelle version ne s'applique que depuis l'accueil, jamais en pleine partie
    // Anciennes clés (avant le moteur, sans préfixe) : reprises une fois, avant tout rendu.
    legacyKeys: {
      vocab_prefs_v1: 'prefs',
      vocab_error_history_v1: 'errors',
      vocab_mastery_v1: 'mastery',
      vocab_streak_v1: 'streak',
      vocab_daily_v1: 'daily',
      vocab_install_hidden: { to: 'install-hidden', map: () => true },
    },
    strings: {
      weekSummary: (seen, days, rate) =>
        `${seen} mots sur ${days} jour${days > 1 ? 's' : ''} — ${rate}% de réussite`,
    },
  });

  /* ------------------------------------------------- Load / clean word lists */
  function toTranslations(v) {
    const arr = Array.isArray(v) ? v : [v];
    const out = [];
    for (const x of arr) {
      if (typeof x === 'string' && x.trim()) out.push(x.trim());
    }
    return out;
  }

  function joinTr(arr) {
    return arr.slice(0, 3).join(' / ') + (arr.length > 3 ? ' …' : '');
  }

  function normLevel(v, fallback) {
    const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (s === 'avance' || s === 'avancé' || s === 'advanced') return 'avance';
    if (s === 'primaire' || s === 'primary' || s === 'facile') return 'primaire';
    return fallback;
  }

  function normalizeLists(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach((list, idx) => {
      if (!list || typeof list !== 'object') return;
      const name = (typeof list.name === 'string' && list.name.trim())
        ? list.name.trim()
        : `Liste ${idx + 1}`;
      const icon = (typeof list.icon === 'string' && list.icon.trim())
        ? list.icon.trim()
        : '📚';
      const level = normLevel(list.level, 'primaire');
      const wordsRaw = Array.isArray(list.words) ? list.words : [];
      const words = [];
      const seen = new Set();
      wordsRaw.forEach(w => {
        if (!w || typeof w !== 'object') return;
        // "en" and "fr" may be a string OR an array of accepted translations;
        // the first entry is the one shown, the rest are also accepted.
        const enAll = toTranslations(w.en);
        const frAll = toTranslations(w.fr);
        if (!enAll.length || !frAll.length) return;
        const en = enAll[0], fr = frAll[0];
        const k = en.toLowerCase() + '|' + fr.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        // un mot peut avoir son propre "level" ; sinon il hérite de celui de la liste
        words.push({ en, fr, enAll, frAll, level: normLevel(w.level, level) });
      });
      if (words.length >= 1) out.push({ name, icon, level, words });
    });
    const nameSeen = new Set();
    out.forEach((l, i) => {
      let n = l.name;
      let c = 2;
      while (nameSeen.has(n)) { n = `${l.name} (${c++})`; }
      nameSeen.add(n);
      l.name = n;
      l.id = i;
    });
    return out;
  }

  const LISTS = normalizeLists(window.VOCAB_LISTS);

  const ALL_WORDS = [];
  LISTS.forEach(l => l.words.forEach(w =>
    ALL_WORDS.push({
      en: w.en, fr: w.fr, enAll: w.enAll, frAll: w.frAll, level: w.level, listName: l.name,
    })));

  const WORD_INDEX = {};
  ALL_WORDS.forEach(w => { WORD_INDEX[errKey(w.listName, w.en)] = w; });

  const LIST_ICON = {};
  LISTS.forEach(l => { LIST_ICON[l.name] = l.icon; });

  function errKey(listName, en) { return listName + '::' + en; }
  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  function span(cls, text) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }
  function setActive(btn, on) {
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  /* ------------------------------------------------------------------ State */
  let selectedIds = new Set();
  let difficulty = 4;
  let queue = [];
  let errorCounts = {};
  let slowSet = new Set();
  let opTimes = {};
  let listStats = {};
  let scoreCorrect = 0;
  let scoreWrong = 0;
  let totalOps = 0;
  let currentItem = null;
  let answered = false;
  let questionStart = 0;
  let mascotIdx = 0;
  let advanceTimer = null;
  let speakAfter = true;
  let sessionLength = D.defaultLength;   // nombre de questions, ou 'all'
  let levelFilter = 'primaire';   // 'primaire' | 'avance' | 'tout'
  let smartMode = true;
  let bothDirections = false;
  let direction = 'mix';        // sens des questions : 'mix' (au hasard) | 'en2fr' | 'fr2en'
  let soundOn = true;
  let mastery = {};
  let committed = true;         // la partie en cours a-t-elle déjà été enregistrée ?

  /* -------------------------------------------------------------- Persistence */
  function loadErrorHistory() {
    const h = E.store.load('errors', {});
    return h && typeof h === 'object' && !Array.isArray(h) ? h : {};
  }
  function savePrefs() {
    const names = [];
    selectedIds.forEach(i => { if (LISTS[i]) names.push(LISTS[i].name); });
    E.store.save('prefs', {
      lists: names, difficulty, level: levelFilter, length: sessionLength,
      speak: speakAfter,
      smart: smartMode, both: bothDirections, direction, sound: soundOn,
    });
  }

  /* ------------------------------------------------ Mastery (répétition espacée) */
  function masteryOf(key) {
    return mastery[key] || { seen: 0, correct: 0, streak: 0, last: 0 };
  }
  function bumpMastery(key, ok) {
    const m = masteryOf(key);
    m.seen += 1;
    m.last = Date.now();
    if (ok) { m.correct += 1; m.streak += 1; }
    else { m.streak = 0; }
    mastery[key] = m;
    E.store.save('mastery', mastery);
  }
  function wordWeight(key) {
    const m = mastery[key];
    if (!m || !m.seen) return 3.0;                 // jamais vu
    if (m.streak >= D.masteredStreak) return 0.35; // appris
    if (m.streak === 2) return 1.0;
    if (m.streak === 1) return 1.8;
    return 3.5;                                     // vu mais pas encore acquis
  }
  function listMastered(list) {
    let n = 0;
    listVisibleWords(list).forEach(w => {
      const m = mastery[errKey(list.name, w.en)];
      if (m && m.streak >= D.masteredStreak) n += 1;
    });
    return n;
  }

  /* --------------------------------------------------- Filtrage par niveau */
  // le niveau filtre les MOTS : une liste peut mélanger primaire et avancé
  function listVisibleWords(list) {
    return levelFilter === 'tout'
      ? list.words
      : list.words.filter(w => w.level === levelFilter);
  }
  function isVisible(list) { return listVisibleWords(list).length > 0; }
  function levelWords() {
    return levelFilter === 'tout'
      ? ALL_WORDS
      : ALL_WORDS.filter(w => w.level === levelFilter);
  }
  function visibleSelectedCount() {
    let n = 0;
    selectedIds.forEach(i => { if (LISTS[i] && isVisible(LISTS[i])) n += 1; });
    return n;
  }
  function anyAdvanced() { return ALL_WORDS.some(w => w.level === 'avance'); }

  /* --------------------------------------------------------- Settings screen */
  const grid = $('#lists-grid');
  const startBtn = $('#start-btn');

  // (re)construit la grille des listes selon le niveau choisi
  function renderLists() {
    grid.innerHTML = '';
    const vis = [];
    LISTS.forEach((l, i) => { if (isVisible(l)) vis.push(i); });
    if (vis.length && !vis.some(i => selectedIds.has(i))) selectedIds.add(vis[0]);

    vis.forEach(i => {
      const l = LISTS[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-btn';
      btn.dataset.idx = String(i);
      setActive(btn, selectedIds.has(i));
      const emoji = span('list-emoji', l.icon);
      emoji.setAttribute('aria-hidden', 'true');
      const total = listVisibleWords(l).length;
      const done = listMastered(l);
      const cnt = span('count', done > 0
        ? `${done}/${total} appris`
        : (total > 1 ? `${total} mots` : '1 mot'));
      btn.append(emoji, span('list-name', l.name), cnt);
      grid.appendChild(btn);
    });
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.list-btn');
    if (btn) toggleList(Number(btn.dataset.idx), btn);
  });

  function initSettings() {
    const stored = E.store.load('prefs', {});
    const prefs = stored && typeof stored === 'object' ? stored : {};
    mastery = E.store.load('mastery', {});
    if (!mastery || typeof mastery !== 'object' || Array.isArray(mastery)) mastery = {};
    difficulty = [3, 4, 6].includes(prefs.difficulty) ? prefs.difficulty : 4;
    speakAfter = prefs.speak !== false;
    sessionLength = (prefs.length === 'all' || D.lengthChoices.includes(prefs.length))
      ? prefs.length
      : (prefs.fullReview === true ? 'all' : D.defaultLength);   // migre l'ancien réglage
    levelFilter = ['primaire', 'avance', 'tout'].includes(prefs.level) ? prefs.level : 'primaire';
    smartMode = prefs.smart !== false;      // activé par défaut
    bothDirections = prefs.both === true;
    direction = ['mix', 'en2fr', 'fr2en'].includes(prefs.direction) ? prefs.direction : 'mix';
    soundOn = prefs.sound !== false;        // activé par défaut
    if (!soundOn) E.sound.enable(false);    // enable(true) créerait l'AudioContext avant tout geste

    function bindToggle(id, get, set) {
      const el = $(id);
      el.checked = get();
      el.addEventListener('change', () => { set(el.checked); savePrefs(); });
    }
    bindToggle('#smart-toggle', () => smartMode, v => { smartMode = v; });
    bindToggle('#both-toggle', () => bothDirections, v => { bothDirections = v; });
    bindToggle('#sound-toggle', () => soundOn, v => { soundOn = v; E.sound.enable(v); });

    const speakWrap = $('#speak-toggle-wrap');
    const speakToggle = $('#speak-toggle');
    if (!hasTTS) {
      speakWrap.hidden = true;
    } else {
      speakToggle.checked = speakAfter;
      speakToggle.addEventListener('change', () => {
        speakAfter = speakToggle.checked;
        if (!speakAfter) stopSpeak();
        savePrefs();
      });
    }

    $('#reset-progress').addEventListener('click', () => {
      const ok = window.confirm(
        'Effacer toute la progression ?\n'
        + '(mots appris, historique d’erreurs et série de jours)');
      if (!ok) return;
      ['mastery', 'errors', 'streak', 'daily'].forEach((k) => E.store.remove(k));
      window.location.reload();
    });

    if (LISTS.length === 0) {
      const panel = $('#settings-panel');
      panel.classList.add('no-lists');
      panel.innerHTML =
        '<div class="no-lists-msg">⚠️ Aucune liste de mots trouvée.<br>' +
        'Vérifie le fichier <code>words.js</code>.</div>';
      startBtn.disabled = true;
      return;
    }

    const savedNames = Array.isArray(prefs.lists) ? prefs.lists : null;
    if (savedNames) {
      LISTS.forEach((l, i) => { if (savedNames.includes(l.name)) selectedIds.add(i); });
    } else {
      selectedIds.add(0); // au tout premier lancement : seulement la 1re liste
    }
    if (selectedIds.size === 0) selectedIds.add(0);

    const levelPicker = $('#level-picker');
    if (!anyAdvanced()) {
      levelPicker.hidden = true;          // pas de liste avancée -> pas de sélecteur
      levelFilter = 'primaire';
    } else {
      const levelBtns = levelPicker.querySelectorAll('.level-btn');
      levelBtns.forEach(b => {
        setActive(b, b.dataset.level === levelFilter);
        b.addEventListener('click', () => {
          levelFilter = b.dataset.level;
          levelBtns.forEach(x => setActive(x, x.dataset.level === levelFilter));
          renderLists();
          savePrefs();
        });
      });
    }

    renderLists();

    const diffBtns = document.querySelectorAll('.difficulty-btn');
    diffBtns.forEach(b => {
      const n = Number(b.dataset.choices);
      setActive(b, n === difficulty);
      b.addEventListener('click', () => {
        difficulty = n;
        diffBtns.forEach(x => setActive(x, Number(x.dataset.choices) === difficulty));
        savePrefs();
      });
    });

    const lenOf = (b) => (b.dataset.length === 'all' ? 'all' : Number(b.dataset.length));
    const lenBtns = document.querySelectorAll('.length-btn');
    lenBtns.forEach(b => {
      setActive(b, lenOf(b) === sessionLength);
      b.addEventListener('click', () => {
        sessionLength = lenOf(b);
        lenBtns.forEach(x => setActive(x, lenOf(x) === sessionLength));
        savePrefs();
      });
    });

    // Sens des questions : au hasard, ou toujours dans le même sens. Avec un sens fixe,
    // « chaque mot dans les deux sens » n'a plus de sens : on masque cette option.
    const dirBtns = document.querySelectorAll('.direction-btn');
    const bothWrap = $('#both-toggle-wrap');
    const syncDirection = () => {
      dirBtns.forEach(x => setActive(x, x.dataset.direction === direction));
      if (bothWrap) bothWrap.hidden = direction !== 'mix';
    };
    dirBtns.forEach(b => b.addEventListener('click', () => {
      direction = b.dataset.direction;
      syncDirection();
      savePrefs();
    }));
    syncDirection();
  }

  function toggleList(i, btn) {
    if (selectedIds.has(i)) {
      if (visibleSelectedCount() <= 1) return;   // garde au moins 1 liste cochée
      selectedIds.delete(i);
      setActive(btn, false);
    } else {
      selectedIds.add(i);
      setActive(btn, true);
    }
    savePrefs();
  }

  $('#select-all-btn').addEventListener('click', () => {
    LISTS.forEach((l, i) => { if (isVisible(l)) selectedIds.add(i); });
    document.querySelectorAll('.list-btn').forEach(b => setActive(b, true));
    savePrefs();
  });

  $('#deselect-btn').addEventListener('click', () => {
    const vis = [];
    LISTS.forEach((l, i) => { if (isVisible(l)) vis.push(i); });
    const keep = vis.find(i => selectedIds.has(i));
    const keepId = (keep === undefined) ? vis[0] : keep;
    vis.forEach(i => { if (i !== keepId) selectedIds.delete(i); });
    if (keepId !== undefined) selectedIds.add(keepId);
    document.querySelectorAll('.list-btn').forEach(b =>
      setActive(b, Number(b.dataset.idx) === keepId));
    savePrefs();
  });

  /* --------------------------------------------------------------- Word pool */
  function selectedWords() {
    const out = [];
    selectedIds.forEach(i => {
      const l = LISTS[i];
      if (l) listVisibleWords(l).forEach(w => out.push({
        en: w.en, fr: w.fr, enAll: w.enAll, frAll: w.frAll, listName: l.name,
      }));
    });
    return out;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function randomDir() { return Math.random() < 0.5 ? 'en2fr' : 'fr2en'; }
  // Sens d'une question : fixe si l'option le demande, sinon au hasard.
  function pickDir() { return direction === 'mix' ? randomDir() : direction; }

  function buildQueue() {
    let items = [];
    selectedWords().forEach(w => {
      const base = { en: w.en, fr: w.fr, enAll: w.enAll, frAll: w.frAll, listName: w.listName };
      const dirs = direction === 'mix' && bothDirections ? ['en2fr', 'fr2en'] : [pickDir()];
      dirs.forEach(dir => items.push(Object.assign({ dir }, base)));
    });

    if (smartMode) {
      // Mélange pondéré (Efraimidis–Spirakis) : les mots pas encore acquis
      // remontent en tête, les mots appris passent rarement.
      items.forEach(it => {
        const wgt = wordWeight(errKey(it.listName, it.en));
        it._k = Math.pow(Math.random(), 1 / wgt);
      });
      items.sort((a, b) => b._k - a._k);
      items.forEach(it => { delete it._k; });
    } else {
      items = shuffle(items);
    }

    const cap = sessionLength === 'all' ? Infinity : sessionLength;
    if (items.length > cap) items = items.slice(0, cap);
    return items;
  }

  /* ---------------------------------------------------------- Screen routing */
  function show(id, opts) {
    stopSpeak();
    E.screens.show(id, opts);
  }

  function clearAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  // « Changer les listes » pendant une partie : on demande confirmation dès qu'une réponse
  // a été donnée, pour qu'un tap raté (le bouton « Question suivante » juste au-dessus)
  // ne fasse pas quitter la partie. Depuis le bilan, pas de confirmation.
  function quitGame() {
    if (scoreCorrect + scoreWrong > 0 && !window.confirm(
      'Quitter la partie en cours ?\n(ce que tu as répondu est enregistré)')) return;
    goHome();
  }

  function goHome() {
    clearAdvance();
    stopSpeak();
    commitSession();       // ce qui a été répondu compte quand même
    show('screen-settings');
  }

  /* --------------------------------------------------------------- Game flow */
  const feedbackEl = $('#feedback');
  const nextBtn = $('#next-btn');
  const cardEl = $('#question-card');
  const mascotEl = $('#mascot');
  const listenBtn = $('#listen-btn');

  function startGame(customItems) {
    let q;
    if (customItems) {
      q = shuffle(customItems.map(it => ({
        en: it.en, fr: it.fr, enAll: it.enAll, frAll: it.frAll, listName: it.listName, dir: pickDir(),
      })));
    } else {
      q = buildQueue();
    }
    if (q.length === 0) return;

    clearAdvance();
    queue = q;
    errorCounts = {};
    slowSet = new Set();
    opTimes = {};
    listStats = {};
    scoreCorrect = 0;
    scoreWrong = 0;
    totalOps = queue.length;
    mascotIdx = 0;
    committed = false;

    savePrefs();
    E.sound.resume();
    show('screen-game');
    updateScore();
    nextQuestion();
  }

  function nextQuestion() {
    clearAdvance();
    stopSpeak();
    if (queue.length === 0) { showResults(); return; }
    answered = false;
    currentItem = queue.shift();
    window.scrollTo(0, 0);   // chaque question repart en haut de l'écran

    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    nextBtn.classList.remove('visible');
    cardEl.classList.remove('shake');

    listenBtn.hidden = !hasTTS;
    listenBtn.textContent = '🔊 Écouter';

    const showEn = currentItem.dir === 'en2fr';
    const promptWord = showEn ? currentItem.en : currentItem.fr;
    const answerWord = showEn ? currentItem.fr : currentItem.en;
    const answerAll = showEn ? currentItem.frAll : currentItem.enAll;
    const targetLang = showEn ? 'fr' : 'en';

    $('#prompt-label').textContent = showEn ? 'Mot anglais' : 'Mot français';
    $('#question-text').textContent = promptWord;
    $('#prompt-hint').textContent = showEn
      ? 'Choisis la traduction en français'
      : 'Choisis le mot en anglais';

    renderChoices(answerWord, answerAll, targetLang);

    mascotEl.textContent = D.mascots[mascotIdx % D.mascots.length];
    mascotIdx++;

    questionStart = Date.now();
  }

  function renderChoices(correct, acceptedAll, targetLang) {
    const wanted = Math.max(2, difficulty);
    // every accepted translation of the answer is off-limits as a distractor,
    // so a synonym is never shown as a "wrong" option
    const accepted = new Set((acceptedAll || [correct]).map(norm));
    const seen = new Set(accepted);
    const allKey = targetLang === 'fr' ? 'frAll' : 'enAll';
    const sameList = [];   // distracteurs de la même liste (prioritaires)
    const otherList = [];  // distracteurs des autres listes cochées

    const consider = w => {
      const forms = w[allKey] || [w[targetLang]];
      if (forms.some(s => accepted.has(norm(s)))) return;
      const s = w[targetLang];
      const n = norm(s);
      if (seen.has(n)) return;
      seen.add(n);
      (w.listName === currentItem.listName ? sameList : otherList).push(s);
    };
    selectedWords().forEach(consider);
    // pas assez de distracteurs : compléter avec le reste du vocabulaire du même niveau
    if (sameList.length + otherList.length < wanted - 1) levelWords().forEach(consider);

    const need = wanted - 1;
    let candidates = shuffle(sameList).slice(0, need);
    if (candidates.length < need) {
      candidates = candidates.concat(shuffle(otherList).slice(0, need - candidates.length));
    }

    const options = shuffle([correct, ...candidates]);
    const wrap = $('#choices');
    wrap.innerHTML = '';

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';

      const key = span('choice-key', String(idx + 1));
      key.setAttribute('aria-hidden', 'true');

      btn.append(key, span('choice-text', opt));
      btn.addEventListener('click', () => chooseAnswer(btn, opt, correct, accepted));
      wrap.appendChild(btn);
    });
  }

  function chooseAnswer(btn, chosen, correct, accepted) {
    if (answered) return;
    answered = true;

    const isRight = accepted.has(norm(chosen));
    const elapsed = Date.now() - questionStart;
    const listName = currentItem.listName;
    const key = errKey(listName, currentItem.en);
    const pair = `${joinTr(currentItem.enAll)} = ${joinTr(currentItem.frAll)}`;

    if (!listStats[listName]) listStats[listName] = { asked: 0, correct: 0 };
    listStats[listName].asked++;

    bumpMastery(key, isRight);
    E.sound.feedback(isRight);

    document.querySelectorAll('#choices .choice-btn').forEach(b => {
      b.disabled = true;
      const t = b.querySelector('.choice-text').textContent;
      if (accepted.has(norm(t))) b.classList.add('correct');
      else b.classList.add('dim');
    });
    if (!isRight) { btn.classList.remove('dim'); btn.classList.add('wrong'); }

    const willSpeak = speakAfter && hasTTS;
    if (hasTTS) listenBtn.textContent = '🔊 Réécouter';

    if (isRight) {
      scoreCorrect++;
      listStats[listName].correct++;
      if (!(key in opTimes) || elapsed < opTimes[key]) opTimes[key] = elapsed;
      const slow = elapsed > D.slowMs;
      if (slow) slowSet.add(key); else slowSet.delete(key);
      feedbackEl.textContent = `✅ Bravo ! ${pair}${slow ? ' (un peu lent 🐢)' : ''}`;
      feedbackEl.className = 'feedback correct';
      mascotEl.textContent = '🎉';
      E.fx.burst(true);
      E.haptic('success');
      if (willSpeak) {
        // advance only once the pronunciation has actually finished (+ a short
        // pause), so the words are never cut off; 7 s hard cap as a safety net.
        let advanced = false;
        const go = () => {
          if (advanced) return;
          advanced = true;
          clearTimeout(safety);
          advanceTimer = null;
          nextQuestion();
        };
        const safety = setTimeout(go, 7000);
        advanceTimer = safety;
        speakCurrentPair(() => {
          if (advanced) return;
          clearTimeout(safety);
          advanceTimer = setTimeout(go, 450);
        });
      } else {
        advanceTimer = setTimeout(nextQuestion, 900);
      }
    } else {
      scoreWrong++;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
      feedbackEl.textContent = '❌ Presque… La bonne réponse était ';
      const strong = document.createElement('strong');
      strong.textContent = correct;
      feedbackEl.appendChild(strong);
      feedbackEl.appendChild(span('', `  (${pair})`));
      feedbackEl.className = 'feedback wrong';
      mascotEl.textContent = '😬';
      cardEl.classList.add('shake');
      E.haptic('error');
      setTimeout(() => cardEl.classList.remove('shake'), 400);
      if (willSpeak) speakCurrentPair();
      // La question ratée revient quelques questions plus loin.
      const pos = Math.floor(Math.random() * Math.min(D.requeueSpan, queue.length + 1)) + 1;
      queue.splice(pos, 0, currentItem);
    }

    updateScore();
    nextBtn.classList.add('visible');
  }

  function updateScore() {
    const remaining = Math.max(totalOps - scoreCorrect, 0);
    $('#score-correct').textContent = String(scoreCorrect);
    $('#score-wrong').textContent = String(scoreWrong);
    $('#score-remaining').textContent = String(remaining);
    $('#progress-text').textContent = `${scoreCorrect} / ${totalOps}`;
    $('#progress-fill').style.width = `${totalOps ? Math.round((scoreCorrect / totalOps) * 100) : 0}%`;
  }

  nextBtn.addEventListener('click', nextQuestion);
  // Ne pas renommer go-home-game / go-home-results / restart-btn : l'ancienne version de
  // l'appli (encore en cache chez certains) s'exécute parfois sur ce HTML pendant la mise à jour.
  $('#go-home-game').addEventListener('click', quitGame);
  startBtn.addEventListener('click', () => startGame());

  document.addEventListener('keydown', e => {
    if (E.screens.current() !== 'screen-game') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      // Avant la réponse, Entrée sur une proposition focalisée la valide (clic natif).
      if (!answered) return;
      // Un bouton hors du flux de jeu (« Écouter », « Changer les listes ») garde son
      // comportement. Pour les autres on prend la main et on annule le « clic » que
      // le navigateur enverrait en plus : sinon la question avance deux fois.
      const button = e.target.closest && e.target.closest('button');
      if (button && !button.closest('#choices, #next-btn')) return;
      e.preventDefault();
      nextQuestion();
      return;
    }
    if (!answered && /^[1-9]$/.test(e.key)) {
      const target = document.querySelectorAll('#choices .choice-btn')[Number(e.key) - 1];
      if (target) target.click();
    }
  });

  /* -------------------------------------------------------- Enregistrement */
  // Une partie est enregistrée une seule fois : à la fin, ou quand on la quitte
  // en cours de route (ce qui a été répondu compte quand même). Les mots appris
  // (mastery) sont, eux, enregistrés à chaque réponse.
  function commitSession() {
    if (committed) return;
    committed = true;
    const seen = scoreCorrect + scoreWrong;
    if (!seen) return;
    const hist = loadErrorHistory();
    Object.keys(errorCounts).forEach((k) => { hist[k] = (hist[k] || 0) + errorCounts[k]; });
    E.store.save('errors', hist);
    E.history.bumpStreak();
    E.history.logDaily(seen, scoreCorrect);
    E.history.renderStreak('#streak-badge');
  }


  /* ----------------------------------------------------------------- Results */
  function showResults() {
    const total = scoreCorrect + scoreWrong;
    const rate = total > 0 ? Math.round((scoreCorrect / total) * 100) : 100;
    const tier = D.tiers.find((t) => rate >= t.min) || D.tiers[D.tiers.length - 1];

    $('#res-correct').textContent = String(scoreCorrect);
    $('#res-wrong').textContent = String(scoreWrong);
    $('#res-rate').textContent = `${rate}%`;
    $('#result-emoji').textContent = tier.emoji;
    $('#result-title').textContent = tier.title;
    $('#result-subtitle').textContent = tier.sub.replace('{rate}', String(rate));

    commitSession();
    E.history.renderWeek({ bars: '#week-bars', block: '#history-week', summary: '#week-summary' });
    renderListSummary();
    renderErrorReport();
    $('#review-btn').disabled = Object.keys(errorCounts).length === 0 && slowSet.size === 0;

    show('screen-results');
    E.fx.burst(rate >= 80);
    E.announce(`Partie terminée. ${tier.title} ${scoreCorrect} bonnes réponses, ${scoreWrong} erreurs.`);
  }

  const barColor = (pct) => (pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)');

  function renderListSummary() {
    const wrap = $('#list-summary-list');
    const block = $('#list-summary');
    wrap.innerHTML = '';

    const names = Object.keys(listStats);
    block.hidden = names.length === 0;
    names.sort((a, b) => a.localeCompare(b, 'fr'));

    names.forEach(name => {
      const { asked, correct } = listStats[name];
      const pct = asked > 0 ? Math.round((correct / asked) * 100) : 100;

      const row = document.createElement('div');
      row.className = 'list-summary-row';
      const fill = span('tbar-fill', '');
      fill.style.width = `${pct}%`;
      fill.style.background = barColor(pct);
      const bar = span('tbar', '');
      bar.appendChild(fill);
      const pctEl = span('tpct', `${pct}%`);
      pctEl.style.color = barColor(pct);
      row.append(span('tname', (LIST_ICON[name] ? LIST_ICON[name] + ' ' : '') + name), bar, pctEl);
      wrap.appendChild(row);
    });
  }

  function fmtTime(ms) {
    return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
  }

  function renderErrorReport() {
    const listEl = $('#error-list');
    listEl.innerHTML = '';

    const keys = new Set([...Object.keys(errorCounts), ...slowSet]);
    if (keys.size === 0) {
      listEl.appendChild(span('no-errors', '🎉 Aucune erreur, bravo !'));
      return;
    }

    const history = loadErrorHistory();
    const entries = [...keys].sort((ka, kb) => {
      const diff = (errorCounts[kb] || 0) - (errorCounts[ka] || 0);
      return diff || (opTimes[kb] || 0) - (opTimes[ka] || 0);
    });

    entries.forEach(key => {
      const info = WORD_INDEX[key];
      const enText = info ? joinTr(info.enAll) : (key.split('::')[1] || key);
      const frText = info ? joinTr(info.frAll) : '?';
      const count = errorCounts[key] || 0;

      const row = document.createElement('div');
      row.className = 'error-row';

      const op = span('op', '');
      op.append(span('en', enText), span('sep', '→'), span('fr', frText));
      if (key in opTimes) op.append(span('time', `⏱ ${fmtTime(opTimes[key])}`));

      const meta = span('error-row-meta', '');
      if (history[key]) meta.append(span('history', `total : ${history[key]}`));
      const badge = span('count', count > 1 ? `${count} erreurs` : '1 erreur');
      if (count === 0) {
        badge.textContent = '🐢 hésitation';
        badge.classList.add('error-badge--hesitant');
      }
      meta.append(badge);

      row.append(op, meta);
      listEl.appendChild(row);
    });
  }

  $('#review-btn').addEventListener('click', () => {
    const keys = new Set([...Object.keys(errorCounts), ...slowSet]);
    const items = [];
    keys.forEach(key => {
      const info = WORD_INDEX[key];
      if (info) items.push({
        en: info.en, fr: info.fr, enAll: info.enAll, frAll: info.frAll, listName: info.listName,
      });
    });
    if (items.length === 0) return;
    startGame(items);
  });
  $('#print-btn').addEventListener('click', () => window.print());
  $('#restart-btn').addEventListener('click', () => startGame());
  $('#go-home-results').addEventListener('click', goHome);

  /* ---------------------------------------------------- Écouter (voix du navigateur) */
  const hasTTS = ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window);
  let ttsVoices = [];
  let ttsGen = 0;               // invalidates in-flight sequences on cancel / restart
  function loadVoices() {
    try { ttsVoices = window.speechSynthesis.getVoices() || []; } catch (e) { ttsVoices = []; }
  }
  if (hasTTS) {
    loadVoices();
    try { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) { /* ignore */ }
  }
  // Best available voice for a language, so e.g. an English word is never read
  // by a French voice (which mangles look-alike words such as "costume").
  function bestVoice(langBase) {
    const w = langBase === 'en' ? 'en' : 'fr';
    const pref = langBase === 'en' ? 'en-gb' : 'fr-fr';
    const L = ttsVoices;
    const lc = v => (v.lang || '').toLowerCase().replace('_', '-');
    return L.find(v => lc(v) === pref)
      || L.find(v => lc(v).indexOf(w + '-') === 0)
      || L.find(v => lc(v) === w)
      || L.find(v => lc(v).indexOf(w) === 0)
      || L.find(v => w === 'en' && /english|anglais/i.test(v.name || ''))
      || L.find(v => w === 'fr' && /fran[cç]ais|french/i.test(v.name || ''))
      || null;
  }
  // parts: [{ text, lang }] spoken one after the other, each with its own voice.
  // Chained on `onend` (not queued together) to stop one language's voice from
  // bleeding into the next utterance. `onDone` fires once the whole sequence has
  // finished (used to advance to the next question only after the words are read).
  function speakSequence(parts, onDone) {
    const done = typeof onDone === 'function' ? onDone : function () {};
    if (!hasTTS) { done(); return; }
    const items = (parts || []).filter(p => p && p.text);
    if (!items.length) { done(); return; }
    ttsGen += 1;
    const gen = ttsGen;
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    let i = 0;
    const step = () => {
      if (gen !== ttsGen) return;
      if (i >= items.length) { done(); return; }
      const p = items[i++];
      let u;
      try { u = new SpeechSynthesisUtterance(String(p.text)); } catch (e) { return; }
      const v = bestVoice(p.lang);
      if (v) u.voice = v;
      u.lang = v ? v.lang : (p.lang === 'en' ? 'en-GB' : 'fr-FR');
      u.rate = 0.9;
      let moved = false;
      const advance = () => {
        if (moved || gen !== ttsGen) return;
        moved = true;
        clearTimeout(guard);
        step();
      };
      const guard = setTimeout(advance, Math.max(1100, String(p.text).length * 120));
      u.onend = advance;
      u.onerror = advance;
      try { window.speechSynthesis.speak(u); } catch (e) { /* ignore */ }
    };
    step();
  }
  function speak(text, langBase) {
    speakSequence([{ text, lang: langBase }]);
  }
  // the shown word in its language, then the answer word in its language
  function speakCurrentPair(onDone) {
    if (!currentItem) { if (typeof onDone === 'function') onDone(); return; }
    const showEn = currentItem.dir === 'en2fr';
    speakSequence([
      { text: showEn ? currentItem.en : currentItem.fr, lang: showEn ? 'en' : 'fr' },
      { text: showEn ? currentItem.fr : currentItem.en, lang: showEn ? 'fr' : 'en' },
    ], onDone);
  }
  function stopSpeak() {
    ttsGen += 1;
    if (hasTTS) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  }

  listenBtn.addEventListener('click', () => {
    if (!currentItem) return;
    if (answered) {
      // symmetric: shown word in its language, then the answer in its language
      speakCurrentPair();
    } else {
      // before answering: only the shown word, so we don't give the answer away
      const showEn = currentItem.dir === 'en2fr';
      speak(showEn ? currentItem.en : currentItem.fr, showEn ? 'en' : 'fr');
    }
  });

  /* ---------------------------------------------------------------- Démarrage */
  initSettings();
  E.screens.show('screen-settings', { focus: false });
})();
