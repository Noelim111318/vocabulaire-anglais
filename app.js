(() => {
  const APP_VERSION = 'v1.0.1';
  const HISTORY_KEY = 'vocab_error_history_v1';
  const PREFS_KEY = 'vocab_prefs_v1';
  const MASTERY_KEY = 'vocab_mastery_v1';
  const STREAK_KEY = 'vocab_streak_v1';
  const DAILY_KEY = 'vocab_daily_v1';
  const MASTERED_STREAK = 3;     // bonnes réponses d'affilée = mot "appris"
  const SLOW_MS = 5000;
  // Nombre maxi de questions par partie. Si les listes cochées contiennent plus
  // de mots que ça, on en tire ce nombre au hasard (pour garder des parties
  // courtes). La case « Passer en revue tous les mots » sur l'écran d'accueil
  // ignore cette limite ; modifie aussi cette valeur si tu veux un autre défaut.
  const MAX_QUESTIONS = 25;
  const mascots = ['🦊', '🐸', '🦁', '🐼', '🦄', '🐯', '🐧', '🦋'];

  /* ---------------------------------------------------------------- Stars */
  const starsWrap = document.getElementById('stars');
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random() * 2.5 + 0.5;
    s.style.width = `${sz}px`;
    s.style.height = `${sz}px`;
    s.style.top = `${Math.random() * 100}%`;
    s.style.left = `${Math.random() * 100}%`;
    s.style.setProperty('--d', `${(Math.random() * 3 + 2).toFixed(1)}s`);
    s.style.setProperty('--delay', `${(Math.random() * 4).toFixed(1)}s`);
    s.style.setProperty('--op', `${(Math.random() * 0.6 + 0.2).toFixed(2)}`);
    starsWrap.appendChild(s);
  }

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
        words.push({ en, fr, enAll, frAll });
      });
      if (words.length >= 1) out.push({ name, icon, words });
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
    ALL_WORDS.push({ en: w.en, fr: w.fr, enAll: w.enAll, frAll: w.frAll, listName: l.name })));

  const WORD_INDEX = {};
  ALL_WORDS.forEach(w => { WORD_INDEX[errKey(w.listName, w.en)] = w; });

  const LIST_ICON = {};
  LISTS.forEach(l => { LIST_ICON[l.name] = l.icon; });

  function errKey(listName, en) { return listName + '::' + en; }
  function norm(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  /* ------------------------------------------------------------------ State */
  let selectedIds = new Set();
  let difficulty = 4;
  let queue = [];
  let wrongSet = new Set();
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
  let fullReview = false;
  let smartMode = true;
  let bothDirections = false;
  let soundOn = true;
  let mastery = {};
  let refreshInstall = function () {};

  /* -------------------------------------------------------------- Persistence */
  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return (v && typeof v === 'object') ? v : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }
  function loadHistory() { return loadJSON(HISTORY_KEY, {}); }
  function saveHistory(hist) { saveJSON(HISTORY_KEY, hist); }
  function persistSessionErrors() {
    const hist = loadHistory();
    for (const [key, count] of Object.entries(errorCounts)) {
      hist[key] = (hist[key] || 0) + count;
    }
    saveHistory(hist);
  }
  function loadPrefs() { return loadJSON(PREFS_KEY, {}); }
  function savePrefs() {
    try {
      const names = [];
      selectedIds.forEach(i => { if (LISTS[i]) names.push(LISTS[i].name); });
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        lists: names, difficulty,
        speak: speakAfter, fullReview,
        smart: smartMode, both: bothDirections, sound: soundOn,
      }));
    } catch (e) { /* ignore */ }
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
    saveJSON(MASTERY_KEY, mastery);
  }
  function wordWeight(key) {
    const m = mastery[key];
    if (!m || !m.seen) return 3.0;                 // jamais vu
    if (m.streak >= MASTERED_STREAK) return 0.35;  // appris
    if (m.streak === 2) return 1.0;
    if (m.streak === 1) return 1.8;
    return 3.5;                                     // vu mais pas encore acquis
  }
  function listMastered(list) {
    let n = 0;
    list.words.forEach(w => {
      const m = mastery[errKey(list.name, w.en)];
      if (m && m.streak >= MASTERED_STREAK) n += 1;
    });
    return n;
  }

  /* ---------------------------------------------- Série de jours + historique */
  function dayStr(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }
  function bumpStreak() {
    const today = dayStr(Date.now());
    const yest = dayStr(Date.now() - 864e5);
    const s = loadJSON(STREAK_KEY, { count: 0, lastDay: '' });
    if (s.lastDay === today) return;
    s.count = (s.lastDay === yest) ? (s.count + 1) : 1;
    s.lastDay = today;
    saveJSON(STREAK_KEY, s);
  }
  function renderStreak() {
    const el = document.getElementById('streak-badge');
    if (!el) return;
    const s = loadJSON(STREAK_KEY, { count: 0, lastDay: '' });
    const today = dayStr(Date.now());
    const yest = dayStr(Date.now() - 864e5);
    const alive = s.count > 0 && (s.lastDay === today || s.lastDay === yest);
    el.hidden = !alive;
    if (alive) el.textContent = `🔥 ${s.count} jour${s.count > 1 ? 's' : ''} d'affilée`;
  }
  function logDaily(seen, correct) {
    if (!seen) return;
    const log = loadJSON(DAILY_KEY, {});
    const k = dayStr(Date.now());
    const e = log[k] || { seen: 0, correct: 0 };
    e.seen += seen;
    e.correct += correct;
    log[k] = e;
    const cutoff = dayStr(Date.now() - 60 * 864e5);
    Object.keys(log).forEach(d => { if (d < cutoff) delete log[d]; });
    saveJSON(DAILY_KEY, log);
  }
  function renderWeek() {
    const wrap = document.getElementById('week-bars');
    const block = document.getElementById('history-week');
    const sum = document.getElementById('week-summary');
    if (!wrap || !block) return;
    const log = loadJSON(DAILY_KEY, {});
    const labels = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    wrap.innerHTML = '';
    let tSeen = 0, tCorrect = 0, days = 0;
    for (let i = 6; i >= 0; i--) {
      const ms = Date.now() - i * 864e5;
      const e = log[dayStr(ms)];
      const has = !!(e && e.seen);
      const pct = has ? Math.round((e.correct / e.seen) * 100) : 0;
      if (has) { tSeen += e.seen; tCorrect += e.correct; days += 1; }
      const col = document.createElement('div');
      col.className = 'week-col';
      const bar = document.createElement('div');
      bar.className = 'week-bar';
      bar.style.height = has ? `${Math.max(8, pct)}%` : '3px';
      if (has) bar.style.background = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
      bar.title = has ? `${e.correct}/${e.seen} — ${pct}%` : 'pas joué';
      const lab = document.createElement('span');
      lab.className = 'week-lab';
      lab.textContent = labels[new Date(ms).getDay()];
      col.append(bar, lab);
      wrap.appendChild(col);
    }
    if (tSeen === 0) { block.hidden = true; return; }
    block.hidden = false;
    const rate = Math.round((tCorrect / tSeen) * 100);
    sum.textContent = `${tSeen} mots sur ${days} jour${days > 1 ? 's' : ''} — ${rate}% de réussite`;
  }

  /* ----------------------------------------------------------- Petits sons */
  let audioCtx = null;
  function ensureAudio() {
    if (!soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function tone(freq, startAt, dur, type, peak) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + startAt;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function playFeedbackSound(ok) {
    if (!soundOn) return;
    ensureAudio();
    if (ok) { tone(660, 0, 0.12, 'sine', 0.22); tone(988, 0.1, 0.16, 'sine', 0.2); }
    else { tone(311, 0, 0.16, 'square', 0.12); tone(233, 0.12, 0.22, 'square', 0.12); }
  }

  /* --------------------------------------------------------- Settings screen */
  function initSettings() {
    const prefs = loadPrefs();
    mastery = loadJSON(MASTERY_KEY, {});
    difficulty = [3, 4, 6].includes(prefs.difficulty) ? prefs.difficulty : 4;
    speakAfter = prefs.speak !== false;
    fullReview = prefs.fullReview === true;
    smartMode = prefs.smart !== false;      // activé par défaut
    bothDirections = prefs.both === true;
    soundOn = prefs.sound !== false;        // activé par défaut

    function bindToggle(id, get, set) {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = get();
      el.addEventListener('change', () => { set(el.checked); savePrefs(); });
    }
    bindToggle('smart-toggle', () => smartMode, v => { smartMode = v; });
    bindToggle('full-review-toggle', () => fullReview, v => { fullReview = v; });
    bindToggle('both-toggle', () => bothDirections, v => { bothDirections = v; });
    bindToggle('sound-toggle', () => soundOn, v => { soundOn = v; if (v) ensureAudio(); });

    const speakWrap = document.getElementById('speak-toggle-wrap');
    const speakToggle = document.getElementById('speak-toggle');
    if (!hasTTS) {
      if (speakWrap) speakWrap.hidden = true;
    } else if (speakToggle) {
      speakToggle.checked = speakAfter;
      speakToggle.addEventListener('change', () => {
        speakAfter = speakToggle.checked;
        if (!speakAfter) stopSpeak();
        savePrefs();
      });
    }

    const resetBtn = document.getElementById('reset-progress');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const ok = window.confirm(
          'Effacer toute la progression ?\n'
          + '(mots appris, historique d’erreurs et série de jours)');
        if (!ok) return;
        [MASTERY_KEY, HISTORY_KEY, STREAK_KEY, DAILY_KEY].forEach(k => {
          try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
        });
        location.reload();
      });
    }

    const grid = document.getElementById('lists-grid');

    if (LISTS.length === 0) {
      const panel = document.getElementById('settings-panel');
      panel.classList.add('no-lists');
      panel.innerHTML =
        '<div class="no-lists-msg">⚠️ Aucune liste de mots trouvée.<br>' +
        'Vérifie le fichier <code>words.js</code>.</div>';
      document.getElementById('start-btn').disabled = true;
      return;
    }

    const savedNames = Array.isArray(prefs.lists) ? prefs.lists : null;
    if (savedNames) {
      LISTS.forEach((l, i) => { if (savedNames.includes(l.name)) selectedIds.add(i); });
    } else {
      selectedIds.add(0); // au tout premier lancement : seulement la 1re liste
    }
    if (selectedIds.size === 0) selectedIds.add(0);

    LISTS.forEach((l, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-btn' + (selectedIds.has(i) ? ' active' : '');
      btn.dataset.idx = String(i);
      const emoji = document.createElement('span');
      emoji.className = 'list-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = l.icon;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'list-name';
      nameSpan.textContent = l.name;
      const cnt = document.createElement('span');
      cnt.className = 'count';
      const done = listMastered(l);
      cnt.textContent = done > 0
        ? `${done}/${l.words.length} appris`
        : (l.words.length > 1 ? `${l.words.length} mots` : '1 mot');
      btn.append(emoji, nameSpan, cnt);
      btn.addEventListener('click', () => toggleList(i, btn));
      grid.appendChild(btn);
    });

    document.querySelectorAll('.difficulty-btn').forEach(b => {
      const n = Number(b.dataset.choices);
      b.classList.toggle('active', n === difficulty);
      b.addEventListener('click', () => {
        difficulty = n;
        document.querySelectorAll('.difficulty-btn').forEach(x =>
          x.classList.toggle('active', Number(x.dataset.choices) === difficulty));
        savePrefs();
        setTimeout(() => b.blur(), 0);
      });
    });
  }

  function toggleList(i, btn) {
    if (selectedIds.has(i)) {
      if (selectedIds.size === 1) return;
      selectedIds.delete(i);
      btn.classList.remove('active');
    } else {
      selectedIds.add(i);
      btn.classList.add('active');
    }
    setTimeout(() => btn.blur(), 0);
    savePrefs();
  }

  function selectAll() {
    LISTS.forEach((l, i) => selectedIds.add(i));
    document.querySelectorAll('.list-btn').forEach(b => b.classList.add('active'));
    savePrefs();
  }

  function deselectAll() {
    const keep = selectedIds.size ? Math.min(...selectedIds) : 0;
    selectedIds = new Set([keep]);
    document.querySelectorAll('.list-btn').forEach(b =>
      b.classList.toggle('active', Number(b.dataset.idx) === keep));
    savePrefs();
  }

  /* --------------------------------------------------------------- Word pool */
  function selectedWords() {
    const out = [];
    selectedIds.forEach(i => {
      const l = LISTS[i];
      if (l) l.words.forEach(w => out.push({
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

  function buildQueue() {
    let items = [];
    selectedWords().forEach(w => {
      const base = { en: w.en, fr: w.fr, enAll: w.enAll, frAll: w.frAll, listName: w.listName };
      const dirs = bothDirections ? ['en2fr', 'fr2en'] : [randomDir()];
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

    if (!fullReview && items.length > MAX_QUESTIONS) items = items.slice(0, MAX_QUESTIONS);
    return items;
  }

  /* ---------------------------------------------------------- Screen routing */
  function showScreen(id) {
    stopSpeak();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.body.classList.toggle('results-active', id === 'screen-results');
    document.body.classList.toggle('settings-active', id === 'screen-settings');
    document.body.classList.toggle('game-active', id === 'screen-game');
    window.scrollTo(0, 0);
    refreshInstall();
  }

  function goHome() { showScreen('screen-settings'); }
  function restartGame() { startGame(); }

  /* --------------------------------------------------------------- Game flow */
  function startGame(customItems) {
    let q;
    if (customItems) {
      q = shuffle(customItems.map(it => ({
        en: it.en, fr: it.fr, enAll: it.enAll, frAll: it.frAll, listName: it.listName, dir: randomDir(),
      })));
    } else {
      if (selectedIds.size === 0) return;
      q = buildQueue();
    }
    if (q.length === 0) return;

    queue = q;
    wrongSet = new Set();
    errorCounts = {};
    slowSet = new Set();
    opTimes = {};
    listStats = {};
    scoreCorrect = 0;
    scoreWrong = 0;
    totalOps = queue.length;
    mascotIdx = 0;

    savePrefs();
    bumpStreak();
    renderStreak();
    ensureAudio();
    updateScoreDisplay();
    showScreen('screen-game');
    nextQuestion();
  }

  function nextQuestion() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    stopSpeak();
    if (queue.length === 0) { showResults(); return; }
    answered = false;
    currentItem = queue.shift();
    window.scrollTo(0, 0);   // chaque question repart en haut de l'écran

    const feedback = document.getElementById('feedback');
    feedback.textContent = '';
    feedback.className = 'feedback';
    document.getElementById('next-btn').classList.remove('visible');
    document.getElementById('question-card').classList.remove('shake');

    const listenBtn = document.getElementById('listen-btn');
    if (listenBtn) {
      listenBtn.hidden = !hasTTS;
      listenBtn.textContent = '🔊 Écouter';
    }

    const showEn = currentItem.dir === 'en2fr';
    const promptWord = showEn ? currentItem.en : currentItem.fr;
    const answerWord = showEn ? currentItem.fr : currentItem.en;
    const answerAll = showEn ? currentItem.frAll : currentItem.enAll;
    const targetLang = showEn ? 'fr' : 'en';

    document.getElementById('prompt-label').textContent = showEn ? 'Mot anglais' : 'Mot français';
    document.getElementById('question-text').textContent = promptWord;
    document.getElementById('prompt-hint').textContent = showEn
      ? 'Choisis la traduction en français'
      : 'Choisis le mot en anglais';

    renderChoices(answerWord, answerAll, targetLang);

    document.getElementById('mascot').textContent = mascots[mascotIdx % mascots.length];
    mascotIdx++;

    questionStart = Date.now();
    updateProgress();
  }

  function renderChoices(correct, acceptedAll, targetLang) {
    const wanted = Math.max(2, difficulty);
    // every accepted translation of the answer is off-limits as a distractor,
    // so a synonym is never shown as a "wrong" option
    const accepted = new Set((acceptedAll || [correct]).map(norm));
    const seen = new Set(accepted);
    const allKey = targetLang === 'fr' ? 'frAll' : 'enAll';
    let candidates = [];

    const consider = w => {
      const forms = w[allKey] || [w[targetLang]];
      if (forms.some(s => accepted.has(norm(s)))) return;
      const s = w[targetLang];
      const n = norm(s);
      if (!seen.has(n)) { seen.add(n); candidates.push(s); }
    };
    selectedWords().forEach(consider);
    if (candidates.length < wanted - 1) ALL_WORDS.forEach(consider);
    candidates = shuffle(candidates).slice(0, wanted - 1);

    const options = shuffle([correct, ...candidates]);
    const wrap = document.getElementById('choices');
    wrap.innerHTML = '';

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';

      const key = document.createElement('span');
      key.className = 'choice-key';
      key.setAttribute('aria-hidden', 'true');
      key.textContent = String(idx + 1);

      const txt = document.createElement('span');
      txt.className = 'choice-text';
      txt.textContent = opt;

      btn.append(key, txt);
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
    playFeedbackSound(isRight);

    document.querySelectorAll('#choices .choice-btn').forEach(b => {
      b.disabled = true;
      const t = b.querySelector('.choice-text').textContent;
      if (accepted.has(norm(t))) b.classList.add('correct');
      else b.classList.add('dim');
    });
    if (!isRight) { btn.classList.remove('dim'); btn.classList.add('wrong'); }

    const willSpeak = speakAfter && hasTTS;
    const listenBtn = document.getElementById('listen-btn');
    if (listenBtn && hasTTS) listenBtn.textContent = '🔊 Réécouter';

    const feedback = document.getElementById('feedback');

    if (isRight) {
      scoreCorrect++;
      wrongSet.delete(key);
      listStats[listName].correct++;
      if (!(key in opTimes) || elapsed < opTimes[key]) opTimes[key] = elapsed;
      if (elapsed > SLOW_MS) slowSet.add(key); else slowSet.delete(key);
      const slowNote = elapsed > SLOW_MS ? ' (un peu lent 🐢)' : '';
      feedback.textContent = `✅ Bravo ! ${pair}${slowNote}`;
      feedback.className = 'feedback correct';
      document.getElementById('mascot').textContent = '🎉';
      triggerBurst(true);
      triggerHaptic('success');
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
        advanceTimer = setTimeout(() => { advanceTimer = null; nextQuestion(); }, 900);
      }
    } else {
      scoreWrong++;
      wrongSet.add(key);
      errorCounts[key] = (errorCounts[key] || 0) + 1;
      feedback.textContent = '❌ Presque… La bonne réponse était ';
      const strong = document.createElement('strong');
      strong.textContent = correct;
      feedback.appendChild(strong);
      const tail = document.createElement('span');
      tail.textContent = `  (${pair})`;
      feedback.appendChild(tail);
      feedback.className = 'feedback wrong';
      document.getElementById('mascot').textContent = '😬';
      const card = document.getElementById('question-card');
      card.classList.add('shake');
      triggerHaptic('error');
      setTimeout(() => card.classList.remove('shake'), 260);
      if (willSpeak) speakCurrentPair();
      const pos = Math.floor(Math.random() * Math.min(4, queue.length + 1)) + 1;
      queue.splice(pos, 0, currentItem);
    }

    updateScoreDisplay();
    document.getElementById('next-btn').classList.add('visible');
  }

  function updateProgress() {
    const done = totalOps + wrongSet.size - queue.length;
    const total = totalOps + wrongSet.size;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const remaining = Math.max(total - done, 0);
    document.getElementById('progress-text').textContent = `${done} / ${total} • ${remaining} restantes`;
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('score-remaining').textContent = String(queue.length);
  }

  function updateScoreDisplay() {
    document.getElementById('score-correct').textContent = String(scoreCorrect);
    document.getElementById('score-wrong').textContent = String(scoreWrong);
    document.getElementById('score-remaining').textContent = String(queue.length);
    updateProgress();
  }

  /* ----------------------------------------------------------------- Results */
  function showResults() {
    const total = scoreCorrect + scoreWrong;
    const rate = total > 0 ? Math.round((scoreCorrect / total) * 100) : 100;
    document.getElementById('res-correct').textContent = String(scoreCorrect);
    document.getElementById('res-wrong').textContent = String(scoreWrong);
    document.getElementById('res-rate').textContent = `${rate}%`;

    let emoji, title, sub;
    if (rate === 100) { emoji = '🏆'; title = 'Parfait !'; sub = 'Tout juste du premier coup, champion !'; }
    else if (rate >= 80) { emoji = '⭐'; title = 'Excellent !'; sub = `${rate}% de bonnes réponses, c'est super !`; }
    else if (rate >= 60) { emoji = '👍'; title = 'Bien joué !'; sub = `${rate}% de bonnes réponses, continue comme ça !`; }
    else { emoji = '💪'; title = 'Courage !'; sub = `${rate}% — encore un peu d'entraînement et ça rentrera !`; }

    document.getElementById('result-emoji').textContent = emoji;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-subtitle').textContent = sub;

    persistSessionErrors();
    logDaily(total, scoreCorrect);
    renderWeek();
    renderListSummary();
    renderErrorReport();

    const hasMisses = Object.keys(errorCounts).length > 0 || slowSet.size > 0;
    document.getElementById('review-btn').disabled = !hasMisses;

    showScreen('screen-results');
    triggerBurst(rate >= 80);
  }

  function renderListSummary() {
    const wrap = document.getElementById('list-summary-list');
    const block = document.getElementById('list-summary');
    wrap.innerHTML = '';

    const names = Object.keys(listStats);
    if (names.length === 0) { block.style.display = 'none'; return; }
    block.style.display = '';
    names.sort((a, b) => a.localeCompare(b, 'fr'));

    names.forEach(name => {
      const { asked, correct } = listStats[name];
      const pct = asked > 0 ? Math.round((correct / asked) * 100) : 100;
      const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';

      const row = document.createElement('div');
      row.className = 'list-summary-row';

      const tName = document.createElement('span');
      tName.className = 'tname';
      tName.textContent = (LIST_ICON[name] ? LIST_ICON[name] + ' ' : '') + name;

      const tBar = document.createElement('span');
      tBar.className = 'tbar';
      const fill = document.createElement('span');
      fill.className = 'tbar-fill';
      fill.style.width = `${pct}%`;
      fill.style.background = color;
      tBar.appendChild(fill);

      const tPct = document.createElement('span');
      tPct.className = 'tpct';
      tPct.textContent = `${pct}%`;
      tPct.style.color = color;

      row.append(tName, tBar, tPct);
      wrap.appendChild(row);
    });
  }

  function fmtTime(ms) {
    return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
  }

  function renderErrorReport() {
    const listEl = document.getElementById('error-list');
    listEl.innerHTML = '';

    const history = loadHistory();
    const keys = new Set([...Object.keys(errorCounts), ...slowSet]);

    if (keys.size === 0) {
      listEl.innerHTML = '<div class="no-errors">🎉 Aucune erreur, bravo !</div>';
      return;
    }

    const entries = [...keys].sort((ka, kb) => {
      const ea = errorCounts[ka] || 0, eb = errorCounts[kb] || 0;
      if (eb !== ea) return eb - ea;
      return (opTimes[kb] || 0) - (opTimes[ka] || 0);
    });

    entries.forEach(key => {
      const info = WORD_INDEX[key];
      const enText = info ? joinTr(info.enAll) : (key.split('::')[1] || key);
      const frText = info ? joinTr(info.frAll) : '?';
      const count = errorCounts[key] || 0;

      const row = document.createElement('div');
      row.className = 'error-row';

      const op = document.createElement('span');
      op.className = 'op';
      const enS = document.createElement('span');
      enS.className = 'en';
      enS.textContent = enText;
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '→';
      const frS = document.createElement('span');
      frS.className = 'fr';
      frS.textContent = frText;
      op.append(enS, sep, frS);

      if (key in opTimes) {
        const t = document.createElement('span');
        t.className = 'time';
        t.textContent = `⏱ ${fmtTime(opTimes[key])}`;
        op.appendChild(t);
      }

      const meta = document.createElement('span');
      meta.className = 'error-row-meta';

      if (history[key]) {
        const h = document.createElement('span');
        h.className = 'history';
        h.textContent = `total : ${history[key]}`;
        meta.appendChild(h);
      }

      const badge = document.createElement('span');
      badge.className = 'count';
      if (count > 0) {
        badge.textContent = count > 1 ? `${count} erreurs` : '1 erreur';
      } else {
        badge.textContent = '🐢 hésitation';
        badge.classList.add('error-badge--hesitant');
      }
      meta.appendChild(badge);

      row.append(op, meta);
      listEl.appendChild(row);
    });
  }

  function reviewErrors() {
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
  }

  /* ------------------------------------------------------------- Effects */
  function triggerHaptic(type = 'tap') {
    if (!('vibrate' in navigator)) return;
    if (type === 'success') navigator.vibrate([20, 35, 25]);
    else if (type === 'error') navigator.vibrate([30, 25, 60]);
    else navigator.vibrate(10);
  }

  function triggerBurst(positive) {
    const wrap = document.getElementById('burst');
    wrap.innerHTML = '';
    const colors = positive
      ? ['#FFD60A', '#4ADE80', '#60A5FA', '#F472B6', '#FBBF24']
      : ['#FF6B6B', '#F87171', '#FCA5A5'];
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const n = positive ? 28 : 12;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'burst-particle';
      const angle = (i / n) * 360;
      const dist = positive ? (80 + Math.random() * 160) : (40 + Math.random() * 80);
      const rad = angle * Math.PI / 180;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.background = colors[i % colors.length];
      p.style.width = `${positive ? 10 : 7}px`;
      p.style.height = `${positive ? 10 : 7}px`;
      p.style.setProperty('--dx', `${Math.cos(rad) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(rad) * dist}px`);
      p.style.animationDuration = positive ? '0.9s' : '0.6s';
      wrap.appendChild(p);
    }
    setTimeout(() => { wrap.innerHTML = ''; }, 1000);
  }

  function updateViewportScale() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const scale = Math.min(1, Math.max(0.75, vh / 820));
    document.documentElement.style.setProperty('--app-scale', scale.toFixed(3));
  }

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

  /* ------------------------------------------------------------- Keyboard */
  document.addEventListener('keydown', e => {
    if (!document.getElementById('screen-game').classList.contains('active')) return;
    if (e.key === 'Enter') {
      if (answered) nextQuestion();
      return;
    }
    if (!answered && /^[1-9]$/.test(e.key)) {
      const btns = document.querySelectorAll('#choices .choice-btn');
      const target = btns[Number(e.key) - 1];
      if (target) target.click();
    }
  });

  /* --------------------------------------------------------------- Wire up */
  document.getElementById('app-version').textContent = APP_VERSION;
  document.getElementById('select-all-btn').addEventListener('click', selectAll);
  document.getElementById('deselect-btn').addEventListener('click', deselectAll);
  document.getElementById('start-btn').addEventListener('click', () => startGame());
  document.getElementById('go-home-game').addEventListener('click', goHome);
  document.getElementById('go-home-results').addEventListener('click', goHome);
  document.getElementById('restart-btn').addEventListener('click', restartGame);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('review-btn').addEventListener('click', reviewErrors);

  const printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const listenBtn = document.getElementById('listen-btn');
  if (listenBtn) {
    if (!hasTTS) listenBtn.hidden = true;
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
  }

  /* ----------------------------------- Bandeau "Installer l'appli" (en haut) */
  (function setupInstall() {
    const row = document.getElementById('install-row');
    const btn = document.getElementById('install-btn');
    const dismiss = document.getElementById('install-dismiss');
    const hint = document.getElementById('install-hint');
    if (!row || !btn) return;

    const HIDE_KEY = 'vocab_install_hidden';
    let deferred = null;
    let mode = null;               // null | 'prompt' | 'ios'
    let hiddenByUser = false;
    try { hiddenByUser = localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { /* ignore */ }

    function isStandalone() {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true
        || document.referrer.indexOf('android-app://') === 0;
    }
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const iOSSafari = iOS && /safari/i.test(navigator.userAgent)
      && !/crios|fxios|edgios|opios|android/i.test(navigator.userAgent);

    // shown only on the home screen, and only when actually installable
    refreshInstall = function () {
      const onHome = document.getElementById('screen-settings').classList.contains('active');
      const show = !!mode && !hiddenByUser && !isStandalone() && onHome;
      row.hidden = !show;
      if (!show) hint.hidden = true;
      if (show) row.dataset.mode = mode;
    };
    function forget() {
      hiddenByUser = true;
      try { localStorage.setItem(HIDE_KEY, '1'); } catch (e) { /* ignore */ }
      refreshInstall();
    }

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferred = e;
      mode = 'prompt';
      refreshInstall();
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      mode = null;
      forget();
    });

    btn.addEventListener('click', async () => {
      if (mode === 'ios') {
        hint.hidden = !hint.hidden;
        hint.textContent = "Sur iPhone/iPad : touche « Partager » (le carré avec une flèche vers le haut), "
          + "puis « Sur l'écran d'accueil ».";
        return;
      }
      if (!deferred) return;
      btn.disabled = true;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* ignore */ }
      deferred = null;
      mode = null;
      btn.disabled = false;
      refreshInstall();
    });
    if (dismiss) dismiss.addEventListener('click', forget);

    // iOS Safari never fires beforeinstallprompt: offer the manual path.
    if (iOSSafari) mode = 'ios';
    refreshInstall();
  })();

  initSettings();
  renderStreak();
  showScreen('screen-settings');
  updateViewportScale();
  window.addEventListener('resize', updateViewportScale);

  /* --------------------------------------------------------- Service worker */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reloadKey = `sw-reload:${APP_VERSION}`;
        const registration = await navigator.serviceWorker.register(`service-worker.js?v=${APP_VERSION}`);
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              if (!sessionStorage.getItem(reloadKey)) {
                sessionStorage.setItem(reloadKey, '1');
                window.location.reload();
              }
            }
          });
        });
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    });
  }
})();
