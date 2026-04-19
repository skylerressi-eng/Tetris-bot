'use strict';

// Tetromino cell offsets [row, col] from top-left of bounding box
// Standard Tetris Guideline orientations
const PIECES = {
  I: [
    [[1,0],[1,1],[1,2],[1,3]],  // 0: spawn
    [[0,2],[1,2],[2,2],[3,2]],  // 1: CW
    [[2,0],[2,1],[2,2],[2,3]],  // 2: 180
    [[0,1],[1,1],[2,1],[3,1]],  // 3: CCW
  ],
  O: [
    [[0,1],[0,2],[1,1],[1,2]],  // all rotations same
    [[0,1],[0,2],[1,1],[1,2]],
    [[0,1],[0,2],[1,1],[1,2]],
    [[0,1],[0,2],[1,1],[1,2]],
  ],
  T: [
    [[0,1],[1,0],[1,1],[1,2]],  // 0: spawn
    [[0,1],[1,1],[1,2],[2,1]],  // 1: CW
    [[1,0],[1,1],[1,2],[2,1]],  // 2: 180
    [[0,1],[1,0],[1,1],[2,1]],  // 3: CCW
  ],
  S: [
    [[0,1],[0,2],[1,0],[1,1]],  // 0: spawn
    [[0,1],[1,1],[1,2],[2,2]],  // 1: CW
    [[1,1],[1,2],[2,0],[2,1]],  // 2: 180
    [[0,0],[1,0],[1,1],[2,1]],  // 3: CCW
  ],
  Z: [
    [[0,0],[0,1],[1,1],[1,2]],  // 0: spawn
    [[0,2],[1,1],[1,2],[2,1]],  // 1: CW
    [[1,0],[1,1],[2,1],[2,2]],  // 2: 180
    [[0,1],[1,0],[1,1],[2,0]],  // 3: CCW
  ],
  J: [
    [[0,0],[1,0],[1,1],[1,2]],  // 0: spawn
    [[0,1],[0,2],[1,1],[2,1]],  // 1: CW
    [[1,0],[1,1],[1,2],[2,2]],  // 2: 180
    [[0,1],[1,1],[2,0],[2,1]],  // 3: CCW
  ],
  L: [
    [[0,2],[1,0],[1,1],[1,2]],  // 0: spawn
    [[0,1],[1,1],[2,1],[2,2]],  // 1: CW
    [[1,0],[1,1],[1,2],[2,0]],  // 2: 180
    [[0,0],[0,1],[1,1],[2,1]],  // 3: CCW
  ],
};

// SRS wall kick data: kicks[piece_type][from_rotation][kick_index] = [dx, dy]
// dx = column offset (right positive), dy = row offset (down positive in board coords)
// Source: Tetris guideline, converted to board coord system (y down)

// SRS kicks: [dx_col, dy_row] in board coordinates (y increases downward)
// Converted from Tetris guideline (x right, y up) by negating y component
const KICKS_JLSTZ = [
  // 0->1 (spawn -> CW)
  [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  // 1->0 (CW -> spawn)
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  // 1->2 (CW -> 180)
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  // 2->1 (180 -> CW)
  [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  // 2->3 (180 -> CCW)
  [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  // 3->2 (CCW -> 180)
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  // 3->0 (CCW -> spawn)
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  // 0->3 (spawn -> CCW)
  [[0,0],[1,0],[1,-1],[0,2],[1,2]],
];

const KICKS_I = [
  // 0->1
  [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  // 1->0
  [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  // 1->2
  [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  // 2->1
  [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  // 2->3
  [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  // 3->2
  [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  // 3->0
  [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  // 0->3
  [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
];

const KICKS_O = [
  [[0,0]],[[0,0]],[[0,0]],[[0,0]],
  [[0,0]],[[0,0]],[[0,0]],[[0,0]],
];

// kick table index for rotation transition
// rotIndex[fromRot][toRot]
const ROT_KICK_INDEX = {
  '0>1': 0, '1>0': 1, '1>2': 2, '2>1': 3,
  '2>3': 4, '3>2': 5, '3>0': 6, '0>3': 7,
};

function getKicks(pieceType, fromRot, toRot) {
  const key = `${fromRot}>${toRot}`;
  const idx = ROT_KICK_INDEX[key];
  if (idx === undefined) return [[0,0]];
  if (pieceType === 'I') return KICKS_I[idx];
  if (pieceType === 'O') return KICKS_O[idx];
  return KICKS_JLSTZ[idx];
}

function getCells(pieceType, rotation) {
  return PIECES[pieceType][rotation & 3];
}

// Bounding box dimensions for each piece [rows, cols]
const BOUNDING_BOX = {
  I: [4, 4], O: [3, 3], T: [3, 3],
  S: [3, 3], Z: [3, 3], J: [3, 3], L: [3, 3],
};

// Spawn column offset to center piece on 10-wide board
const SPAWN_COL = {
  I: 3, O: 3, T: 3, S: 3, Z: 3, J: 3, L: 3,
};

// Spawn row (so piece appears at top, potentially in buffer zone)
const SPAWN_ROW = -1;

const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

module.exports = { PIECES, getKicks, getCells, SPAWN_COL, SPAWN_ROW, PIECE_TYPES, BOUNDING_BOX };
