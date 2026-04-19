// Injected into tetr.io page via Puppeteer
// Hooks into game state and provides command execution interface
(function () {
  'use strict';

  if (window.__TETRIO_BOT__) return; // already injected

  const BOT = {
    ready: false,
    gameState: null,
    running: false,
    frameCount: 0,
    commandQueue: [],
    lastCommandTime: 0,
    commandInterval: 30, // ms between key presses

    keyMap: {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      softDrop: 'ArrowDown',
      hardDrop: ' ',
      rotateCW: 'ArrowUp',
      rotateCCW: 'z',
      rotate180: 'a',
      hold: 'c',
    },

    queueActions(actions) {
      this.commandQueue.push(...actions);
    },

    clearQueue() {
      this.commandQueue = [];
    },

    dispatchKey(key, type) {
      const el = document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : document.querySelector('canvas') || document.body;

      const opts = {
        key,
        code: this._keyToCode(key),
        bubbles: true,
        cancelable: true,
        composed: true,
        isTrusted: false,
      };

      el.dispatchEvent(new KeyboardEvent(type, opts));
      document.dispatchEvent(new KeyboardEvent(type, opts));
      window.dispatchEvent(new KeyboardEvent(type, opts));
    },

    _keyToCode(key) {
      const map = {
        'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
        'ArrowDown': 'ArrowDown', 'ArrowUp': 'ArrowUp',
        ' ': 'Space', 'z': 'KeyZ', 'a': 'KeyA', 'c': 'KeyC',
        'x': 'KeyX', 'Shift': 'ShiftLeft',
      };
      return map[key] || `Key${key.toUpperCase()}`;
    },

    pressKey(action) {
      const key = this.keyMap[action];
      if (!key) return;
      this.dispatchKey(key, 'keydown');
      setTimeout(() => this.dispatchKey(key, 'keyup'), 20);
    },

    // Process one command from queue
    processQueue() {
      const now = Date.now();
      if (this.commandQueue.length === 0) return;
      if (now - this.lastCommandTime < this.commandInterval) return;

      const action = this.commandQueue.shift();
      this.pressKey(action);
      this.lastCommandTime = now;
    },

    // Read game state from tetr.io internals
    readGameState() {
      try {
        return this._readViaGameObject() || this._readViaWindowScan();
      } catch (e) {
        return null;
      }
    },

    _readViaGameObject() {
      // tetr.io exposes game via various paths depending on version
      const candidates = [
        () => window.TETRIO && window.TETRIO.game,
        () => window.tetrio && window.tetrio.game,
        () => window.$game,
        () => window.game,
      ];

      for (const fn of candidates) {
        try {
          const g = fn();
          if (g && g.board) return this._extractState(g);
        } catch (_) {}
      }
      return null;
    },

    _readViaWindowScan() {
      // Scan global variables for Tetris-shaped data
      const keys = Object.keys(window);
      for (const key of keys) {
        if (key.startsWith('_') || key.length < 2) continue;
        try {
          const obj = window[key];
          if (!obj || typeof obj !== 'object') continue;
          // Look for board matrix
          if (obj.board && this._looksLikeBoard(obj.board)) {
            return this._extractState(obj);
          }
          if (obj.matrix && this._looksLikeBoard(obj.matrix)) {
            return this._extractStateFromMatrix(obj);
          }
        } catch (_) {}
      }
      return null;
    },

    _looksLikeBoard(board) {
      if (!Array.isArray(board)) return false;
      if (board.length < 20) return false;
      const row = board[board.length - 1];
      if (!row) return false;
      if (Array.isArray(row)) return row.length === 10;
      if (row.length) return row.length === 10;
      return false;
    },

    _extractState(game) {
      const board = game.board;
      const current = game.piece || game.falling || game.current;
      const queue = game.queue || game.bag || game.next || [];
      const hold = game.hold || game.held;
      const combo = game.combo || 0;
      const b2b = game.b2b || false;

      if (!board || !current) return null;

      return {
        board: this._normalizeBoard(board),
        currentPiece: this._normalizePieceType(current.type || current.piece || current),
        currentRotation: current.r || current.rotation || 0,
        currentRow: current.y || current.row || 0,
        currentCol: current.x || current.col || 3,
        queue: (Array.isArray(queue) ? queue : []).map(p => this._normalizePieceType(p.type || p)),
        holdPiece: hold ? this._normalizePieceType(hold.type || hold) : null,
        combo,
        b2b,
        alive: !game.dead && !game.over,
      };
    },

    _extractStateFromMatrix(obj) {
      return {
        board: this._normalizeBoard(obj.matrix),
        currentPiece: this._normalizePieceType(obj.current && (obj.current.type || obj.current)),
        currentRotation: (obj.current && obj.current.r) || 0,
        currentRow: (obj.current && obj.current.y) || 0,
        currentCol: (obj.current && obj.current.x) || 3,
        queue: ((obj.queue || obj.next || []).map(p => this._normalizePieceType(p.type || p))),
        holdPiece: obj.hold ? this._normalizePieceType(obj.hold.type || obj.hold) : null,
        combo: obj.combo || 0,
        b2b: obj.b2b || false,
        alive: !obj.dead,
      };
    },

    _normalizeBoard(board) {
      // Convert any board format to array of arrays
      if (!board) return null;
      if (Array.isArray(board[0])) {
        return board.map(row => Array.from(row));
      }
      // Might be a flat typed array or object with numeric keys
      const result = [];
      for (let r = 0; r < 40; r++) {
        const row = [];
        for (let c = 0; c < 10; c++) {
          const cell = board[r] ? (board[r][c] || 0) : 0;
          row.push(typeof cell === 'object' ? (cell ? 1 : 0) : (cell || 0));
        }
        result.push(row);
      }
      return result;
    },

    _normalizePieceType(piece) {
      if (!piece) return null;
      const str = String(piece).toUpperCase().trim();
      const valid = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
      if (valid.includes(str)) return str;
      // Some engines use numbers
      const numMap = { '0': 'I', '1': 'O', '2': 'T', '3': 'S', '4': 'Z', '5': 'J', '6': 'L' };
      return numMap[str] || null;
    },

    // Hook into tetr.io's game loop
    hookGameLoop() {
      const self = this;
      const origRAF = window.requestAnimationFrame;
      window.requestAnimationFrame = function (callback) {
        return origRAF.call(window, function (ts) {
          self.frameCount++;
          // Process command queue every frame
          self.processQueue();
          // Read game state every 3 frames (~50ms at 60fps)
          if (self.frameCount % 3 === 0) {
            const state = self.readGameState();
            if (state) {
              self.gameState = state;
              self.ready = true;
            }
          }
          return callback(ts);
        });
      };
    },

    init() {
      this.hookGameLoop();
      console.log('[TetrisBot] Injected and ready');
    },
  };

  window.__TETRIO_BOT__ = BOT;
  BOT.init();
})();
