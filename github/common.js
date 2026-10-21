/* Fake or Fact? shared logic: draw plan, sync, sounds, crossword */
(function (G) {
  'use strict';

  const TEAMS = ['RED', 'BLUE', 'GREEN'];
  const TEAM_COLOR = { RED: '#e5484d', BLUE: '#3e7bfa', GREEN: '#2fa36b' };
  const STATIONS = {
    A: { room: '107D', topic: 'Deepfake', test: 'Real or AI?', clue: 'THINK', pass: 3, of: 4 },
    B: { room: '205D', topic: 'Misinformation vs Disinformation', test: 'Fake Feed', clue: 'VERIFY', pass: 4, of: 6 },
    C: { room: '303D', topic: 'Vocabulary', test: 'Crossword', clue: 'SHARE', pass: 7, of: 10 }
  };
  const ST_KEYS = ['A', 'B', 'C'];
  const FINAL_ROOM = '405E';
  const PHRASE = ['THINK', 'VERIFY', 'SHARE'];
  const PENALTY_S = 60;
  const STATION_SECONDS = 180;
  const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

  /* Draw 0..11 = 2 Latin squares x 6 team permutations.
     Each round all teams are in different stations; each team visits all three. */
  function plan(draw) {
    const dir = draw % 2 === 0 ? 1 : 2;
    const perm = PERMS[Math.floor(draw / 2) % 6];
    const out = {};
    TEAMS.forEach((t, i) => {
      out[t] = [0, 1, 2].map(r => ST_KEYS[(perm[i] + dir * r) % 3]);
    });
    return out;
  }

  /* Room code: 3 random letters + 1 letter that encodes the draw (A..L) */
  function newCode(draw) {
    if (draw == null) draw = Math.floor(Math.random() * 12);
    let s = '';
    for (let i = 0; i < 3; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return s + 'ABCDEFGHIJKL'[draw];
  }
  function parseCode(code) {
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) return null;
    const draw = 'ABCDEFGHIJKL'.indexOf(code[3]);
    if (draw < 0) return null;
    return { code, draw };
  }

  /* ---------- Live sync over ntfy.sh (no accounts, CORS enabled) ---------- */
  const SYNC_HOST = 'https://ntfy.sh';
  const topic = code => 'fakeorfact-icesi-' + code.toLowerCase();
  const QKEY = 'fof_outbox';

  function loadQ() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } }
  function saveQ(q) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {} }

  let flushing = false;
  async function flush(onStatus) {
    if (flushing) return;
    flushing = true;
    let q = loadQ();
    while (q.length) {
      const m = q[0];
      try {
        const r = await fetch(SYNC_HOST + '/' + topic(m.code), { method: 'POST', body: JSON.stringify(m.data) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        q.shift(); saveQ(q);
        onStatus && onStatus('sent');
      } catch (e) {
        onStatus && onStatus('queued');
        break;
      }
    }
    flushing = false;
    if (q.length) setTimeout(() => flush(onStatus), 5000);
  }
  function send(code, data, onStatus) {
    const q = loadQ();
    q.push({ code, data: Object.assign({ ts: Date.now() }, data) });
    saveQ(q);
    flush(onStatus);
  }

  function listen(code, onMsg, onStatus) {
    let es, closed = false;
    function open() {
      es = new EventSource(SYNC_HOST + '/' + topic(code) + '/sse?since=all');
      es.onopen = () => onStatus && onStatus('live');
      es.onerror = () => { onStatus && onStatus('reconnecting'); };
      es.onmessage = ev => {
        try {
          const env = JSON.parse(ev.data);
          if (env.event && env.event !== 'message') return;
          onMsg(JSON.parse(env.message));
        } catch (e) {}
      };
    }
    open();
    return { close() { closed = true; es && es.close(); } };
  }

  /* ---------- Sounds (WebAudio, no files) ---------- */
  let ac;
  function tone(freqs, dur, type) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ac.currentTime;
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type || 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * dur);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + i * dur + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i + 1) * dur);
        o.connect(g); g.connect(ac.destination);
        o.start(t0 + i * dur); o.stop(t0 + (i + 1) * dur + 0.05);
      });
    } catch (e) {}
  }
  const sfx = {
    ok: () => tone([660, 880], 0.12),
    bad: () => tone([220, 165], 0.18, 'square'),
    tap: () => tone([520], 0.05),
    win: () => tone([523, 659, 784, 1047], 0.14, 'triangle'),
    alarm: () => tone([880, 660, 880, 660, 880, 660], 0.18, 'sawtooth')
  };
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

  /* ---------- Crossword generator ---------- */
  const WORDS = [
    ['DEEPFAKE', 'AI-made video or audio that imitates a real person'],
    ['INTENT', 'What separates disinformation from misinformation'],
    ['ERROR', 'Misinformation is often an honest ___'],
    ['HOAX', 'A deliberate trick made to look true'],
    ['SOURCE', 'Who published it first? Check the ___'],
    ['VERIFY', 'Confirm a claim before you share it'],
    ['VIRAL', 'Content that spreads very fast online'],
    ['ALGORITHM', 'Rules a platform uses to decide what you see'],
    ['SYNTHETIC', 'Artificially generated, not recorded'],
    ['CONTEXT', 'A real photo can lie when this is missing']
  ];

  function tryLayout(words, rnd) {
    const N = 40, grid = {};
    const key = (r, c) => r + ',' + c;
    const get = (r, c) => grid[key(r, c)];
    const placed = [];
    function fits(w, r, c, d) {
      const dr = d === 'D' ? 1 : 0, dc = d === 'A' ? 1 : 0;
      if (get(r - dr, c - dc) || get(r + dr * w.length, c + dc * w.length)) return -1;
      let cross = 0;
      for (let i = 0; i < w.length; i++) {
        const rr = r + dr * i, cc = c + dc * i, ch = get(rr, cc);
        if (ch) {
          if (ch.l !== w[i] || ch[d]) return -1;
          cross++;
        } else {
          if (get(rr + dc, cc + dr) || get(rr - dc, cc - dr)) return -1;
        }
      }
      return cross;
    }
    function put(w, r, c, d, clue) {
      const dr = d === 'D' ? 1 : 0, dc = d === 'A' ? 1 : 0;
      for (let i = 0; i < w.length; i++) {
        const k = key(r + dr * i, c + dc * i);
        grid[k] = grid[k] || { l: w[i] };
        grid[k][d] = true;
      }
      placed.push({ word: w, clue, r, c, dir: d });
    }
    const order = words.slice().sort((a, b) => b[0].length - a[0].length || rnd() - 0.5);
    put(order[0][0], N / 2, N / 2 - Math.floor(order[0][0].length / 2), 'A', order[0][1]);
    let pending = order.slice(1);
    let guard = 0;
    while (pending.length && guard++ < 50) {
      const next = [];
      for (const [w, clue] of pending) {
        const opts = [];
        for (const p of placed) {
          for (let i = 0; i < p.word.length; i++) {
            for (let j = 0; j < w.length; j++) {
              if (p.word[i] !== w[j]) continue;
              const d = p.dir === 'A' ? 'D' : 'A';
              const pr = p.r + (p.dir === 'D' ? i : 0), pc = p.c + (p.dir === 'A' ? i : 0);
              const r = pr - (d === 'D' ? j : 0), c = pc - (d === 'A' ? j : 0);
              const s = fits(w, r, c, d);
              if (s > 0) opts.push({ r, c, d, s: s + rnd() * 0.5 });
            }
          }
        }
        if (!opts.length) { next.push([w, clue]); continue; }
        opts.sort((a, b) => b.s - a.s);
        const o = opts[0];
        put(w, o.r, o.c, o.d, clue);
      }
      if (next.length === pending.length) return null;
      pending = next;
    }
    if (pending.length) return null;
    let minR = 1e9, minC = 1e9, maxR = -1e9, maxC = -1e9;
    Object.keys(grid).forEach(k => {
      const [r, c] = k.split(',').map(Number);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    });
    placed.forEach(p => { p.r -= minR; p.c -= minC; });
    return { rows: maxR - minR + 1, cols: maxC - minC + 1, entries: placed };
  }

  function makeCrossword(seed) {
    let s = seed || Math.floor(Math.random() * 1e9);
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    let best = null;
    for (let t = 0; t < 60; t++) {
      const L = tryLayout(WORDS, rnd);
      if (!L) continue;
      const area = L.rows * L.cols, ratio = Math.max(L.rows, L.cols) / Math.min(L.rows, L.cols);
      L.score = area * (1 + ratio * 0.3);
      if (!best || L.score < best.score) best = L;
    }
    if (!best) return null;
    // number cells in reading order
    const starts = {};
    best.entries.forEach(e => { starts[e.r + ',' + e.c] = true; });
    const keys = Object.keys(starts).map(k => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const num = {};
    keys.forEach((k, i) => { num[k.join(',')] = i + 1; });
    best.entries.forEach(e => { e.num = num[e.r + ',' + e.c]; });
    best.entries.sort((a, b) => a.dir.localeCompare(b.dir) || a.num - b.num);
    return best;
  }

  G.FOF = {
    TEAMS, TEAM_COLOR, STATIONS, ST_KEYS, FINAL_ROOM, PHRASE, PENALTY_S, STATION_SECONDS,
    plan, newCode, parseCode, send, flush, listen, topic, sfx, buzz, makeCrossword, WORDS
  };
})(typeof window !== 'undefined' ? window : globalThis);
