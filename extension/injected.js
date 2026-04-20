// Runs in tetr.io's main world (page context). Hooks into game, runs AI, dispatches inputs.
(function () {
  'use strict';

  if (window.__TETRIO_BOT_INJECTED__) return;
  window.__TETRIO_BOT_INJECTED__ = true;

  const Core = window.TetrisBotCore;
  if (!Core) {
    console.error('[TetrisBot] bot-core.js not loaded');
    return;
  }

  const ai = new Core.AIEngine();

  const state = {
    running: false,
    commandInterval: 25,   // ms between keypresses
    thinkDelay: 10,        // ms between decision cycles
    commandQueue: [],
    lastCommandTime: 0,
    lastDecisionKey: null,
    stats: {
      piecesPlaced: 0, linesCleared: 0, tspins: 0,
      perfectClears: 0, tetrises: 0, startTime: null,
    },
    detectedGameState: null,
    lastError: null,
    gameRootCandidate: null, // cached reference to tetr.io's game object
  };

  const KEY_MAP = {
    left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    softDrop: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    hardDrop: { key: ' ', code: 'Space', keyCode: 32 },
    rotateCW: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    rotateCCW: { key: 'z', code: 'KeyZ', keyCode: 90 },
    rotate180: { key: 'a', code: 'KeyA', keyCode: 65 },
    hold: { key: 'c', code: 'KeyC', keyCode: 67 },
  };

  function dispatchKey(action, type) {
    const info = KEY_MAP[action];
    if (!info) return;
    const targets = [
      document.activeElement && document.activeElement !== document.body ? document.activeElement : null,
      document.querySelector('canvas'),
      document.body,
      document,
      window,
    ].filter(Boolean);
    const opts = {
      key: info.key, code: info.code, keyCode: info.keyCode, which: info.keyCode,
      bubbles: true, cancelable: true, composed: true,
    };
    for (const t of targets) {
      try { t.dispatchEvent(new KeyboardEvent(type, opts)); } catch (_) {}
    }
  }

  function pressKey(action) {
    dispatchKey(action, 'keydown');
    setTimeout(() => dispatchKey(action, 'keyup'), 15);
  }

  // Heuristically search window globals for tetr.io's game object
  function findGameObject() {
    if (state.gameRootCandidate) {
      const obj = state.gameRootCandidate;
      if (obj && (obj.board || obj.matrix || obj.state)) return obj;
    }
    try {
      for (const key of Object.keys(window)) {
        if (key.startsWith('webkit') || key === 'chrome') continue;
        let v;
        try { v = window[key]; } catch (_) { continue; }
        if (!v || typeof v !== 'object') continue;
        if (looksLikeGame(v)) {
          state.gameRootCandidate = v;
          return v;
        }
        // Check nested (one level)
        for (const k2 of Object.keys(v)) {
          let v2;
          try { v2 = v[k2]; } catch (_) { continue; }
          if (v2 && typeof v2 === 'object' && looksLikeGame(v2)) {
            state.gameRootCandidate = v2;
            return v2;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function looksLikeGame(obj) {
    try {
      if (!obj) return false;
      if (obj.board && looksLikeBoard(obj.board)) return true;
      if (obj.matrix && looksLikeBoard(obj.matrix)) return true;
      if (obj.state && (obj.state.board || obj.state.matrix)) return true;
    } catch (_) {}
    return false;
  }

  function looksLikeBoard(b) {
    if (!b || typeof b !== 'object') return false;
    // Array of rows?
    if (Array.isArray(b) && b.length >= 20) {
      const row = b[b.length - 1];
      if (Array.isArray(row)) return row.length === 10;
      if (row && row.length === 10) return true;
    }
    return false;
  }

  function normalizePieceType(p) {
    if (!p) return null;
    if (typeof p === 'object') p = p.type || p.piece || p.name || p.id;
    const s = String(p).toUpperCase().trim();
    if (['I','O','T','S','Z','J','L'].includes(s)) return s;
    const numMap = { '0':'I','1':'O','2':'T','3':'S','4':'Z','5':'J','6':'L' };
    return numMap[s] || null;
  }

  function normalizeBoard(raw) {
    if (!raw) return null;
    const out = [];
    for (let r = 0; r < 40; r++) {
      const row = [];
      const src = raw[r];
      for (let c = 0; c < 10; c++) {
        let v = 0;
        if (src) {
          const cell = Array.isArray(src) ? src[c] : (src[c] !== undefined ? src[c] : 0);
          if (cell && typeof cell === 'object') v = cell.type ? 1 : 0;
          else v = cell ? 1 : 0;
        }
        row.push(v);
      }
      out.push(row);
    }
    return out;
  }

  function extractGameState(game) {
    if (!game) return null;
    const g = game.state || game;

    const rawBoard = g.board || g.matrix || g.field;
    if (!rawBoard) return null;

    const cur = g.piece || g.falling || g.current || g.activePiece;
    const queue = g.queue || g.bag || g.next || g.nextPieces || [];
    const hold = g.hold || g.held || g.holdPiece;
    const combo = g.combo || g.comboCount || 0;
    const b2b = g.b2b || g.backToBack || false;
    const dead = g.dead || g.over || g.gameOver;

    return {
      board: normalizeBoard(rawBoard),
      currentPiece: normalizePieceType(cur),
      currentRotation: (cur && (cur.r || cur.rotation)) || 0,
      currentCol: (cur && (cur.x || cur.col)) || 3,
      currentRow: (cur && (cur.y || cur.row)) || 0,
      queue: Array.isArray(queue) ? queue.map(normalizePieceType).filter(Boolean) : [],
      holdPiece: normalizePieceType(hold),
      combo: Number(combo) || 0,
      b2b: Boolean(b2b),
      alive: !dead,
    };
  }

  // Process queued keypresses (paced)
  function processCommandQueue() {
    const now = performance.now();
    if (state.commandQueue.length === 0) return;
    if (now - state.lastCommandTime < state.commandInterval) return;
    const action = state.commandQueue.shift();
    pressKey(action);
    state.lastCommandTime = now;
  }

  // Main decision tick — runs periodically
  function tick() {
    if (!state.running) return;

    processCommandQueue();

    // Don't make new decisions while commands still pending
    if (state.commandQueue.length > 0) return;

    const game = findGameObject();
    if (!game) {
      state.detectedGameState = null;
      return;
    }

    const gs = extractGameState(game);
    if (!gs || !gs.currentPiece || !gs.board) {
      state.detectedGameState = null;
      return;
    }

    state.detectedGameState = gs;
    if (!gs.alive) return;

    // Avoid recomputing for the same piece+position
    const key = `${gs.currentPiece}:${gs.currentRotation}:${gs.currentRow}:${gs.currentCol}`;
    if (key === state.lastDecisionKey) return;
    state.lastDecisionKey = key;

    const parsedBoard = ai.parseBoard(gs.board);
    const result = ai.computeMove({
      board: parsedBoard,
      currentPiece: gs.currentPiece,
      queue: gs.queue.slice(0, 6),
      holdPiece: gs.holdPiece,
      combo: gs.combo,
      b2b: gs.b2b,
    });

    if (!result || !result.actions) return;

    state.commandQueue.push.apply(state.commandQueue, result.actions);

    // Stats
    state.stats.piecesPlaced++;
    if (result.move) {
      if (result.move.linesCleared > 0) state.stats.linesCleared += result.move.linesCleared;
      if (result.move.linesCleared === 4) state.stats.tetrises++;
      if (result.move.tspinType) state.stats.tspins++;
      if (result.move.isPC) state.stats.perfectClears++;
    }
  }

  // High-frequency loop
  function loop() {
    try { tick(); } catch (e) { state.lastError = e.message; console.error('[TetrisBot]', e); }
    setTimeout(loop, state.thinkDelay);
  }
  loop();

  // === Messaging bridge ===
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.__tetrisBot !== 'to-page') return;
    const { cmd, payload } = data;

    if (cmd === 'start') {
      state.running = true;
      state.stats = { piecesPlaced: 0, linesCleared: 0, tspins: 0, perfectClears: 0, tetrises: 0, startTime: Date.now() };
      state.lastDecisionKey = null;
      state.commandQueue = [];
      postStatus();
    } else if (cmd === 'stop') {
      state.running = false;
      state.commandQueue = [];
      postStatus();
    } else if (cmd === 'setSpeed') {
      state.commandInterval = Math.max(5, Math.min(200, payload.commandInterval || 25));
    } else if (cmd === 'status') {
      postStatus();
    }
  });

  function postStatus() {
    const elapsed = state.stats.startTime ? (Date.now() - state.stats.startTime) / 1000 : 0;
    const pps = elapsed > 0 ? (state.stats.piecesPlaced / elapsed) : 0;
    window.postMessage({
      __tetrisBot: 'from-page',
      cmd: 'status',
      payload: {
        running: state.running,
        gameFound: !!state.gameRootCandidate,
        hasGameState: !!state.detectedGameState,
        commandInterval: state.commandInterval,
        stats: Object.assign({}, state.stats, { elapsed, pps }),
        lastError: state.lastError,
      },
    }, '*');
  }

  // Push status regularly
  setInterval(postStatus, 500);

  console.log('[TetrisBot] Injected into tetr.io page context.');
})();
