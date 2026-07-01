'use strict';
/* =============================================================================
   NUMPAD MASTERY — APPLICATION LOGIC
   A typing tutor focused entirely on the number row (1234567890) and its
   shifted symbols (!@#$%^&*()). Pure HTML/CSS/JS, no backend, no libraries.

   TABLE OF CONTENTS
     1.  Constants & key maps
     2.  Random / content-generation helpers
     3.  Lesson content generators (one per drill "mode")
     4.  Lesson definitions (30 lessons across 4 levels)
     5.  Achievement definitions
     6.  Persistent state (localStorage load/save)
     7.  Small utility helpers
     8.  Keycap component builder + heatmap renderer (shared signature UI)
     9.  View switching / navigation
     10. Dashboard rendering
     11. Lessons view rendering
     12. Statistics view rendering
     13. Achievements view rendering
     14. Typing engine (the core practice loop)
     15. Results modal
     16. Smart Error Training (weak-key detection + custom drills)
     17. Toast notifications
     18. Event wiring & init
   ============================================================================= */


/* -----------------------------------------------------------------------------
   1. CONSTANTS & KEY MAPS
   ----------------------------------------------------------------------------- */
const DIGIT_KEYS  = ['1','2','3','4','5','6','7','8','9','0'];
const SYMBOL_KEYS = ['!','@','#','$','%','^','&','*','(',')'];
const ALL_TARGET_KEYS = [...DIGIT_KEYS, ...SYMBOL_KEYS];

// Map between a digit and the symbol that sits above it on a US keyboard.
const DIGIT_TO_SYMBOL = {'1':'!','2':'@','3':'#','4':'$','5':'%','6':'^','7':'&','8':'*','9':'(','0':')'};
const SYMBOL_TO_DIGIT = Object.fromEntries(Object.entries(DIGIT_TO_SYMBOL).map(([d, s]) => [s, d]));

const STORAGE_KEY = 'numpadMasteryData_v1';

const LEVELS = [
  { id: 'basic',   name: 'Basic',   range: [1, 8],   color: 'var(--success)', desc: 'Master the number row one key at a time with repetition drills and simple patterns.' },
  { id: 'advance', name: 'Advance', range: [9, 16],  color: 'var(--accent)',  desc: 'Build speed and accuracy with longer, randomized number sequences.' },
  { id: 'pro',     name: 'Pro',     range: [17, 24], color: 'var(--violet)', desc: 'Bring in the shifted symbols — !@#$%^&*() — mixed with numbers under time pressure.' },
  { id: 'legend',  name: 'Legend',  range: [25, 30], color: 'var(--danger)', desc: 'High-speed, real-world-style drills that test total mastery of every key.' }
];


/* -----------------------------------------------------------------------------
   2. RANDOM / CONTENT-GENERATION HELPERS
   ----------------------------------------------------------------------------- */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function genGroup(keys, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += pick(keys);
  return s;
}


/* -----------------------------------------------------------------------------
   3. LESSON CONTENT GENERATORS
   Each generator returns a space-separated practice string built only from
   the target character set. Text regenerates fresh every time a lesson is
   started or restarted, so no two attempts are ever identical.
   ----------------------------------------------------------------------------- */

// Repeats each key in `keys` as a short token, `repeatsPerKey` times, then shuffles.
function genSingleKeyDrill(keys, repeatsPerKey, groupSize) {
  const tokens = [];
  keys.forEach(k => {
    for (let i = 0; i < repeatsPerKey; i++) tokens.push(k.repeat(groupSize));
  });
  return shuffle(tokens).join(' ');
}

// The full key sequence (e.g. 1234567890) typed end-to-end, repeated.
function genSequenceFixed(keys, repeats) {
  const seq = keys.join('');
  return new Array(repeats).fill(seq).join(' ');
}

// Doubled-digit tokens: 11, 77, 33...
function genPairsDrill(keys, count) {
  const tokens = [];
  for (let i = 0; i < count; i++) { const k = pick(keys); tokens.push(k + k); }
  return tokens.join(' ');
}

// Short ascending runs alternated with their descending mirror: 123, 321, 456, 654...
function genAscDescDrill(count, span = 3) {
  const tokens = [];
  for (let i = 0; i < count; i++) {
    const start = randInt(0, 9 - span);
    let asc = '';
    for (let j = 0; j < span; j++) asc += String((start + j) % 10);
    const desc = [...asc].reverse().join('');
    tokens.push(i % 2 === 0 ? asc : desc);
  }
  return tokens.join(' ');
}

// Fully random groups drawn from `keys`, length varies between minLen/maxLen.
function genRandomGroups(keys, count, minLen, maxLen) {
  const tokens = [];
  for (let i = 0; i < count; i++) tokens.push(genGroup(keys, randInt(minLen, maxLen)));
  return tokens.join(' ');
}

// Digit groups with varying lengths, mimicking phone/date-style number chunks.
function genGroupedPattern(count, lens) {
  const tokens = [];
  for (let i = 0; i < count; i++) tokens.push(genGroup(DIGIT_KEYS, pick(lens)));
  return tokens.join(' ');
}

// A handful of long, unbroken digit blocks — pure accuracy pressure.
function genBlock(blockCount, blockLen) {
  const tokens = [];
  for (let i = 0; i < blockCount; i++) tokens.push(genGroup(DIGIT_KEYS, blockLen));
  return tokens.join(' ');
}

// Introduces digit/symbol pairs: the digit alone, the symbol alone, then combined.
function genSymbolIntroDrill(pairs, repeats) {
  const tokens = [];
  pairs.forEach(([d, s]) => {
    for (let i = 0; i < repeats; i++) {
      tokens.push(d);
      tokens.push(s);
      tokens.push(d + s);
    }
  });
  return shuffle(tokens).join(' ');
}

function genRandomSymbols(count, minLen, maxLen) {
  return genRandomGroups(SYMBOL_KEYS, count, minLen, maxLen);
}

function genMixedDrill(count, minLen, maxLen, pool = ALL_TARGET_KEYS) {
  return genRandomGroups(pool, count, minLen, maxLen);
}

// "Real world" style tokens — prices, percentages, codes — built only from
// digits + the allowed symbol set, the way they'd actually appear in use.
function genRealWorldDrill(count) {
  const templates = [
    () => '$' + genGroup(DIGIT_KEYS, randInt(2, 3)),
    () => genGroup(DIGIT_KEYS, randInt(2, 3)) + '%',
    () => '(' + genGroup(DIGIT_KEYS, randInt(2, 4)) + ')',
    () => genGroup(DIGIT_KEYS, 1) + '^' + genGroup(DIGIT_KEYS, 1),
    () => '#' + genGroup(DIGIT_KEYS, randInt(3, 5)),
    () => genGroup(DIGIT_KEYS, randInt(2, 4)) + '@' + genGroup(DIGIT_KEYS, 2),
    () => '*' + genGroup(DIGIT_KEYS, randInt(1, 3)) + '*',
    () => genGroup(DIGIT_KEYS, 3) + '&' + genGroup(DIGIT_KEYS, 3)
  ];
  const tokens = [];
  for (let i = 0; i < count; i++) tokens.push(pick(templates)());
  return tokens.join(' ');
}

// Blends randomized mixed tokens with real-world tokens for the toughest drills.
function genMasteryDrill(count) {
  const tokens = [];
  for (let i = 0; i < count; i++) {
    tokens.push(Math.random() < 0.45 ? genRealWorldDrill(1) : genGroup(ALL_TARGET_KEYS, randInt(2, 5)));
  }
  return tokens.join(' ');
}


/* -----------------------------------------------------------------------------
   4. LESSON DEFINITIONS
   30 lessons, gradually increasing in difficulty, never repeating a drill type
   back-to-back. targetWPM / targetAccuracy drive the star rating for that
   lesson (see calcStars).
   ----------------------------------------------------------------------------- */
const LESSONS = [
  // ---- BASIC (numbers only) ----
  { id: 1,  level: 'basic', title: 'Warm-Up: 1 2 3',      desc: 'Get comfortable reaching 1, 2 and 3.',                 targetWPM: 10, targetAccuracy: 88, generate: () => genSingleKeyDrill(['1','2','3'], 5, 3) },
  { id: 2,  level: 'basic', title: 'Warm-Up: 4 5 6',      desc: 'Now drill the middle of the number row.',              targetWPM: 11, targetAccuracy: 88, generate: () => genSingleKeyDrill(['4','5','6'], 5, 3) },
  { id: 3,  level: 'basic', title: 'Warm-Up: 7 8 9 0',    desc: 'Finish the row with 7, 8, 9 and 0.',                   targetWPM: 12, targetAccuracy: 88, generate: () => genSingleKeyDrill(['7','8','9','0'], 4, 3) },
  { id: 4,  level: 'basic', title: 'Full Row Sweep',      desc: 'Type the entire number row in order, left to right.', targetWPM: 14, targetAccuracy: 90, generate: () => genSequenceFixed(DIGIT_KEYS, 8) },
  { id: 5,  level: 'basic', title: 'Double Digits',       desc: 'Practice doubled digits like 11 and 77.',              targetWPM: 16, targetAccuracy: 90, generate: () => genPairsDrill(DIGIT_KEYS, 16) },
  { id: 6,  level: 'basic', title: 'Climb & Descend',     desc: 'Type short runs that climb up and back down.',        targetWPM: 18, targetAccuracy: 90, generate: () => genAscDescDrill(14, 3) },
  { id: 7,  level: 'basic', title: 'Simple Combos',       desc: 'Short, light random groups to build flow.',           targetWPM: 20, targetAccuracy: 91, generate: () => genRandomGroups(DIGIT_KEYS, 18, 2, 3) },
  { id: 8,  level: 'basic', title: 'Basic Speed Test',    desc: 'Put it all together and aim for a new personal best.',targetWPM: 24, targetAccuracy: 91, generate: () => genRandomGroups(DIGIT_KEYS, 20, 3, 4) },

  // ---- ADVANCE (mixed numbers, longer + randomized, accuracy-focused) ----
  { id: 9,  level: 'advance', title: 'Mixed Sequences',     desc: 'Random digits in slightly longer groups.',                    targetWPM: 22, targetAccuracy: 92, generate: () => genRandomGroups(DIGIT_KEYS, 18, 3, 4) },
  { id: 10, level: 'advance', title: 'Long Number Strings',  desc: 'Stretch your accuracy across 5-7 digit strings.',             targetWPM: 23, targetAccuracy: 92, generate: () => genRandomGroups(DIGIT_KEYS, 16, 5, 7) },
  { id: 11, level: 'advance', title: 'Random Drill I',       desc: 'Fully randomized digits — no patterns to lean on.',           targetWPM: 24, targetAccuracy: 92, generate: () => genRandomGroups(DIGIT_KEYS, 22, 3, 5) },
  { id: 12, level: 'advance', title: 'Code Groups',          desc: 'Practice number groups the way they appear in real codes.',  targetWPM: 25, targetAccuracy: 93, generate: () => genGroupedPattern(16, [3, 3, 4]) },
  { id: 13, level: 'advance', title: 'Date Patterns',        desc: 'Type date-style number groupings.',                          targetWPM: 26, targetAccuracy: 93, generate: () => genGroupedPattern(16, [2, 2, 4]) },
  { id: 14, level: 'advance', title: 'Variable Spacing',     desc: 'Group lengths change constantly — stay sharp.',              targetWPM: 27, targetAccuracy: 93, generate: () => genGroupedPattern(20, [2, 3, 4, 5]) },
  { id: 15, level: 'advance', title: 'Accuracy Challenge',   desc: 'Long, unbroken digit blocks. Precision over speed.',          targetWPM: 24, targetAccuracy: 95, generate: () => genBlock(10, 8) },
  { id: 16, level: 'advance', title: 'Speed + Accuracy Test',desc: 'Your toughest numbers-only test yet.',                        targetWPM: 32, targetAccuracy: 93, generate: () => genRandomGroups(DIGIT_KEYS, 26, 3, 6) },

  // ---- PRO (numbers + symbols) ----
  { id: 17, level: 'pro', title: 'Meet ! and @',           desc: 'Hold Shift to reach ! and @ above 1 and 2.',     targetWPM: 16, targetAccuracy: 88, generate: () => genSymbolIntroDrill([['1','!'],['2','@']], 5) },
  { id: 18, level: 'pro', title: 'Meet # and $',           desc: 'Now bring in # and $ above 3 and 4.',            targetWPM: 17, targetAccuracy: 88, generate: () => genSymbolIntroDrill([['3','#'],['4','$']], 5) },
  { id: 19, level: 'pro', title: 'Meet % and ^',           desc: 'Stretch your ring and pinky finger for % and ^.',targetWPM: 17, targetAccuracy: 88, generate: () => genSymbolIntroDrill([['5','%'],['6','^']], 5) },
  { id: 20, level: 'pro', title: 'Meet & and *',           desc: 'Cross over for & and * above 7 and 8.',          targetWPM: 18, targetAccuracy: 89, generate: () => genSymbolIntroDrill([['7','&'],['8','*']], 5) },
  { id: 21, level: 'pro', title: 'Meet ( and )',           desc: 'Finish the symbol row with ( and ).',            targetWPM: 18, targetAccuracy: 89, generate: () => genSymbolIntroDrill([['9','('],['0',')']], 5) },
  { id: 22, level: 'pro', title: 'Symbol Recall',          desc: 'Symbols only — no digits to fall back on.',      targetWPM: 18, targetAccuracy: 90, generate: () => genRandomSymbols(18, 2, 3) },
  { id: 23, level: 'pro', title: 'Numbers + Symbols Combo',desc: 'Digits and symbols mixed freely.',               targetWPM: 22, targetAccuracy: 91, generate: () => genMixedDrill(20, 2, 4) },
  { id: 24, level: 'pro', title: 'Pro Speed Challenge',    desc: 'Faster pace, full digit-and-symbol pool.',       targetWPM: 28, targetAccuracy: 91, generate: () => genMixedDrill(24, 3, 5) },

  // ---- LEGEND (high speed, complex, real-world, mastery) ----
  { id: 25, level: 'legend', title: 'High-Speed Sprint',      desc: 'Short groups, relentless pace.',                                targetWPM: 34, targetAccuracy: 92, generate: () => genMixedDrill(28, 2, 4) },
  { id: 26, level: 'legend', title: 'Complex Combinations',   desc: 'Longer unbroken tokens mixing digits and symbols.',            targetWPM: 34, targetAccuracy: 93, generate: () => genMixedDrill(20, 5, 8) },
  { id: 27, level: 'legend', title: 'Real-World Patterns',    desc: "Prices, percentages and codes — the way you'll actually type them.", targetWPM: 32, targetAccuracy: 93, generate: () => genRealWorldDrill(18) },
  { id: 28, level: 'legend', title: 'Mixed Mastery Drill I',  desc: "Everything you've learned, blended together.",                 targetWPM: 36, targetAccuracy: 94, generate: () => genMasteryDrill(22) },
  { id: 29, level: 'legend', title: 'Mixed Mastery Drill II', desc: 'A longer, faster mastery test.',                                targetWPM: 38, targetAccuracy: 94, generate: () => genMasteryDrill(28) },
  { id: 30, level: 'legend', title: 'Legend Final Test',      desc: 'The ultimate test of every digit and every symbol.',           targetWPM: 42, targetAccuracy: 96, generate: () => genMasteryDrill(34) }
];

function getLessonById(id) { return LESSONS.find(l => l.id === id); }


/* -----------------------------------------------------------------------------
   5. ACHIEVEMENT DEFINITIONS
   Each `check` receives the persistent state and returns true once earned.
   ----------------------------------------------------------------------------- */
function rangeCompleted(s, a, b) {
  for (let i = a; i <= b; i++) if (!s.lessonsProgress[i]?.completed) return false;
  return true;
}
function rangeStarred(s, a, b, min) {
  for (let i = a; i <= b; i++) if ((s.lessonsProgress[i]?.stars || 0) < min) return false;
  return true;
}

const ACHIEVEMENTS = [
  { id: 'first-keystroke', name: 'First Keystroke', icon: '🥇', desc: 'Complete your very first lesson.',        check: s => !!s.lessonsProgress[1]?.completed },
  { id: 'basic-grad',      name: 'Basic Graduate',   icon: '🔢', desc: 'Complete all 8 Basic lessons.',           check: s => rangeCompleted(s, 1, 8) },
  { id: 'advance-grad',    name: 'Advance Graduate', icon: '📈', desc: 'Complete all 8 Advance lessons.',         check: s => rangeCompleted(s, 9, 16) },
  { id: 'pro-grad',        name: 'Pro Graduate',     icon: '⚡', desc: 'Complete all 8 Pro lessons.',             check: s => rangeCompleted(s, 17, 24) },
  { id: 'legend-grad',     name: 'Legend',           icon: '👑', desc: 'Complete all 6 Legend lessons.',          check: s => rangeCompleted(s, 25, 30) },
  { id: 'perfect-run',     name: 'Perfect Run',      icon: '🎯', desc: 'Finish a lesson with 100% accuracy.',     check: s => s.history.some(h => h.accuracy >= 100) },
  { id: 'speed-demon',     name: 'Speed Demon',      icon: '🚀', desc: 'Hit 40+ WPM in any lesson.',              check: s => s.history.some(h => h.wpm >= 40) },
  { id: 'symbol-master',   name: 'Symbol Master',    icon: '✨', desc: 'Earn 3+ stars on every Pro lesson.',      check: s => rangeStarred(s, 17, 24, 3) },
  { id: 'star-collector',  name: 'Star Collector',   icon: '⭐', desc: 'Earn 50 total stars.',                    check: s => s.totalStars >= 50 },
  { id: 'star-master',     name: 'Star Master',      icon: '🌟', desc: 'Earn 100 total stars.',                   check: s => s.totalStars >= 100 },
  { id: 'full-mastery',    name: 'Full Mastery',     icon: '💫', desc: 'Earn all 150 possible stars.',            check: s => s.totalStars >= 150 },
  { id: 'on-a-roll',       name: 'On a Roll',        icon: '🔥', desc: 'Reach a 5-lesson streak of 3+ stars.',    check: s => s.streak.best >= 5 },
  { id: 'weak-key-warrior',name: 'Weak Key Warrior', icon: '🛡️', desc: 'Complete 5 Smart Practice drills.',       check: s => (s.smartDrillsCompleted || 0) >= 5 }
];


/* -----------------------------------------------------------------------------
   6. PERSISTENT STATE
   ----------------------------------------------------------------------------- */
function defaultState() {
  return {
    theme: (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark',
    lessonsProgress: {},   // { [lessonId]: {completed, stars, bestWPM, bestCPM, bestAccuracy, attempts, lastCompletedAt} }
    totalStars: 0,
    achievements: {},      // { [achievementId]: {unlocked, unlockedAt} }
    keyStats: {},          // { [char]: {correct, wrong} } — drives the mistake heatmap & Smart Drills
    history: [],           // most-recent-first list of completed attempts
    streak: { current: 0, best: 0 },
    smartDrillsCompleted: 0
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // Merge onto a fresh default so any newly-added fields are never undefined.
    return Object.assign(defaultState(), parsed, {
      lessonsProgress: parsed.lessonsProgress || {},
      achievements: parsed.achievements || {},
      keyStats: parsed.keyStats || {},
      history: parsed.history || [],
      streak: parsed.streak || { current: 0, best: 0 }
    });
  } catch (err) {
    console.warn('NumPad Mastery: could not read saved progress, starting fresh.', err);
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('NumPad Mastery: could not save progress (localStorage unavailable).', err);
  }
}

let state = defaultState(); // replaced by loadState() in init()


/* -----------------------------------------------------------------------------
   7. SMALL UTILITY HELPERS
   ----------------------------------------------------------------------------- */
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function isUnlocked(achievementId) {
  return !!(state.achievements[achievementId] && state.achievements[achievementId].unlocked);
}

function isLessonLocked(id) {
  if (id <= 1) return false;
  return !state.lessonsProgress[id - 1]?.completed;
}

function getContinueLessonId() {
  for (let i = 1; i <= 30; i++) if (!state.lessonsProgress[i]?.completed) return i;
  return 30; // everything done — offer a review of the final lesson
}


/* -----------------------------------------------------------------------------
   8. KEYCAP COMPONENT + HEATMAP RENDERER
   The keycap is the app's signature visual element: every digit is shown
   with its shifted symbol stacked above it, just like a physical keyboard.
   ----------------------------------------------------------------------------- */
function buildKeycap(digit, symbol, extraClass) {
  const el = document.createElement('div');
  el.className = 'keycap' + (extraClass ? ' ' + extraClass : '');
  el.dataset.digit = digit;
  el.dataset.symbol = symbol;

  const sym = document.createElement('span');
  sym.className = 'keycap-symbol';
  sym.textContent = symbol;

  const dig = document.createElement('span');
  dig.className = 'keycap-digit';
  dig.textContent = digit;

  el.appendChild(sym);
  el.appendChild(dig);
  return el;
}

// Looks up accuracy for a single character from accumulated keyStats.
// Returns null if there isn't enough data yet to draw a conclusion.
function getKeyAccuracy(char) {
  const s = state.keyStats && state.keyStats[char];
  if (!s) return null;
  const total = s.correct + s.wrong;
  if (total < 3) return null;
  return s.correct / total;
}

// Renders the 10-keycap strip, tinted from neutral -> green (mastered) -> red
// (frequently mistaken), based on accumulated per-key accuracy.
function renderHeatmapStrip(container) {
  if (!container) return;
  container.innerHTML = '';
  DIGIT_KEYS.forEach((d, i) => {
    const s = SYMBOL_KEYS[i];
    const el = buildKeycap(d, s);
    const accs = [getKeyAccuracy(d), getKeyAccuracy(s)].filter(a => a !== null);
    if (accs.length) {
      const avg = accs.reduce((a, b) => a + b, 0) / accs.length;
      const intensity = clamp(1 - avg, 0, 1); // 0 = perfect, 1 = struggling
      if (intensity > 0.02) {
        const alpha = (0.10 + intensity * 0.6).toFixed(2);
        el.style.background = `rgba(229,88,93,${alpha})`;
        el.style.borderColor = 'var(--danger)';
      } else {
        el.classList.add('keycap--heat-mastered');
      }
    }
    container.appendChild(el);
  });
}


/* -----------------------------------------------------------------------------
   9. VIEW SWITCHING
   ----------------------------------------------------------------------------- */
let currentView = 'dashboard';
const VIEW_TITLES = { dashboard: 'Dashboard', lessons: 'Lessons', typing: 'Typing Practice', stats: 'Statistics', achievements: 'Achievements' };

function switchView(name) {
  if (currentView === 'typing' && name !== 'typing') {
    clearInterval(typingState.timerInterval);
  }
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + name));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  document.getElementById('topbarTitle').textContent = VIEW_TITLES[name] || '';

  if (name === 'dashboard') renderDashboard();
  if (name === 'lessons') renderLessonsGrid();
  if (name === 'stats') renderStatsView();
  if (name === 'achievements') renderAchievementsView();

  closeMobileSidebar();
  window.scrollTo(0, 0);
}

function closeMobileSidebar() { document.body.classList.remove('sidebar-open'); }


/* -----------------------------------------------------------------------------
   10. DASHBOARD RENDERING
   ----------------------------------------------------------------------------- */
function renderTopbarStats() {
  document.getElementById('topStars').textContent = state.totalStars;
  document.getElementById('topStreak').textContent = state.streak.current;
}

function renderSidebarLevels() {
  const el = document.getElementById('sidebarLevelList');
  if (!el) return;
  el.innerHTML = '';
  LEVELS.forEach(level => {
    const [from, to] = level.range;
    const total = to - from + 1;
    let completed = 0;
    for (let i = from; i <= to; i++) if (state.lessonsProgress[i]?.completed) completed++;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-pill';
    btn.innerHTML = `<span class="dot" style="background:${level.color}"></span><span class="pill-name">${level.name}</span><span class="pill-count">${completed}/${total}</span>`;
    btn.addEventListener('click', () => { switchView('lessons'); setLessonsLevel(level.id); });
    el.appendChild(btn);
  });
}

function buildBadgeEl(achievement, unlocked) {
  const el = document.createElement('div');
  el.className = 'badge' + (unlocked ? ' unlocked' : '');
  el.title = achievement.desc;
  el.innerHTML = `<div class="badge-icon">${achievement.icon}</div><div class="badge-name">${achievement.name}</div>`;
  return el;
}

function renderDashboard() {
  renderTopbarStats();

  const continueId = getContinueLessonId();
  document.getElementById('continueLessonLabel').textContent = continueId;
  document.getElementById('continueBtn').onclick = () => startLesson(continueId, { force: true });

  const lessonHist = state.history.filter(h => h.level !== 'smart');
  const avgWPM = lessonHist.length ? Math.round(lessonHist.reduce((a, h) => a + h.wpm, 0) / lessonHist.length) : 0;
  const avgAcc = lessonHist.length ? Math.round(lessonHist.reduce((a, h) => a + h.accuracy, 0) / lessonHist.length) : 0;
  const bestWPM = state.history.length ? Math.max(...state.history.map(h => h.wpm)) : 0;
  document.getElementById('statWPM').textContent = avgWPM;
  document.getElementById('statAccuracy').textContent = avgAcc + '%';
  document.getElementById('statBest').textContent = bestWPM;
  document.getElementById('statStreak').textContent = state.streak.current;

  renderHeatmapStrip(document.getElementById('heroKeyStrip'));
  renderHeatmapStrip(document.getElementById('mistakeKeyStrip'));
  const hasKeyData = Object.keys(state.keyStats || {}).length > 0;
  document.getElementById('mistakeEmptyState').classList.toggle('hidden', hasKeyData);

  // Level summary cards
  const levelCardsEl = document.getElementById('levelCards');
  levelCardsEl.innerHTML = '';
  LEVELS.forEach(level => {
    const [from, to] = level.range;
    const total = to - from + 1;
    let completed = 0;
    for (let i = from; i <= to; i++) if (state.lessonsProgress[i]?.completed) completed++;

    const card = document.createElement('div');
    card.className = 'level-card';
    card.style.setProperty('--level-color', level.color);
    card.innerHTML = `
      <div class="level-badge">${level.name.charAt(0)}</div>
      <div class="level-card-body">
        <strong>${level.name}</strong>
        <span>Lessons ${from}–${to}</span>
      </div>
      <div class="level-mini-progress">
        <div class="progress-track"><div class="progress-fill" style="width:${Math.round(completed / total * 100)}%"></div></div>
        <small>${completed}/${total}</small>
      </div>`;
    card.addEventListener('click', () => { switchView('lessons'); setLessonsLevel(level.id); });
    levelCardsEl.appendChild(card);
  });

  const totalCompleted = Object.values(state.lessonsProgress).filter(p => p.completed).length;
  document.getElementById('overallProgressLabel').textContent = `${totalCompleted} / 30 lessons`;
  document.getElementById('overallProgressFill').style.width = Math.round(totalCompleted / 30 * 100) + '%';

  // Achievement preview row (first 6)
  const previewEl = document.getElementById('badgeRowPreview');
  previewEl.innerHTML = '';
  ACHIEVEMENTS.slice(0, 6).forEach(a => previewEl.appendChild(buildBadgeEl(a, isUnlocked(a.id))));
}


/* -----------------------------------------------------------------------------
   11. LESSONS VIEW RENDERING
   ----------------------------------------------------------------------------- */
let currentLessonsLevel = 'basic';

function setLessonsLevel(levelId) {
  currentLessonsLevel = levelId;
  document.querySelectorAll('.level-tab').forEach(t => t.classList.toggle('active', t.dataset.level === levelId));
  const level = LEVELS.find(l => l.id === levelId);
  document.getElementById('levelDesc').textContent = level.desc;
  renderLessonsGrid();
}

function renderLessonsGrid() {
  const grid = document.getElementById('lessonGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const level = LEVELS.find(l => l.id === currentLessonsLevel);
  const [from, to] = level.range;
  const continueId = getContinueLessonId();

  for (let id = from; id <= to; id++) {
    const lesson = getLessonById(id);
    const progress = state.lessonsProgress[id];
    const locked = isLessonLocked(id);
    const stars = progress?.stars || 0;

    const card = document.createElement('div');
    card.className = 'lesson-card' + (locked ? ' is-locked' : '') + (id === continueId ? ' is-current' : '');
    const statusIcon = locked ? '🔒' : (progress?.completed ? '✅' : '▶️');

    card.innerHTML = `
      <div class="lesson-card-top">
        <span class="lesson-number">Lesson ${id}</span>
        <span class="lesson-status-icon">${statusIcon}</span>
      </div>
      <h4>${lesson.title}</h4>
      <p>${lesson.desc}</p>
      <div class="lesson-stars"><span class="filled">${'★'.repeat(stars)}</span><span class="empty">${'☆'.repeat(5 - stars)}</span></div>
      <div class="lesson-card-meta"><span>Target ${lesson.targetWPM} WPM</span><span>Best ${progress?.bestWPM || 0} WPM</span></div>
    `;
    card.addEventListener('click', () => {
      if (locked) { showToast('🔒', 'Locked', 'Finish the previous lesson to unlock this one.'); return; }
      startLesson(id);
    });
    grid.appendChild(card);
  }
}


/* -----------------------------------------------------------------------------
   12. STATISTICS VIEW RENDERING
   ----------------------------------------------------------------------------- */
function renderStatsView() {
  const hist = state.history;
  const lessonHist = hist.filter(h => h.level !== 'smart');

  const avgWPM = lessonHist.length ? Math.round(lessonHist.reduce((a, h) => a + h.wpm, 0) / lessonHist.length) : 0;
  const avgCPM = lessonHist.length ? Math.round(lessonHist.reduce((a, h) => a + h.cpm, 0) / lessonHist.length) : 0;
  const avgAcc = lessonHist.length ? Math.round(lessonHist.reduce((a, h) => a + h.accuracy, 0) / lessonHist.length) : 0;
  const totalMistakes = hist.reduce((a, h) => a + h.mistakes, 0);
  const bestWPM = hist.length ? Math.max(...hist.map(h => h.wpm)) : 0;

  document.getElementById('statsAvgWPM').textContent = avgWPM;
  document.getElementById('statsAvgCPM').textContent = avgCPM;
  document.getElementById('statsAvgAccuracy').textContent = avgAcc + '%';
  document.getElementById('statsTotalMistakes').textContent = totalMistakes;
  document.getElementById('statsBestWPM').textContent = bestWPM;
  document.getElementById('statsCurrentStreak').textContent = state.streak.current;
  document.getElementById('statsBestStreak').textContent = state.streak.best;
  const completedCount = Object.values(state.lessonsProgress).filter(p => p.completed).length;
  document.getElementById('statsLessonsCompleted').textContent = `${completedCount}/30`;

  renderHeatmapStrip(document.getElementById('statsKeyHeatmap'));

  const tbody = document.getElementById('historyTableBody');
  tbody.innerHTML = '';
  document.getElementById('historyEmptyState').classList.toggle('hidden', hist.length > 0);
  hist.slice(0, 40).forEach(h => {
    const label = h.level === 'smart' ? 'Smart Drill' : `#${h.lessonId} ${h.title}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td><td>${h.wpm}</td><td>${h.cpm}</td><td>${h.accuracy}%</td><td>${h.mistakes}</td><td class="stars-cell">${'★'.repeat(h.stars)}${'☆'.repeat(5 - h.stars)}</td><td>${formatDate(h.timestamp)}</td>`;
    tbody.appendChild(tr);
  });
}


/* -----------------------------------------------------------------------------
   13. ACHIEVEMENTS VIEW RENDERING
   ----------------------------------------------------------------------------- */
function renderAchievementsView() {
  const grid = document.getElementById('badgeGrid');
  grid.innerHTML = '';
  let unlockedCount = 0;
  ACHIEVEMENTS.forEach(a => {
    const unlocked = isUnlocked(a.id);
    if (unlocked) unlockedCount++;
    const card = document.createElement('div');
    card.className = 'badge-card' + (unlocked ? ' unlocked' : '');
    const dateStr = unlocked && state.achievements[a.id]?.unlockedAt ? formatDate(state.achievements[a.id].unlockedAt) : '';
    card.innerHTML = `<div class="badge-icon">${a.icon}</div><strong>${a.name}</strong><p>${a.desc}</p>${dateStr ? `<span class="badge-date">Unlocked ${dateStr}</span>` : ''}`;
    grid.appendChild(card);
  });
  document.getElementById('achievementsSummary').textContent = `${unlockedCount} of ${ACHIEVEMENTS.length} achievements unlocked.`;
}


/* -----------------------------------------------------------------------------
   14. TYPING ENGINE
   ----------------------------------------------------------------------------- */
let typingState = {
  lessonId: null, text: '', index: 0, startTime: null, timerInterval: null,
  totalKeystrokes: 0, correctKeystrokes: 0, mistakeCount: 0, perCharResults: {},
  finished: true, isSmart: false
};

function startLesson(lessonId, opts = {}) {
  const lesson = getLessonById(lessonId);
  if (!lesson) return;
  if (isLessonLocked(lessonId) && !opts.force) {
    showToast('🔒', 'Locked', 'Finish the previous lesson to unlock this one.');
    return;
  }
  typingState = {
    lessonId, text: lesson.generate(), index: 0, startTime: null, timerInterval: null,
    totalKeystrokes: 0, correctKeystrokes: 0, mistakeCount: 0, perCharResults: {},
    finished: false, isSmart: false
  };
  renderTypingView(lesson);
  switchView('typing');
}

function renderTypingView(lesson) {
  document.getElementById('typingLevelTag').textContent = lesson.level === 'smart' ? 'Smart Practice' : capitalize(lesson.level);
  document.getElementById('typingLessonTitle').textContent = lesson.level === 'smart' ? lesson.title : `Lesson ${lesson.id} · ${lesson.title}`;
  document.getElementById('typingLessonDesc').textContent = lesson.desc || '';
  document.getElementById('typeHint').classList.remove('hidden');
  document.getElementById('liveTime').textContent = '0:00';
  document.getElementById('liveWPM').textContent = '0';
  document.getElementById('liveAccuracy').textContent = '100%';
  document.getElementById('liveMistakes').textContent = '0';
  document.getElementById('typingProgressFill').style.width = '0%';
  document.getElementById('nextLessonInlineBtn').disabled = true;

  const container = document.getElementById('typeText');
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < typingState.text.length; i++) {
    const ch = typingState.text[i];
    const span = document.createElement('span');
    span.className = 'char';
    span.dataset.idx = i;
    span.textContent = ch; // regular space — still highlightable via the span's background, but allows line-wrapping
    frag.appendChild(span);
  }
  container.appendChild(frag);

  renderOnscreenKeyboard();
  updateCursor();
  container.focus();
}

function renderOnscreenKeyboard() {
  const kb = document.getElementById('onscreenKeyboard');
  if (!kb) return;
  kb.innerHTML = '';
  DIGIT_KEYS.forEach((d, i) => kb.appendChild(buildKeycap(d, SYMBOL_KEYS[i])));
  updateOnscreenKeyboardHighlight();
}

// Highlights the keycap for whichever character is expected next.
function updateOnscreenKeyboardHighlight() {
  const kb = document.getElementById('onscreenKeyboard');
  if (!kb) return;
  kb.querySelectorAll('.keycap').forEach(k => {
    k.classList.remove('is-next-digit', 'is-next-symbol');
    const hint = k.querySelector('.keycap-shift-hint');
    if (hint) hint.remove();
  });
  const expected = typingState.text[typingState.index];
  if (expected === undefined) return;
  if (DIGIT_KEYS.includes(expected)) {
    const k = kb.querySelector(`.keycap[data-digit="${expected}"]`);
    if (k) k.classList.add('is-next-digit');
  } else if (SYMBOL_KEYS.includes(expected)) {
    const k = kb.querySelector(`.keycap[data-symbol="${expected}"]`);
    if (k) {
      k.classList.add('is-next-symbol');
      const hint = document.createElement('span');
      hint.className = 'keycap-shift-hint';
      hint.textContent = 'Shift';
      k.appendChild(hint);
    }
  }
}

// Briefly flashes a keycap green/red in response to a keystroke.
function flashKey(char, isCorrect) {
  const kb = document.getElementById('onscreenKeyboard');
  if (!kb) return;
  let k = kb.querySelector(`.keycap[data-digit="${char}"]`);
  if (!k) k = kb.querySelector(`.keycap[data-symbol="${char}"]`);
  if (!k) return;
  k.classList.add(isCorrect ? 'is-press-correct' : 'is-press-wrong');
  setTimeout(() => k.classList.remove('is-press-correct', 'is-press-wrong'), 160);
}

function updateCursor() {
  const chars = document.querySelectorAll('#typeText .char');
  chars.forEach(c => c.classList.remove('current'));
  const el = chars[typingState.index];
  if (el) el.classList.add('current');
  updateOnscreenKeyboardHighlight();
}

function bumpPerChar(char, kind) {
  if (!typingState.perCharResults[char]) typingState.perCharResults[char] = { correct: 0, wrong: 0 };
  typingState.perCharResults[char][kind]++;
}

function startLiveTimer() {
  typingState.timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - typingState.startTime;
    document.getElementById('liveTime').textContent = formatTime(elapsedMs);
    const minutes = Math.max(elapsedMs / 60000, 1 / 600);
    const cpm = Math.round(typingState.correctKeystrokes / minutes);
    document.getElementById('liveWPM').textContent = Math.round(cpm / 5);
  }, 250);
}

function updateLiveStatsDisplay() {
  const total = typingState.totalKeystrokes;
  const acc = total ? Math.round((typingState.correctKeystrokes / total) * 100) : 100;
  document.getElementById('liveAccuracy').textContent = acc + '%';
  document.getElementById('liveMistakes').textContent = typingState.mistakeCount;
  const pct = Math.round((typingState.index / typingState.text.length) * 100);
  document.getElementById('typingProgressFill').style.width = pct + '%';
}

// Main keystroke handler — drives real-time highlighting, mistake tracking,
// and auto-completion detection.
function handleKeyDown(e) {
  if (currentView !== 'typing') return;
  if (!document.getElementById('resultsModal').classList.contains('hidden')) return;
  if (!typingState.text || typingState.finished) return;
  if (e.key === 'Backspace') { e.preventDefault(); return; } // accuracy training: must type the correct key to advance
  if (e.key.length !== 1) return; // ignore Shift, Enter, arrows, etc. — browsers already resolve Shift+1 to "!"
  e.preventDefault();

  const expected = typingState.text[typingState.index];
  const typed = e.key;
  const isTargetKey = ALL_TARGET_KEYS.includes(expected);

  if (typingState.startTime === null) {
    typingState.startTime = Date.now();
    document.getElementById('typeHint').classList.add('hidden');
    startLiveTimer();
  }
  typingState.totalKeystrokes++;
  const span = document.querySelector(`#typeText .char[data-idx="${typingState.index}"]`);

  if (typed === expected) {
    if (span) { span.classList.remove('current', 'incorrect'); span.classList.add('correct'); }
    typingState.correctKeystrokes++;
    if (isTargetKey) { bumpPerChar(expected, 'correct'); flashKey(expected, true); }
    typingState.index++;
    if (typingState.index >= typingState.text.length) {
      finishLesson();
      return;
    }
    updateCursor();
  } else {
    if (span) {
      span.classList.add('incorrect', 'shake');
      setTimeout(() => span.classList.remove('shake'), 200);
    }
    typingState.mistakeCount++;
    if (isTargetKey) { bumpPerChar(expected, 'wrong'); flashKey(expected, false); }
  }
  updateLiveStatsDisplay();
}

function mergeKeyStats(perCharResults) {
  state.keyStats = state.keyStats || {};
  Object.entries(perCharResults).forEach(([c, v]) => {
    if (!state.keyStats[c]) state.keyStats[c] = { correct: 0, wrong: 0 };
    state.keyStats[c].correct += v.correct;
    state.keyStats[c].wrong += v.wrong;
  });
}

function recomputeTotalStars() {
  state.totalStars = Object.values(state.lessonsProgress).reduce((sum, p) => sum + (p.stars || 0), 0);
}

function updateStreak(stars) {
  if (stars >= 3) state.streak.current++;
  else state.streak.current = 0;
  state.streak.best = Math.max(state.streak.best, state.streak.current);
}

function pushHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > 60) state.history.length = 60;
}

// Star rating blends speed and accuracy against the lesson's targets, with
// accuracy gates so a fast-but-sloppy run can never outscore a precise one —
// fitting for a tool whose whole purpose is precision on numbers/symbols.
function calcStars(targetWPM, targetAccuracy, wpm, accuracy) {
  const speedScore = clamp(Math.round((wpm / targetWPM) * 5), 1, 5);
  const accScore = clamp(Math.round((accuracy / targetAccuracy) * 5), 1, 5);
  let stars = clamp(Math.round(speedScore * 0.4 + accScore * 0.6), 1, 5);
  if (accuracy < 60) stars = 1;
  else if (accuracy < 75) stars = Math.min(stars, 2);
  else if (accuracy < 85) stars = Math.min(stars, 3);
  return stars;
}

function recordLessonResult(lesson, result) {
  const prev = state.lessonsProgress[lesson.id] || { completed: false, stars: 0, bestWPM: 0, bestCPM: 0, bestAccuracy: 0, attempts: 0 };
  state.lessonsProgress[lesson.id] = {
    completed: true,
    stars: Math.max(prev.stars, result.stars),
    bestWPM: Math.max(prev.bestWPM, result.wpm),
    bestCPM: Math.max(prev.bestCPM, result.cpm),
    bestAccuracy: Math.max(prev.bestAccuracy, result.accuracy),
    attempts: prev.attempts + 1,
    lastCompletedAt: Date.now()
  };
  pushHistory({ lessonId: lesson.id, title: lesson.title, level: lesson.level, ...result, timestamp: Date.now() });
  updateStreak(result.stars);
  mergeKeyStats(typingState.perCharResults);
  recomputeTotalStars();
  const newBadges = checkAchievements();
  saveState();
  return newBadges;
}

function recordSmartDrillResult(result) {
  state.smartDrillsCompleted = (state.smartDrillsCompleted || 0) + 1;
  pushHistory({ lessonId: 'smart', title: 'Smart Practice Drill', level: 'smart', ...result, timestamp: Date.now() });
  mergeKeyStats(typingState.perCharResults);
  const newBadges = checkAchievements();
  saveState();
  return newBadges;
}

function finishLesson() {
  typingState.finished = true;
  clearInterval(typingState.timerInterval);

  const elapsedMs = Math.max(Date.now() - typingState.startTime, 300);
  const minutes = elapsedMs / 60000;
  const cpm = Math.round(typingState.correctKeystrokes / minutes);
  const wpm = Math.round(cpm / 5);
  const accuracy = typingState.totalKeystrokes ? Math.round((typingState.correctKeystrokes / typingState.totalKeystrokes) * 100) : 100;

  document.getElementById('nextLessonInlineBtn').disabled = false;
  document.getElementById('typeHint').classList.add('hidden');
  document.getElementById('typingProgressFill').style.width = '100%';

  let lesson, result, newBadges;
  if (typingState.isSmart) {
    const stars = calcStars(24, 92, wpm, accuracy);
    result = { wpm, cpm, accuracy, mistakes: typingState.mistakeCount, stars };
    lesson = { level: 'smart', id: 'smart', title: 'Smart Practice Drill' };
    newBadges = recordSmartDrillResult(result);
  } else {
    lesson = getLessonById(typingState.lessonId);
    const stars = calcStars(lesson.targetWPM, lesson.targetAccuracy, wpm, accuracy);
    result = { wpm, cpm, accuracy, mistakes: typingState.mistakeCount, stars };
    newBadges = recordLessonResult(lesson, result);
  }

  renderSidebarLevels();
  renderTopbarStats();
  showResultsModal(lesson, result, newBadges);
  if (newBadges.length) showAchievementToast(newBadges[0], newBadges.length);
}

function goToNextLesson() {
  if (typingState.isSmart) { startSmartDrill(); return; }
  const nextId = typingState.lessonId + 1;
  if (nextId <= 30) startLesson(nextId, { force: true });
  else switchView('achievements');
}


/* -----------------------------------------------------------------------------
   15. RESULTS MODAL
   ----------------------------------------------------------------------------- */
function starLabel(n) {
  if (n >= 5) return 'Outstanding! Perfect mastery on this lesson.';
  if (n === 4) return 'Excellent work — almost flawless.';
  if (n === 3) return 'Solid run. A little more practice for full mastery.';
  if (n === 2) return 'Good effort — focus on accuracy next time.';
  return 'Keep practicing — slow down and aim for accuracy first.';
}

function showResultsModal(lesson, result, newBadges) {
  document.getElementById('resultsTitle').textContent = lesson.level === 'smart' ? 'Smart Drill Complete!' : `Lesson ${lesson.id} Complete!`;
  document.getElementById('resultsStars').textContent = '★'.repeat(result.stars) + '☆'.repeat(5 - result.stars);
  document.getElementById('resultsStarsLabel').textContent = starLabel(result.stars);
  document.getElementById('resultsWPM').textContent = result.wpm;
  document.getElementById('resultsCPM').textContent = result.cpm;
  document.getElementById('resultsAccuracy').textContent = result.accuracy + '%';
  document.getElementById('resultsMistakes').textContent = result.mistakes;

  // Weakest keys from THIS attempt
  const weakWrap = document.getElementById('resultsWeakKeysWrap');
  const weakStrip = document.getElementById('resultsWeakKeys');
  weakStrip.innerHTML = '';
  const weakChars = Object.entries(typingState.perCharResults)
    .filter(([, v]) => v.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong)
    .slice(0, 5)
    .map(([c]) => c);
  if (weakChars.length) {
    weakWrap.classList.remove('hidden');
    weakChars.forEach(c => {
      const digit = DIGIT_KEYS.includes(c) ? c : SYMBOL_TO_DIGIT[c];
      const symbol = SYMBOL_KEYS.includes(c) ? c : DIGIT_TO_SYMBOL[c];
      const kc = buildKeycap(digit, symbol);
      kc.style.borderColor = 'var(--danger)';
      kc.style.background = 'var(--danger-soft)';
      weakStrip.appendChild(kc);
    });
  } else {
    weakWrap.classList.add('hidden');
  }

  // Newly unlocked achievements
  const badgeWrap = document.getElementById('resultsNewBadgesWrap');
  const badgeRow = document.getElementById('resultsNewBadges');
  badgeRow.innerHTML = '';
  if (newBadges && newBadges.length) {
    badgeWrap.classList.remove('hidden');
    newBadges.forEach(b => badgeRow.appendChild(buildBadgeEl(b, true)));
  } else {
    badgeWrap.classList.add('hidden');
  }

  const nextBtn = document.getElementById('resultsNextBtn');
  if (!typingState.isSmart && lesson.id >= 30) nextBtn.textContent = 'View Achievements →';
  else nextBtn.textContent = 'Next Lesson →';

  document.getElementById('resultsModal').classList.remove('hidden');
}

function closeResultsModal() { document.getElementById('resultsModal').classList.add('hidden'); }


/* -----------------------------------------------------------------------------
   16. SMART ERROR TRAINING
   Finds the user's lowest-accuracy keys (minimum sample size required so a
   single fluke mistake doesn't skew the drill) and builds a fresh practice
   string concentrated on exactly those keys.
   ----------------------------------------------------------------------------- */
function getTopWeakKeys(n) {
  const scored = ALL_TARGET_KEYS
    .map(c => ({ c, acc: getKeyAccuracy(c) }))
    .filter(x => x.acc !== null)
    .sort((a, b) => a.acc - b.acc)
    .map(x => x.c);

  const result = scored.slice(0, n);
  if (result.length < n) {
    const remaining = ALL_TARGET_KEYS.filter(c => !result.includes(c));
    while (result.length < n && remaining.length) {
      result.push(remaining.splice(randInt(0, remaining.length - 1), 1)[0]);
    }
  }
  return result;
}

function startSmartDrill() {
  const weakKeys = getTopWeakKeys(6);
  const text = genMixedDrill(20, 2, 4, weakKeys);
  const pseudoLesson = { id: 'smart', level: 'smart', title: 'Smart Practice Drill', desc: 'A custom drill built from your weakest keys.', targetWPM: 24, targetAccuracy: 92 };
  typingState = {
    lessonId: 'smart', text, index: 0, startTime: null, timerInterval: null,
    totalKeystrokes: 0, correctKeystrokes: 0, mistakeCount: 0, perCharResults: {},
    finished: false, isSmart: true
  };
  renderTypingView(pseudoLesson);
  switchView('typing');
}


/* -----------------------------------------------------------------------------
   17. ACHIEVEMENT CHECKING + TOASTS
   ----------------------------------------------------------------------------- */
function checkAchievements() {
  const newly = [];
  ACHIEVEMENTS.forEach(a => {
    if (!isUnlocked(a.id) && a.check(state)) {
      state.achievements[a.id] = { unlocked: true, unlockedAt: Date.now() };
      newly.push(a);
    }
  });
  return newly;
}

let toastTimeout;
function showAchievementToast(achievement, count) {
  const toast = document.getElementById('achievementToast');
  clearTimeout(toastTimeout);
  const extra = count > 1 ? ` (+${count - 1} more)` : '';
  toast.innerHTML = `<span class="toast-icon">${achievement.icon}</span><div class="toast-text"><strong>Achievement unlocked${extra}</strong><span>${achievement.name}</span></div>`;
  toast.classList.remove('hidden');
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 4500);
}

function showToast(icon, title, message) {
  const toast = document.getElementById('achievementToast');
  clearTimeout(toastTimeout);
  toast.innerHTML = `<span class="toast-icon">${icon}</span><div class="toast-text"><strong>${title}</strong><span>${message}</span></div>`;
  toast.classList.remove('hidden');
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}


/* -----------------------------------------------------------------------------
   18. EVENT WIRING & INIT
   ----------------------------------------------------------------------------- */
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  document.getElementById('themeToggleLabel').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  state.theme = theme;
}

function wireStaticEvents() {
  // Sidebar / topbar navigation
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  document.querySelectorAll('[data-view-link]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.viewLink)));
  document.getElementById('hamburgerBtn').addEventListener('click', () => document.body.classList.add('sidebar-open'));
  document.getElementById('sidebarBackdrop').addEventListener('click', closeMobileSidebar);

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    saveState();
  });

  // Dashboard actions
  document.getElementById('heroSmartBtn').addEventListener('click', startSmartDrill);
  document.getElementById('smartPracticeBtn').addEventListener('click', startSmartDrill);

  // Lessons view
  document.querySelectorAll('.level-tab').forEach(tab => tab.addEventListener('click', () => setLessonsLevel(tab.dataset.level)));

  // Typing view
  document.getElementById('backToLessonsBtn').addEventListener('click', () => switchView('lessons'));
  document.getElementById('restartBtn').addEventListener('click', () => {
    if (typingState.isSmart) startSmartDrill(); else startLesson(typingState.lessonId, { force: true });
  });
  document.getElementById('nextLessonInlineBtn').addEventListener('click', goToNextLesson);
  document.getElementById('typeText').addEventListener('click', () => document.getElementById('typeText').focus());

  // Results modal
  document.getElementById('resultsRestartBtn').addEventListener('click', () => {
    closeResultsModal();
    if (typingState.isSmart) startSmartDrill(); else startLesson(typingState.lessonId, { force: true });
  });
  document.getElementById('resultsLessonsBtn').addEventListener('click', () => { closeResultsModal(); switchView('lessons'); });
  document.getElementById('resultsNextBtn').addEventListener('click', () => { closeResultsModal(); goToNextLesson(); });

  // Global keystroke capture for the typing engine
  document.addEventListener('keydown', handleKeyDown);
}

function init() {
  state = loadState();
  applyTheme(state.theme);
  renderSidebarLevels();
  setLessonsLevel('basic');
  wireStaticEvents();
  switchView('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
