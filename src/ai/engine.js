'use strict';

const { runBeamSearch, moveToActions } = require('./search');
const { createBoard, BOARD_HEIGHT, BOARD_WIDTH } = require('./board');

class AIEngine {
  computeMove(gameState) {
    if (!gameState || !gameState.currentPiece || !gameState.board) return null;
    try {
      const move = runBeamSearch(gameState);
      if (!move) return null;
      const actions = moveToActions(gameState.currentPiece, move);
      return { move, actions };
    } catch (err) {
      console.error('[AI] Error computing move:', err.message);
      return null;
    }
  }

  // Convert tetr.io raw board (array of rows) to Uint8Array
  parseBoard(rawBoard) {
    const board = createBoard();
    if (!rawBoard) return board;
    for (let r = 0; r < rawBoard.length && r < BOARD_HEIGHT; r++) {
      const row = rawBoard[r];
      if (!row) continue;
      for (let c = 0; c < Math.min(row.length, BOARD_WIDTH); c++) {
        const val = row[c];
        if (val !== 0 && val !== null && val !== undefined) {
          board[r * BOARD_WIDTH + c] = typeof val === 'number' ? Math.max(1, val) : 1;
        }
      }
    }
    return board;
  }
}

module.exports = AIEngine;
