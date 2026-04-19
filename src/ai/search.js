'use strict';

const {
  cloneBoard, placePiece, clearLines, detectTSpin,
  isPerfectClear, getReachablePositions,
} = require('./board');
const { evaluate } = require('./evaluator');
const { SPAWN_COL, SPAWN_ROW } = require('./pieces');

const BEAM_WIDTH = 150;
const LOOKAHEAD = 6;

// Encapsulates the full game state at one node in the beam search tree.
// allPieces = [currentPiece, ...queue] — shared, never mutated.
// queuePos = index of the piece we should play next from allPieces.
class BeamNode {
  constructor({ board, score, firstMove, holdPiece, allPieces, queuePos, canHold, combo, b2b }) {
    this.board = board;
    this.score = score;
    this.firstMove = firstMove;   // move to execute (only set at depth 0)
    this.holdPiece = holdPiece;   // currently held piece or null
    this.allPieces = allPieces;   // shared array, do not mutate
    this.queuePos = queuePos;     // next piece index
    this.canHold = canHold;       // hold available this turn
    this.combo = combo;
    this.b2b = b2b;
  }

  currentPiece() {
    return this.queuePos < this.allPieces.length ? this.allPieces[this.queuePos] : null;
  }
}

function runBeamSearch(gameState) {
  const { board, currentPiece, queue, holdPiece, combo, b2b } = gameState;
  if (!currentPiece) return null;

  const allPieces = [currentPiece, ...queue.filter(Boolean).slice(0, LOOKAHEAD)];

  const root = new BeamNode({
    board: cloneBoard(board),
    score: 0,
    firstMove: null,
    holdPiece: holdPiece || null,
    allPieces,
    queuePos: 0,
    canHold: true,
    combo: combo || 0,
    b2b: b2b || false,
  });

  let beam = [root];
  let bestFirstMove = null; // track best across all depths

  for (let depth = 0; depth < LOOKAHEAD; depth++) {
    const nextStates = [];

    for (const node of beam) {
      const current = node.currentPiece();
      if (!current) continue;

      // Option A: place current piece without using hold
      expandNode(node, current, null, false, nextStates, depth === 0);

      // Option B: use hold
      if (node.canHold) {
        if (node.holdPiece) {
          // Swap: place held piece, current goes to hold
          expandNode(node, node.holdPiece, current, true, nextStates, depth === 0);
        } else {
          // Hold is empty: current goes to hold, place next piece from queue
          const nextPiece = node.queuePos + 1 < node.allPieces.length
            ? node.allPieces[node.queuePos + 1]
            : null;
          if (nextPiece) {
            expandNode(node, nextPiece, current, true, nextStates, depth === 0, true);
          }
        }
      }
    }

    nextStates.sort((a, b) => b.score - a.score);
    beam = nextStates.slice(0, BEAM_WIDTH);

    // Save best firstMove found so far (from last non-empty beam)
    if (beam.length > 0 && beam[0].firstMove) {
      bestFirstMove = beam[0].firstMove;
    }

    if (beam.length === 0) break;
  }

  return bestFirstMove;
}

// Expand all placements for pieceToPlace from a given node.
// newHold: what the hold slot becomes (null if unchanged)
// useHold: whether hold action was triggered
// skipOneInQueue: if true, queuePos advances by 2 (empty hold + no-hold-piece scenario)
function expandNode(node, pieceToPlace, newHold, useHold, outStates, isFirstDepth, skipOneInQueue = false) {
  const spawnRow = SPAWN_ROW;
  const spawnCol = SPAWN_COL[pieceToPlace];

  const placements = getReachablePositions(node.board, pieceToPlace, spawnRow, spawnCol);

  for (const placement of placements) {
    const { rotation, row, col, lastActionWasRotation } = placement;

    const newBoard = cloneBoard(node.board);
    placePiece(newBoard, pieceToPlace, rotation, row, col);

    const tspinType = pieceToPlace === 'T'
      ? detectTSpin(newBoard, row, col, rotation, lastActionWasRotation)
      : null;

    const { board: clearedBoard, linesCleared } = clearLines(newBoard);
    const isPC = isPerfectClear(clearedBoard);

    const newCombo = linesCleared > 0 ? node.combo + 1 : 0;
    const isSpecial = linesCleared === 4 || (tspinType && linesCleared > 0);
    const newB2B = linesCleared > 0 ? isSpecial : node.b2b;

    const posScore = evaluate(clearedBoard, linesCleared, tspinType, newCombo, node.b2b, isPC);
    const totalScore = node.score + posScore;

    const firstMove = isFirstDepth
      ? { useHold, pieceType: pieceToPlace, rotation, row, col, linesCleared, tspinType, isPC }
      : node.firstMove;

    const newQueuePos = node.queuePos + (skipOneInQueue ? 2 : 1);

    outStates.push(new BeamNode({
      board: clearedBoard,
      score: totalScore,
      firstMove,
      holdPiece: useHold ? (newHold || null) : node.holdPiece,
      allPieces: node.allPieces,
      queuePos: newQueuePos,
      canHold: !useHold, // can hold again next turn
      combo: newCombo,
      b2b: newB2B,
    }));
  }
}

// Convert a move to a sequence of key action strings.
// The path is: (optionally hold), rotate to target rotation, move horizontally, hard drop.
function moveToActions(pieceType, move) {
  const { useHold, rotation, col } = move;
  const actions = [];

  if (useHold) actions.push('hold');

  // Rotation: pick shortest path (0=none, 1=CW, 2=180, 3=CCW)
  if (rotation === 1) {
    actions.push('rotateCW');
  } else if (rotation === 2) {
    actions.push('rotate180');
  } else if (rotation === 3) {
    actions.push('rotateCCW');
  }

  // Horizontal movement from spawn col
  const effectivePiece = useHold ? move.pieceType : pieceType;
  const startCol = SPAWN_COL[effectivePiece] || 3;
  const diff = col - startCol;
  const dir = diff > 0 ? 'right' : 'left';
  for (let i = 0; i < Math.abs(diff); i++) actions.push(dir);

  actions.push('hardDrop');
  return actions;
}

module.exports = { runBeamSearch, moveToActions, BEAM_WIDTH, LOOKAHEAD };
