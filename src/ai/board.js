'use strict';

const { getCells, getKicks, SPAWN_COL, SPAWN_ROW } = require('./pieces');

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 40; // tetr.io uses 40-row board (20 visible + 20 buffer)
const VISIBLE_HEIGHT = 20;

// Board is a flat Uint8Array of BOARD_HEIGHT * BOARD_WIDTH
// cell(row, col) = board[row * BOARD_WIDTH + col]
// 0 = empty, non-zero = filled (color value)

function createBoard() {
  return new Uint8Array(BOARD_HEIGHT * BOARD_WIDTH);
}

function cloneBoard(board) {
  return new Uint8Array(board);
}

function getCell(board, row, col) {
  if (row < 0 || row >= BOARD_HEIGHT || col < 0 || col >= BOARD_WIDTH) return 1; // treat OOB as filled
  return board[row * BOARD_WIDTH + col];
}

function setCell(board, row, col, val) {
  board[row * BOARD_WIDTH + col] = val;
}

function isOccupied(board, row, col) {
  if (col < 0 || col >= BOARD_WIDTH) return true;
  if (row >= BOARD_HEIGHT) return true;
  if (row < 0) return false; // above board is open
  return board[row * BOARD_WIDTH + col] !== 0;
}

// Check if piece at (pieceRow, pieceCol, rotation) collides with board or walls
function collides(board, pieceType, rotation, pieceRow, pieceCol) {
  const cells = getCells(pieceType, rotation);
  for (const [dr, dc] of cells) {
    const r = pieceRow + dr;
    const c = pieceCol + dc;
    if (c < 0 || c >= BOARD_WIDTH) return true;
    if (r >= BOARD_HEIGHT) return true;
    if (r >= 0 && board[r * BOARD_WIDTH + c] !== 0) return true;
  }
  return false;
}

// Place piece onto board (mutates board), returns color code used
function placePiece(board, pieceType, rotation, pieceRow, pieceCol, colorCode) {
  const code = colorCode || PIECE_COLOR[pieceType] || 1;
  const cells = getCells(pieceType, rotation);
  for (const [dr, dc] of cells) {
    const r = pieceRow + dr;
    const c = pieceCol + dc;
    if (r >= 0 && r < BOARD_HEIGHT && c >= 0 && c < BOARD_WIDTH) {
      board[r * BOARD_WIDTH + c] = code;
    }
  }
  return code;
}

const PIECE_COLOR = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

// Clear complete lines, return number cleared and updated board
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
      for (let c = 0; c < BOARD_WIDTH; c++) {
        newBoard[writeRow * BOARD_WIDTH + c] = board[r * BOARD_WIDTH + c];
      }
      writeRow--;
    } else {
      linesCleared++;
    }
  }
  return { board: newBoard, linesCleared };
}

// Drop piece to lowest valid row (gravity)
function hardDrop(board, pieceType, rotation, startRow, startCol) {
  let row = startRow;
  while (!collides(board, pieceType, rotation, row + 1, startCol)) {
    row++;
  }
  return row;
}

// Attempt SRS rotation: returns {success, newRot, newRow, newCol}
function tryRotate(board, pieceType, rotation, pieceRow, pieceCol, direction) {
  const newRot = ((rotation + direction) & 3);
  const kicks = getKicks(pieceType, rotation, newRot);
  for (const [dx, dy] of kicks) {
    const nr = pieceRow + dy;
    const nc = pieceCol + dx;
    if (!collides(board, pieceType, newRot, nr, nc)) {
      return { success: true, newRot, newRow: nr, newCol: nc };
    }
  }
  return { success: false, newRot: rotation, newRow: pieceRow, newCol: pieceCol };
}

// Try 180 rotation (two CW rotations with intermediate kick)
function tryRotate180(board, pieceType, rotation, pieceRow, pieceCol) {
  const r1 = tryRotate(board, pieceType, rotation, pieceRow, pieceCol, 1);
  if (!r1.success) {
    const r2 = tryRotate(board, pieceType, rotation, pieceRow, pieceCol, -1);
    if (!r2.success) return { success: false, newRot: rotation, newRow: pieceRow, newCol: pieceCol };
    const r3 = tryRotate(board, pieceType, r2.newRot, r2.newRow, r2.newCol, -1);
    return r3.success
      ? { success: true, newRot: r3.newRot, newRow: r3.newRow, newCol: r3.newCol }
      : { success: false, newRot: rotation, newRow: pieceRow, newCol: pieceCol };
  }
  const r2 = tryRotate(board, pieceType, r1.newRot, r1.newRow, r1.newCol, 1);
  return r2.success
    ? { success: true, newRot: r2.newRot, newRow: r2.newRow, newCol: r2.newCol }
    : { success: false, newRot: rotation, newRow: pieceRow, newCol: pieceCol };
}

// T-spin detection: piece must be T, last action must be rotation
// Returns: 'tspin', 'tspin_mini', or null
function detectTSpin(board, pieceRow, pieceCol, rotation, lastActionWasRotation) {
  if (!lastActionWasRotation) return null;

  // T center is at offset [1,1] from bounding box
  const centerRow = pieceRow + 1;
  const centerCol = pieceCol + 1;

  // 4 diagonal corners
  const corners = [
    [centerRow - 1, centerCol - 1],
    [centerRow - 1, centerCol + 1],
    [centerRow + 1, centerCol - 1],
    [centerRow + 1, centerCol + 1],
  ];

  let filled = 0;
  for (const [r, c] of corners) {
    if (isOccupied(board, r, c) || r < 0 || r >= BOARD_HEIGHT || c < 0 || c >= BOARD_WIDTH) filled++;
  }

  if (filled < 3) return null;

  // Front corners based on rotation (the two corners the T "faces")
  const frontCorners = [
    [centerRow - 1, centerCol - 1], // 0: front-left
    [centerRow - 1, centerCol + 1], // 1: front-right
    [centerRow + 1, centerCol - 1], // 2: back-left
    [centerRow + 1, centerCol + 1], // 3: back-right
  ];
  // T faces: rotation 0=down(2,3), 1=left(0,2), 2=up(0,1), 3=right(1,3)
  const frontIdx = [[2,3],[0,2],[0,1],[1,3]][rotation & 3];
  const f1 = frontCorners[frontIdx[0]];
  const f2 = frontCorners[frontIdx[1]];

  const front1Filled = (isOccupied(board, f1[0], f1[1]) || f1[0] < 0 || f1[0] >= BOARD_HEIGHT || f1[1] < 0 || f1[1] >= BOARD_WIDTH);
  const front2Filled = (isOccupied(board, f2[0], f2[1]) || f2[0] < 0 || f2[0] >= BOARD_HEIGHT || f2[1] < 0 || f2[1] >= BOARD_WIDTH);

  if (front1Filled && front2Filled) return 'tspin';
  return 'tspin_mini';
}

// Check if board is a perfect clear (all empty)
function isPerfectClear(board) {
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) return false;
  }
  return true;
}

// Column heights (highest filled cell from bottom, 0 if empty)
function getColumnHeights(board) {
  const heights = new Array(BOARD_WIDTH).fill(0);
  for (let c = 0; c < BOARD_WIDTH; c++) {
    for (let r = 0; r < BOARD_HEIGHT; r++) {
      if (board[r * BOARD_WIDTH + c] !== 0) {
        heights[c] = BOARD_HEIGHT - r;
        break;
      }
    }
  }
  return heights;
}

// Count holes (empty cells with at least one filled cell above in same column)
function countHoles(board) {
  let holes = 0;
  for (let c = 0; c < BOARD_WIDTH; c++) {
    let foundFilled = false;
    for (let r = 0; r < BOARD_HEIGHT; r++) {
      if (board[r * BOARD_WIDTH + c] !== 0) {
        foundFilled = true;
      } else if (foundFilled) {
        holes++;
      }
    }
  }
  return holes;
}

// Count cells covered by holes (sum of empty cells with fills above per column)
function countCoveredCells(board) {
  let covered = 0;
  for (let c = 0; c < BOARD_WIDTH; c++) {
    let depth = 0;
    for (let r = 0; r < BOARD_HEIGHT; r++) {
      if (board[r * BOARD_WIDTH + c] !== 0) {
        depth++;
      } else if (depth > 0) {
        covered += depth;
      }
    }
  }
  return covered;
}

// Row transitions: number of cell state changes per row (filled<->empty)
function countRowTransitions(board) {
  let transitions = 0;
  for (let r = 0; r < BOARD_HEIGHT; r++) {
    let prev = 1; // border counts as filled
    for (let c = 0; c < BOARD_WIDTH; c++) {
      const cur = board[r * BOARD_WIDTH + c] !== 0 ? 1 : 0;
      if (cur !== prev) transitions++;
      prev = cur;
    }
    if (prev === 0) transitions++; // right border
  }
  return transitions;
}

// Column transitions
function countColTransitions(board) {
  let transitions = 0;
  for (let c = 0; c < BOARD_WIDTH; c++) {
    let prev = 1;
    for (let r = 0; r < BOARD_HEIGHT; r++) {
      const cur = board[r * BOARD_WIDTH + c] !== 0 ? 1 : 0;
      if (cur !== prev) transitions++;
      prev = cur;
    }
  }
  return transitions;
}

// Find all reachable placement positions using BFS
// Returns array of {rotation, row, col, lastActionWasRotation}
function getReachablePositions(board, pieceType, startRow, startCol) {
  const visited = new Set();
  const placements = [];
  const queue = [];

  const spawnRot = 0;
  const key0 = `${spawnRot},${startRow},${startCol}`;
  visited.add(key0);
  queue.push({ rot: spawnRot, row: startRow, col: startCol, lastRot: false });

  let qi = 0;
  while (qi < queue.length) {
    const { rot, row, col, lastRot } = queue[qi++];

    // Check if this is a resting position (can't move down)
    const canDropFurther = !collides(board, pieceType, rot, row + 1, col);

    if (!canDropFurther) {
      // This is a valid placement
      placements.push({ rotation: rot, row, col, lastActionWasRotation: lastRot });
    }

    // Generate moves: left, right, rotate CW, rotate CCW, rotate 180, soft drop
    const moves = [];

    // Move left
    if (!collides(board, pieceType, rot, row, col - 1)) {
      moves.push({ rot, row, col: col - 1, lastRot: false });
    }
    // Move right
    if (!collides(board, pieceType, rot, row, col + 1)) {
      moves.push({ rot, row, col: col + 1, lastRot: false });
    }
    // Rotate CW
    const cw = tryRotate(board, pieceType, rot, row, col, 1);
    if (cw.success) moves.push({ rot: cw.newRot, row: cw.newRow, col: cw.newCol, lastRot: true });
    // Rotate CCW
    const ccw = tryRotate(board, pieceType, rot, row, col, -1);
    if (ccw.success) moves.push({ rot: ccw.newRot, row: ccw.newRow, col: ccw.newCol, lastRot: true });
    // Rotate 180
    const r180 = tryRotate180(board, pieceType, rot, row, col);
    if (r180.success) moves.push({ rot: r180.newRot, row: r180.newRow, col: r180.newCol, lastRot: true });
    // Soft drop one step
    if (canDropFurther) {
      moves.push({ rot, row: row + 1, col, lastRot: false });
    }

    for (const m of moves) {
      const k = `${m.rot},${m.row},${m.col}`;
      if (!visited.has(k)) {
        visited.add(k);
        queue.push(m);
      }
    }
  }

  return placements;
}

module.exports = {
  BOARD_WIDTH, BOARD_HEIGHT, VISIBLE_HEIGHT,
  createBoard, cloneBoard, getCell, setCell,
  isOccupied, collides, placePiece, clearLines,
  hardDrop, tryRotate, tryRotate180, detectTSpin,
  isPerfectClear, getColumnHeights, countHoles,
  countCoveredCells, countRowTransitions, countColTransitions,
  getReachablePositions, PIECE_COLOR,
};
