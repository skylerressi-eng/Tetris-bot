'use strict';

const {
  BOARD_WIDTH, BOARD_HEIGHT,
  getColumnHeights, countHoles, countCoveredCells,
  countRowTransitions, countColTransitions,
} = require('./board');

// Weights tuned for tetr.io attack-based play
// Positive = good, negative = bad
const WEIGHTS = {
  // Attack rewards
  linesCleared: 3.0,        // base lines cleared
  attack: 8.0,              // lines sent (after combo/b2b bonuses)
  combo: 2.5,               // combo count bonus
  b2bBonus: 3.0,            // back-to-back bonus
  tspinBonus: 12.0,         // T-spin placement bonus
  tspinMiniBonus: 4.0,      // T-spin mini bonus
  perfectClear: 200.0,      // perfect clear is huge

  // Stack quality (penalties)
  maxHeight: -2.8,          // max column height
  avgHeight: -1.2,          // average column height
  holes: -15.0,             // each hole
  coveredCells: -3.0,       // cells covered by holes
  bumpiness: -1.8,          // sum of |height differences| between adjacent columns
  rowTransitions: -0.8,
  colTransitions: -1.0,

  // Well bonuses (rightmost well for combos)
  wellBonus: 2.0,           // bonus for having a clean well
  wellDepth: 0.5,           // bonus per well depth
};

// Attack table for tetr.io (lines sent to opponent)
const BASE_ATTACK = {
  0: 0, 1: 0, 2: 1, 3: 2, 4: 4,
};

// T-spin attack
const TSPIN_ATTACK = {
  0: 0, 1: 2, 2: 4, 3: 6,
};

const TSPIN_MINI_ATTACK = {
  0: 0, 1: 1, 2: 2,
};

function calcAttack(linesCleared, tspinType, combo, b2b) {
  let attack = 0;
  if (tspinType === 'tspin') {
    attack = TSPIN_ATTACK[linesCleared] || 0;
  } else if (tspinType === 'tspin_mini') {
    attack = TSPIN_MINI_ATTACK[linesCleared] || 0;
  } else {
    attack = BASE_ATTACK[linesCleared] || 0;
  }

  // B2B bonus (+1 for tetris or t-spin)
  const isSpecial = (linesCleared === 4) || (tspinType && linesCleared > 0);
  if (b2b && isSpecial) attack += 1;

  // Combo bonus
  if (linesCleared > 0 && combo > 0) {
    attack += Math.floor(combo * 0.5) + (combo >= 2 ? 1 : 0);
  }

  return attack;
}

// Evaluate a board state after a placement
// Returns a numerical score (higher = better)
function evaluate(board, linesCleared, tspinType, combo, b2b, isPC) {
  let score = 0;

  if (isPC) {
    score += WEIGHTS.perfectClear;
    return score; // perfect clear dominates all other evaluation
  }

  const attack = calcAttack(linesCleared, tspinType, combo, b2b);
  score += attack * WEIGHTS.attack;
  score += linesCleared * WEIGHTS.linesCleared;

  if (linesCleared > 0) score += combo * WEIGHTS.combo;

  const isSpecial = (linesCleared === 4) || (tspinType && linesCleared > 0);
  if (isSpecial && b2b) score += WEIGHTS.b2bBonus;

  if (tspinType === 'tspin') score += WEIGHTS.tspinBonus;
  else if (tspinType === 'tspin_mini') score += WEIGHTS.tspinMiniBonus;

  // Board quality
  const heights = getColumnHeights(board);
  const maxH = Math.max(...heights);
  const avgH = heights.reduce((a, b) => a + b, 0) / BOARD_WIDTH;

  score += maxH * WEIGHTS.maxHeight;
  score += avgH * WEIGHTS.avgHeight;

  const holes = countHoles(board);
  score += holes * WEIGHTS.holes;

  const covered = countCoveredCells(board);
  score += covered * WEIGHTS.coveredCells;

  // Bumpiness
  let bumpiness = 0;
  for (let c = 0; c < BOARD_WIDTH - 1; c++) {
    bumpiness += Math.abs(heights[c] - heights[c + 1]);
  }
  score += bumpiness * WEIGHTS.bumpiness;

  score += countRowTransitions(board) * WEIGHTS.rowTransitions;
  score += countColTransitions(board) * WEIGHTS.colTransitions;

  // Well detection (single-column well)
  // A well is a column significantly lower than its neighbors
  let bestWell = 0;
  for (let c = 0; c < BOARD_WIDTH; c++) {
    const leftH = c > 0 ? heights[c - 1] : heights[c] + 4;
    const rightH = c < BOARD_WIDTH - 1 ? heights[c + 1] : heights[c] + 4;
    const wellDepth = Math.min(leftH, rightH) - heights[c];
    if (wellDepth > 0) {
      score += WEIGHTS.wellBonus;
      score += wellDepth * WEIGHTS.wellDepth;
      bestWell = Math.max(bestWell, wellDepth);
    }
  }

  // Penalty for overhang / buried holes
  if (holes > 0 && maxH > 15) score -= holes * 5; // extra penalty when stack is tall
  if (maxH > 18) score -= (maxH - 18) * 10; // danger zone penalty

  return score;
}

// Detect T-spin setup potential on board (reward for recognizing setup)
function detectTSpinSetup(board, heights) {
  let bonus = 0;
  // Look for overhang pattern: tall | short-short-short | tall or similar
  for (let c = 1; c < BOARD_WIDTH - 1; c++) {
    if (heights[c - 1] >= heights[c] + 2 && heights[c + 1] >= heights[c] + 2) {
      bonus += 2.0; // potential T-spin slot
    }
  }
  return bonus;
}

module.exports = { evaluate, calcAttack, WEIGHTS };
