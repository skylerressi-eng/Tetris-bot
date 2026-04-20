// Tetris Bot AI Core — bundled for browser use
// Exposes window.TetrisBotCore = { AIEngine, createBoard, runBeamSearch, moveToActions, ... }
(function () {
  'use strict';

  // ===================== PIECES (SRS) =====================

  const PIECES = {
    I: [
      [[1,0],[1,1],[1,2],[1,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,1],[1,1],[2,1],[3,1]],
    ],
    O: [
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
    ],
    T: [
      [[0,1],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[1,2],[2,1]],
      [[0,1],[1,0],[1,1],[2,1]],
    ],
    S: [
      [[0,1],[0,2],[1,0],[1,1]],
      [[0,1],[1,1],[1,2],[2,2]],
      [[1,1],[1,2],[2,0],[2,1]],
      [[0,0],[1,0],[1,1],[2,1]],
    ],
    Z: [
      [[0,0],[0,1],[1,1],[1,2]],
      [[0,2],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[2,1],[2,2]],
      [[0,1],[1,0],[1,1],[2,0]],
    ],
    J: [
      [[0,0],[1,0],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[2,1]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,0],[2,1]],
    ],
    L: [
      [[0,2],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[2,1],[2,2]],
      [[1,0],[1,1],[1,2],[2,0]],
      [[0,0],[0,1],[1,1],[2,1]],
    ],
  };

  const KICKS_JLSTZ = [
    [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  ];

  const KICKS_I = [
    [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  ];

  const KICKS_O = [[[0,0]],[[0,0]],[[0,0]],[[0,0]],[[0,0]],[[0,0]],[[0,0]],[[0,0]]];

  const ROT_KICK_INDEX = {
    '0>1': 0, '1>0': 1, '1>2': 2, '2>1': 3,
    '2>3': 4, '3>2': 5, '3>0': 6, '0>3': 7,
  };

  function getKicks(pieceType, fromRot, toRot) {
    const idx = ROT_KICK_INDEX[`${fromRot}>${toRot}`];
    if (idx === undefined) return [[0, 0]];
    if (pieceType === 'I') return KICKS_I[idx];
    if (pieceType === 'O') return KICKS_O[idx];
    return KICKS_JLSTZ[idx];
  }

  function getCells(pieceType, rotation) {
    return PIECES[pieceType][rotation & 3];
  }

  const SPAWN_COL = { I: 3, O: 3, T: 3, S: 3, Z: 3, J: 3, L: 3 };
  const SPAWN_ROW = -1;
  const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const PIECE_COLOR = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

  // ===================== BOARD =====================

  const BOARD_WIDTH = 10;
  const BOARD_HEIGHT = 40;

  function createBoard() { return new Uint8Array(BOARD_HEIGHT * BOARD_WIDTH); }
  function cloneBoard(b) { return new Uint8Array(b); }

  function isOccupied(board, row, col) {
    if (col < 0 || col >= BOARD_WIDTH) return true;
    if (row >= BOARD_HEIGHT) return true;
    if (row < 0) return false;
    return board[row * BOARD_WIDTH + col] !== 0;
  }

  function collides(board, pieceType, rotation, pieceRow, pieceCol) {
    const cells = getCells(pieceType, rotation);
    for (const [dr, dc] of cells) {
      const r = pieceRow + dr, c = pieceCol + dc;
      if (c < 0 || c >= BOARD_WIDTH) return true;
      if (r >= BOARD_HEIGHT) return true;
      if (r >= 0 && board[r * BOARD_WIDTH + c] !== 0) return true;
    }
    return false;
  }

  function placePiece(board, pieceType, rotation, pieceRow, pieceCol) {
    const code = PIECE_COLOR[pieceType] || 1;
    const cells = getCells(pieceType, rotation);
    for (const [dr, dc] of cells) {
      const r = pieceRow + dr, c = pieceCol + dc;
      if (r >= 0 && r < BOARD_HEIGHT && c >= 0 && c < BOARD_WIDTH) {
        board[r * BOARD_WIDTH + c] = code;
      }
    }
  }

  function clearLines(board) {
    let linesCleared = 0;
    const newBoard = createBoard();
    let writeRow = BOARD_HEIGHT - 1;
    for (let r = BOARD_HEIGHT - 1; r >= 0; r--) {
      let full = true;
      for (let c = 0; c < BOARD_WIDTH; c++) {
        if (board[r * BOARD_WIDTH + c] === 0) { full = false; break; }
      }
      if (!full) {
        for (let c = 0; c < BOARD_WIDTH; c++)
          newBoard[writeRow * BOARD_WIDTH + c] = board[r * BOARD_WIDTH + c];
        writeRow--;
      } else linesCleared++;
    }
    return { board: newBoard, linesCleared };
  }

  function hardDrop(board, pieceType, rotation, startRow, col) {
    let row = startRow;
    while (!collides(board, pieceType, rotation, row + 1, col)) row++;
    return row;
  }

  function tryRotate(board, pieceType, rotation, pieceRow, pieceCol, direction) {
    const newRot = (rotation + direction) & 3;
    const kicks = getKicks(pieceType, rotation, newRot);
    for (const [dx, dy] of kicks) {
      const nr = pieceRow + dy, nc = pieceCol + dx;
      if (!collides(board, pieceType, newRot, nr, nc)) {
        return { success: true, newRot, newRow: nr, newCol: nc };
      }
    }
    return { success: false, newRot: rotation, newRow: pieceRow, newCol: pieceCol };
  }

  function tryRotate180(board, pieceType, rotation, pieceRow, pieceCol) {
    const r1 = tryRotate(board, pieceType, rotation, pieceRow, pieceCol, 1);
    if (r1.success) {
      const r2 = tryRotate(board, pieceType, r1.newRot, r1.newRow, r1.newCol, 1);
      if (r2.success) return r2;
    }
    const c1 = tryRotate(board, pieceType, rotation, pieceRow, pieceCol, -1);
    if (c1.success) {
      const c2 = tryRotate(board, pieceType, c1.newRot, c1.newRow, c1.newCol, -1);
      if (c2.success) return c2;
    }
    return { success: false, newRot: rotation, newRow: pieceRow, newCol: pieceCol };
  }

  function detectTSpin(board, pieceRow, pieceCol, rotation, lastActionWasRotation) {
    if (!lastActionWasRotation) return null;
    const centerRow = pieceRow + 1, centerCol = pieceCol + 1;
    const corners = [
      [centerRow - 1, centerCol - 1],
      [centerRow - 1, centerCol + 1],
      [centerRow + 1, centerCol - 1],
      [centerRow + 1, centerCol + 1],
    ];
    let filled = 0;
    for (const [r, c] of corners) {
      if (r < 0 || r >= BOARD_HEIGHT || c < 0 || c >= BOARD_WIDTH || isOccupied(board, r, c)) filled++;
    }
    if (filled < 3) return null;
    const frontIdx = [[2,3],[0,2],[0,1],[1,3]][rotation & 3];
    const f1 = corners[frontIdx[0]], f2 = corners[frontIdx[1]];
    const f1Full = (f1[0] < 0 || f1[0] >= BOARD_HEIGHT || f1[1] < 0 || f1[1] >= BOARD_WIDTH || isOccupied(board, f1[0], f1[1]));
    const f2Full = (f2[0] < 0 || f2[0] >= BOARD_HEIGHT || f2[1] < 0 || f2[1] >= BOARD_WIDTH || isOccupied(board, f2[0], f2[1]));
    return (f1Full && f2Full) ? 'tspin' : 'tspin_mini';
  }

  function isPerfectClear(board) {
    for (let i = 0; i < board.length; i++) if (board[i] !== 0) return false;
    return true;
  }

  function getColumnHeights(board) {
    const heights = new Array(BOARD_WIDTH).fill(0);
    for (let c = 0; c < BOARD_WIDTH; c++) {
      for (let r = 0; r < BOARD_HEIGHT; r++) {
        if (board[r * BOARD_WIDTH + c] !== 0) { heights[c] = BOARD_HEIGHT - r; break; }
      }
    }
    return heights;
  }

  function countHoles(board) {
    let holes = 0;
    for (let c = 0; c < BOARD_WIDTH; c++) {
      let found = false;
      for (let r = 0; r < BOARD_HEIGHT; r++) {
        if (board[r * BOARD_WIDTH + c] !== 0) found = true;
        else if (found) holes++;
      }
    }
    return holes;
  }

  function countCoveredCells(board) {
    let covered = 0;
    for (let c = 0; c < BOARD_WIDTH; c++) {
      let depth = 0;
      for (let r = 0; r < BOARD_HEIGHT; r++) {
        if (board[r * BOARD_WIDTH + c] !== 0) depth++;
        else if (depth > 0) covered += depth;
      }
    }
    return covered;
  }

  function countRowTransitions(board) {
    let t = 0;
    for (let r = 0; r < BOARD_HEIGHT; r++) {
      let prev = 1;
      for (let c = 0; c < BOARD_WIDTH; c++) {
        const cur = board[r * BOARD_WIDTH + c] !== 0 ? 1 : 0;
        if (cur !== prev) t++;
        prev = cur;
      }
      if (prev === 0) t++;
    }
    return t;
  }

  function countColTransitions(board) {
    let t = 0;
    for (let c = 0; c < BOARD_WIDTH; c++) {
      let prev = 1;
      for (let r = 0; r < BOARD_HEIGHT; r++) {
        const cur = board[r * BOARD_WIDTH + c] !== 0 ? 1 : 0;
        if (cur !== prev) t++;
        prev = cur;
      }
    }
    return t;
  }

  function getReachablePositions(board, pieceType, startRow, startCol) {
    const visited = new Set();
    const placements = [];
    const queue = [];
    const k0 = `0,${startRow},${startCol}`;
    visited.add(k0);
    queue.push({ rot: 0, row: startRow, col: startCol, lastRot: false });

    let qi = 0;
    while (qi < queue.length) {
      const { rot, row, col, lastRot } = queue[qi++];
      const canDrop = !collides(board, pieceType, rot, row + 1, col);
      if (!canDrop) placements.push({ rotation: rot, row, col, lastActionWasRotation: lastRot });

      const moves = [];
      if (!collides(board, pieceType, rot, row, col - 1)) moves.push({ rot, row, col: col - 1, lastRot: false });
      if (!collides(board, pieceType, rot, row, col + 1)) moves.push({ rot, row, col: col + 1, lastRot: false });
      const cw = tryRotate(board, pieceType, rot, row, col, 1);
      if (cw.success) moves.push({ rot: cw.newRot, row: cw.newRow, col: cw.newCol, lastRot: true });
      const ccw = tryRotate(board, pieceType, rot, row, col, -1);
      if (ccw.success) moves.push({ rot: ccw.newRot, row: ccw.newRow, col: ccw.newCol, lastRot: true });
      const r180 = tryRotate180(board, pieceType, rot, row, col);
      if (r180.success) moves.push({ rot: r180.newRot, row: r180.newRow, col: r180.newCol, lastRot: true });
      if (canDrop) moves.push({ rot, row: row + 1, col, lastRot: false });

      for (const m of moves) {
        const k = `${m.rot},${m.row},${m.col}`;
        if (!visited.has(k)) { visited.add(k); queue.push(m); }
      }
    }
    return placements;
  }

  // ===================== EVALUATOR =====================

  const WEIGHTS = {
    linesCleared: 3.0, attack: 8.0, combo: 2.5, b2bBonus: 3.0,
    tspinBonus: 12.0, tspinMiniBonus: 4.0, perfectClear: 200.0,
    maxHeight: -2.8, avgHeight: -1.2, holes: -15.0, coveredCells: -3.0,
    bumpiness: -1.8, rowTransitions: -0.8, colTransitions: -1.0,
    wellBonus: 2.0, wellDepth: 0.5,
  };

  const BASE_ATTACK = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 4 };
  const TSPIN_ATTACK = { 0: 0, 1: 2, 2: 4, 3: 6 };
  const TSPIN_MINI_ATTACK = { 0: 0, 1: 1, 2: 2 };

  function calcAttack(linesCleared, tspinType, combo, b2b) {
    let attack = 0;
    if (tspinType === 'tspin') attack = TSPIN_ATTACK[linesCleared] || 0;
    else if (tspinType === 'tspin_mini') attack = TSPIN_MINI_ATTACK[linesCleared] || 0;
    else attack = BASE_ATTACK[linesCleared] || 0;
    const isSpecial = linesCleared === 4 || (tspinType && linesCleared > 0);
    if (b2b && isSpecial) attack += 1;
    if (linesCleared > 0 && combo > 0) attack += Math.floor(combo * 0.5) + (combo >= 2 ? 1 : 0);
    return attack;
  }

  function evaluate(board, linesCleared, tspinType, combo, b2b, isPC) {
    let score = 0;
    if (isPC) return WEIGHTS.perfectClear;

    const attack = calcAttack(linesCleared, tspinType, combo, b2b);
    score += attack * WEIGHTS.attack;
    score += linesCleared * WEIGHTS.linesCleared;
    if (linesCleared > 0) score += combo * WEIGHTS.combo;
    const isSpecial = linesCleared === 4 || (tspinType && linesCleared > 0);
    if (isSpecial && b2b) score += WEIGHTS.b2bBonus;
    if (tspinType === 'tspin') score += WEIGHTS.tspinBonus;
    else if (tspinType === 'tspin_mini') score += WEIGHTS.tspinMiniBonus;

    const heights = getColumnHeights(board);
    const maxH = Math.max.apply(null, heights);
    const avgH = heights.reduce((a, b) => a + b, 0) / BOARD_WIDTH;
    score += maxH * WEIGHTS.maxHeight;
    score += avgH * WEIGHTS.avgHeight;
    score += countHoles(board) * WEIGHTS.holes;
    score += countCoveredCells(board) * WEIGHTS.coveredCells;

    let bumpiness = 0;
    for (let c = 0; c < BOARD_WIDTH - 1; c++) bumpiness += Math.abs(heights[c] - heights[c + 1]);
    score += bumpiness * WEIGHTS.bumpiness;
    score += countRowTransitions(board) * WEIGHTS.rowTransitions;
    score += countColTransitions(board) * WEIGHTS.colTransitions;

    for (let c = 0; c < BOARD_WIDTH; c++) {
      const leftH = c > 0 ? heights[c - 1] : heights[c] + 4;
      const rightH = c < BOARD_WIDTH - 1 ? heights[c + 1] : heights[c] + 4;
      const wellDepth = Math.min(leftH, rightH) - heights[c];
      if (wellDepth > 0) {
        score += WEIGHTS.wellBonus;
        score += wellDepth * WEIGHTS.wellDepth;
      }
    }

    const holes = countHoles(board);
    if (holes > 0 && maxH > 15) score -= holes * 5;
    if (maxH > 18) score -= (maxH - 18) * 10;
    return score;
  }

  // ===================== BEAM SEARCH =====================

  const BEAM_WIDTH = 150;
  const LOOKAHEAD = 6;

  class BeamNode {
    constructor(o) {
      this.board = o.board; this.score = o.score; this.firstMove = o.firstMove;
      this.holdPiece = o.holdPiece; this.allPieces = o.allPieces;
      this.queuePos = o.queuePos; this.canHold = o.canHold;
      this.combo = o.combo; this.b2b = o.b2b;
    }
    currentPiece() { return this.queuePos < this.allPieces.length ? this.allPieces[this.queuePos] : null; }
  }

  function runBeamSearch(gameState) {
    const { board, currentPiece, queue, holdPiece, combo, b2b } = gameState;
    if (!currentPiece) return null;

    const allPieces = [currentPiece].concat((queue || []).filter(Boolean).slice(0, LOOKAHEAD));

    const root = new BeamNode({
      board: cloneBoard(board), score: 0, firstMove: null,
      holdPiece: holdPiece || null, allPieces, queuePos: 0, canHold: true,
      combo: combo || 0, b2b: b2b || false,
    });

    let beam = [root];
    let bestFirstMove = null;

    for (let depth = 0; depth < LOOKAHEAD; depth++) {
      const next = [];
      for (const node of beam) {
        const current = node.currentPiece();
        if (!current) continue;
        expandNode(node, current, null, false, next, depth === 0, false);
        if (node.canHold) {
          if (node.holdPiece) {
            expandNode(node, node.holdPiece, current, true, next, depth === 0, false);
          } else {
            const np = node.queuePos + 1 < node.allPieces.length ? node.allPieces[node.queuePos + 1] : null;
            if (np) expandNode(node, np, current, true, next, depth === 0, true);
          }
        }
      }
      next.sort((a, b) => b.score - a.score);
      beam = next.slice(0, BEAM_WIDTH);
      if (beam.length > 0 && beam[0].firstMove) bestFirstMove = beam[0].firstMove;
      if (beam.length === 0) break;
    }
    return bestFirstMove;
  }

  function expandNode(node, pieceToPlace, newHold, useHold, outStates, isFirstDepth, skipOne) {
    const spawnRow = SPAWN_ROW;
    const spawnCol = SPAWN_COL[pieceToPlace];
    const placements = getReachablePositions(node.board, pieceToPlace, spawnRow, spawnCol);

    for (const p of placements) {
      const { rotation, row, col, lastActionWasRotation } = p;
      const nb = cloneBoard(node.board);
      placePiece(nb, pieceToPlace, rotation, row, col);
      const tspinType = pieceToPlace === 'T' ? detectTSpin(nb, row, col, rotation, lastActionWasRotation) : null;
      const { board: cleared, linesCleared } = clearLines(nb);
      const isPC = isPerfectClear(cleared);
      const newCombo = linesCleared > 0 ? node.combo + 1 : 0;
      const isSpecial = linesCleared === 4 || (tspinType && linesCleared > 0);
      const newB2B = linesCleared > 0 ? isSpecial : node.b2b;
      const posScore = evaluate(cleared, linesCleared, tspinType, newCombo, node.b2b, isPC);
      const firstMove = isFirstDepth
        ? { useHold, pieceType: pieceToPlace, rotation, row, col, linesCleared, tspinType, isPC }
        : node.firstMove;

      outStates.push(new BeamNode({
        board: cleared, score: node.score + posScore, firstMove,
        holdPiece: useHold ? (newHold || null) : node.holdPiece,
        allPieces: node.allPieces, queuePos: node.queuePos + (skipOne ? 2 : 1),
        canHold: !useHold, combo: newCombo, b2b: newB2B,
      }));
    }
  }

  function moveToActions(currentPieceType, move) {
    const { useHold, rotation, col } = move;
    const actions = [];
    if (useHold) actions.push('hold');
    if (rotation === 1) actions.push('rotateCW');
    else if (rotation === 2) actions.push('rotate180');
    else if (rotation === 3) actions.push('rotateCCW');
    const effectivePiece = useHold ? move.pieceType : currentPieceType;
    const startCol = SPAWN_COL[effectivePiece] || 3;
    const diff = col - startCol;
    const dir = diff > 0 ? 'right' : 'left';
    for (let i = 0; i < Math.abs(diff); i++) actions.push(dir);
    actions.push('hardDrop');
    return actions;
  }

  // ===================== AI ENGINE =====================

  class AIEngine {
    computeMove(gameState) {
      if (!gameState || !gameState.currentPiece || !gameState.board) return null;
      try {
        const move = runBeamSearch(gameState);
        if (!move) return null;
        const actions = moveToActions(gameState.currentPiece, move);
        return { move, actions };
      } catch (e) {
        console.error('[TetrisBot AI] Error:', e);
        return null;
      }
    }

    parseBoard(rawBoard) {
      const board = createBoard();
      if (!rawBoard) return board;
      for (let r = 0; r < rawBoard.length && r < BOARD_HEIGHT; r++) {
        const row = rawBoard[r];
        if (!row) continue;
        const len = Math.min(row.length || 0, BOARD_WIDTH);
        for (let c = 0; c < len; c++) {
          const v = row[c];
          if (v !== 0 && v !== null && v !== undefined) {
            board[r * BOARD_WIDTH + c] = typeof v === 'number' ? Math.max(1, v) : 1;
          }
        }
      }
      return board;
    }
  }

  // ===================== EXPORTS =====================

  window.TetrisBotCore = {
    AIEngine, createBoard, cloneBoard, runBeamSearch, moveToActions,
    getReachablePositions, BOARD_WIDTH, BOARD_HEIGHT, PIECE_TYPES,
    SPAWN_ROW, SPAWN_COL,
  };
})();
