// Spelling Bee 2027 — shared logic for every page (word lists, progress, settings, audio).
const SB = (() => {
    const WORD_LISTS = {
        junior2019: { name: '2019 Junior', file: 'words_junior_2019.json', hasAudio: false }
        // To offer more lists in the Word list menu, uncomment them:
        // intermediate2021: { name: 'Intermediate 2021', file: 'words_intermediate_2021.json', hasAudio: false },
        // original: { name: 'Original List', file: 'words.json', hasAudio: true }
    };
    const DEFAULT_LIST = 'junior2019';

    const QUESTS = [
        { id: 1, name: 'The Village of First Words', level: 'Level 1 · Beginner', desc: 'Simple words to start your adventure.', tint: '--primary-soft', icon: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
        { id: 2, name: 'The Forest of Echoes', level: 'Level 2 · Easy', desc: 'Listen carefully to similar-sounding words.', tint: '--mint-soft', icon: '<path d="M12 3L5 13h4l-3 5h12l-3-5h4z"/><path d="M12 18v3"/>' },
        { id: 3, name: 'The Mountain of Long Words', level: 'Level 3 · Intermediate', desc: 'Master multi-syllable words.', tint: '--lavender', icon: '<path d="M2 20L9 8l4 6 3-4 6 10z"/>' },
        { id: 4, name: 'The Castle of Confusing Words', level: 'Level 4 · Advanced', desc: 'Conquer tricky spellings.', tint: '--honey-soft', icon: '<path d="M4 21V8h3v2h2V8h2v2h2V8h2v2h2V8h3v13z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>' },
        { id: 5, name: 'The Heart of the Kingdom', level: 'Level 5 · Champion', desc: 'Mixed review of every word.', tint: '--sky-soft', icon: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/>' }
    ];

    // ---------- storage ----------
    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function getListKey() {
        let key = null;
        try { key = localStorage.getItem('spellingBeeWordList'); } catch (e) {}
        return WORD_LISTS[key] ? key : DEFAULT_LIST;
    }

    function setListKey(key) {
        try { localStorage.setItem('spellingBeeWordList', key); } catch (e) {}
    }

    function getList() {
        return WORD_LISTS[getListKey()];
    }

    // Progress is shared across lists and keyed by word, as in the original app.
    // It has its own key: other Spelling Bee apps on the same github.io site save to 'spellingBeeState'
    // and drop the fields they don't know about (daily missed words, last typed, etc.).
    const STATE_KEY = 'spellingBee2027State';
    const LEGACY_STATE_KEY = 'spellingBeeState';

    function getProgress() {
        let s = readJSON(STATE_KEY, null);
        if (!s) {
            // First run with the new key: carry over whatever the shared key still holds.
            s = readJSON(LEGACY_STATE_KEY, {}) || {};
            writeJSON(STATE_KEY, s);
        }
        return {
            scores: s.scores || {},
            incorrectWordsCount: s.incorrectWordsCount || {},
            correctWords: s.correctWords || {},
            starred: s.starred || {},
            lastMissed: s.lastMissed || {},
            lastTyped: s.lastTyped || {}
        };
    }

    function saveProgress(p) {
        writeJSON(STATE_KEY, p);
    }

    function todayKey(date = new Date()) {
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${date.getFullYear()}-${m}-${d}`;
    }

    function todayScore(p) {
        return p.scores[todayKey()] || { correct: 0, total: 0 };
    }

    // Consecutive days with at least minWords tested.
    function streak(p, minWords = 1) {
        let count = 0;
        const day = new Date();
        // Today counts once practised; otherwise the streak can still run up to yesterday.
        if (!(p.scores[todayKey(day)] && p.scores[todayKey(day)].total >= minWords)) {
            day.setDate(day.getDate() - 1);
        }
        while (p.scores[todayKey(day)] && p.scores[todayKey(day)].total >= minWords) {
            count++;
            day.setDate(day.getDate() - 1);
        }
        return count;
    }

    // ---------- online record (Google Sheets) ----------
    // Paste the Web app URL from Google Apps Script here (see google-sheets/SETUP.md).
    // Leave it empty to keep the record on this device only.
    const SHEET_URL = 'https://script.google.com/macros/s/AKfycbw7int4MNmf6S2hOPHxy42nBkNmvtDpibQRAhRW8sv6waHOg3h14XTrTkbdPvbpcEYI5A/exec';
    const OUTBOX_KEY = 'spellingBee2027Outbox';
    const PIN_KEY = 'spellingBee2027ParentPin';
    let sending = false;

    // Every first-try answer is queued here and stays queued until the sheet confirms it, so nothing is lost offline.
    function recordAnswer(word, isRight, typed) {
        if (!SHEET_URL) return;
        const outbox = readJSON(OUTBOX_KEY, []) || [];
        outbox.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            time: new Date().toISOString(),
            date: todayKey(),
            word,
            result: isRight ? 'correct' : 'wrong',
            typed,
            list: getList().name
        });
        writeJSON(OUTBOX_KEY, outbox);
        sendOutbox();
    }

    async function sendOutbox() {
        if (!SHEET_URL || sending) return;
        const outbox = readJSON(OUTBOX_KEY, []) || [];
        if (!outbox.length) return;
        sending = true;
        let more = false;
        try {
            // A plain-text body keeps this a "simple" request that Apps Script accepts from another site.
            const res = await fetch(SHEET_URL, { method: 'POST', body: JSON.stringify({ rows: outbox }) });
            const data = await res.json();
            if (data.ok) {
                const sent = new Set(outbox.map(r => r.id));
                const left = (readJSON(OUTBOX_KEY, []) || []).filter(r => !sent.has(r.id));
                writeJSON(OUTBOX_KEY, left);
                more = left.length > 0;
            }
        } catch (e) {
            // Offline or blocked: try again on the next answer, page load or when the device comes back online.
        } finally {
            sending = false;
        }
        if (more) sendOutbox();
    }

    function getParentPin() {
        try { return localStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; }
    }

    function setParentPin(pin) {
        try {
            if (pin) localStorage.setItem(PIN_KEY, pin);
            else localStorage.removeItem(PIN_KEY);
        } catch (e) {}
    }

    async function fetchOnlineRows(pin) {
        const res = await fetch(`${SHEET_URL}?key=${encodeURIComponent(pin)}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'failed');
        return data.rows;
    }

    // Combines the online answers (plus any not sent yet) with this device's record, saves it here, and returns it.
    // This also restores the record on a device whose browser data was cleared.
    function mergeOnlineRows(rows) {
        const byId = new Map();
        rows.concat(readJSON(OUTBOX_KEY, []) || []).forEach(r => byId.set(r.id, r));
        const answers = [...byId.values()].sort((a, b) => String(a.time).localeCompare(String(b.time)));

        const days = {}, wrongCount = {}, rightCount = {}, lastMissed = {}, lastTyped = {};
        answers.forEach(r => {
            const day = days[r.date] || (days[r.date] = { correct: 0, total: 0, wrong: {} });
            day.total++;
            if (r.result === 'correct') {
                day.correct++;
                rightCount[r.word] = (rightCount[r.word] || 0) + 1;
            } else {
                day.wrong[r.word] = (day.wrong[r.word] || 0) + 1;
                wrongCount[r.word] = (wrongCount[r.word] || 0) + 1;
                lastMissed[r.word] = r.date;
                lastTyped[r.word] = r.typed;
            }
        });

        const p = getProgress();
        // A day or count recorded here before the sheet was set up may be larger; keep whichever is bigger.
        Object.entries(days).forEach(([key, day]) => {
            if (!p.scores[key] || day.total >= p.scores[key].total) p.scores[key] = day;
        });
        Object.entries(wrongCount).forEach(([w, n]) => { p.incorrectWordsCount[w] = Math.max(n, p.incorrectWordsCount[w] || 0); });
        Object.entries(rightCount).forEach(([w, n]) => { p.correctWords[w] = Math.max(n, p.correctWords[w] || 0); });
        Object.entries(lastMissed).forEach(([w, d]) => {
            if (d >= (p.lastMissed[w] || '')) {
                p.lastMissed[w] = d;
                p.lastTyped[w] = lastTyped[w];
            }
        });
        saveProgress(p);
        return p;
    }

    window.addEventListener('online', sendOutbox);
    sendOutbox();

    // ---------- words ----------
    async function loadWords() {
        const list = getList();
        const res = await fetch(list.file);
        if (!res.ok) throw new Error('Could not load ' + list.file);
        const data = await res.json();
        const words = [];
        data.groups.forEach(g => {
            g.words.forEach(w => {
                const parts = String(w.definition || '').split('\n');
                words.push({
                    word: String(w.word).trim(),
                    group: g.group,
                    def: (parts[0] || '').trim(),
                    example: parts.slice(1).join(' ').trim(),
                    pos: w.pos || '',
                    pron: w.pronunciation || '',
                    alt: w.alternate || '',
                    audio: w.audio || ''
                });
            });
        });
        return { list, words, goal: data.daily_exam_goal || 33, totalGroups: data.groups.length };
    }

    // ---------- settings ----------
    function getSettings() {
        let prefersReduced = false;
        try { prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
        const s = readJSON('spellingBeeSettings', {}) || {};
        return {
            textSize: s.textSize || 'medium',
            easyRead: !!s.easyRead,
            reduceMotion: s.reduceMotion === undefined ? prefersReduced : !!s.reduceMotion,
            highContrast: !!s.highContrast,
            voiceRate: typeof s.voiceRate === 'number' ? s.voiceRate : 0.8
        };
    }

    function applySettings(s) {
        const root = document.documentElement;
        root.classList.toggle('text-small', s.textSize === 'small');
        root.classList.toggle('text-large', s.textSize === 'large');
        root.classList.toggle('easy-read', s.easyRead);
        root.classList.toggle('reduce-motion', s.reduceMotion);
        root.classList.toggle('high-contrast', s.highContrast);
    }

    function saveSettings(s) {
        writeJSON('spellingBeeSettings', s);
        applySettings(s);
    }

    // ---------- audio ----------
    function speak(text, rate) {
        if (!('speechSynthesis' in window)) {
            alert('Sorry, this browser cannot read words aloud. Try Chrome or Edge.');
            return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-CA';
        u.rate = rate;
        window.speechSynthesis.speak(u);
    }

    let currentAudio = null;

    function playWord(w, slow = false) {
        const rate = getSettings().voiceRate * (slow ? 0.6 : 1);
        if (currentAudio) currentAudio.pause();
        // A word's "audio" is either a full "group_N/file" path (usable from any list) or a file name in its own group folder.
        const ownPath = w.audio && w.audio.includes('/');
        if (!getList().hasAudio && !ownPath) {
            speak(w.word, rate);
            return;
        }
        const file = w.audio || w.word.replace(/\s+/g, '_').toLowerCase();
        const path = ownPath ? `audio/${file}.mp3` : `audio/group_${w.group}/${file}.mp3`;
        currentAudio = new Audio(path);
        currentAudio.playbackRate = Math.max(0.5, rate);
        currentAudio.play().catch(() => speak(w.word, rate));
    }

    // ---------- page helpers ----------
    function esc(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function shuffle(items) {
        const a = [...items];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function initHeader(currentPage) {
        const select = document.getElementById('word-list');
        if (select) {
            const key = getListKey();
            Object.entries(WORD_LISTS).forEach(([k, list]) => {
                const option = document.createElement('option');
                option.value = k;
                option.textContent = list.name;
                option.selected = k === key;
                select.appendChild(option);
            });
            select.addEventListener('change', () => {
                setListKey(select.value);
                location.reload();
            });
        }
        document.querySelectorAll('[data-nav]').forEach(a => {
            if (a.dataset.nav === currentPage) a.setAttribute('aria-current', 'page');
            else a.removeAttribute('aria-current');
        });
    }

    // Apply reading settings as early as possible to avoid a flash of the wrong size/font.
    applySettings(getSettings());

    return {
        QUESTS, getList, getProgress, saveProgress, todayKey, todayScore, streak,
        loadWords, getSettings, saveSettings, speak, playWord, esc, shuffle, initHeader,
        onlineEnabled: !!SHEET_URL, recordAnswer, getParentPin, setParentPin, fetchOnlineRows, mergeOnlineRows
    };
})();
