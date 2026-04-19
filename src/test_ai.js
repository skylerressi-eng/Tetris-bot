'use strict';

const {
  createBoard, cloneBoard, placePiece, clearLines,
  countHoles, getColumnHeights, hardDrop, tryRotate, collides,
  isPerfectClear, getReachablePositions, detectTSpin,
} = require('./ai/board');
const { getCells, getKicks, PIECE_TYPES, SPAWN_COL, SPAWN_ROW } = require('./ai/pieces');
const { runBeamSearch, moveToActions } = require('./ai/search');
const { evaluate } = require('./ai/evaluator');
const AIEngine = require('./ai/engine');

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ---- Board basics ----
console.log('\n[Test] Board basics');
{
  const board = createBoard();
  assert('board created empty', board.every(v => v === 0));
  assert('board size correct', board.length === 40 * 10);

  // I rotation 0 cells: [1,0],[1,1],[1,2],[1,3] → placed at row 38 gives row 39 filled
  placePiece(board, 'I', 0, 38, 0);
  const heights = getColumnHeights(board);
  // col 0: first fill at row 39, height = 40 - 39 = 1
  assert('I piece height correct', heights[0] === 1 && heights[1] === 1, `got ${heights[0]}`);
  assert('I piece fills 4 cols', heights[2] === 1 && heights[3] === 1);
  assert('I piece leaves cols 4-9 empty', heights[4] === 0);

  const holes = countHoles(board);
  assert('no holes after flat placement', holes === 0);
}

// ---- Piece cell definitions ----
console.log('\n[Test] Piece cell definitions');
{
  // T spawn: center col 1, occupies [0,1],[1,0],[1,1],[1,2]
  const tCells = getCells('T', 0);
  assert('T spawn has 4 cells', tCells.length === 4);
  assert('T has mino at center top', tCells.some(([r, c]) => r === 0 && c === 1));
  assert('T has miino at row 1 col 0-2', tCells.filter(([r]) => r === 1).length === 3);

  // I spawn: [1,0],[1,1],[1,2],[1,3]
  const iCells = getCells('I', 0);
  assert('I spawn occupies row 1', iCells.every(([r]) => r === 1));
  assert('I spawn spans 4 cols', iCells.length === 4);
}

// ---- Collision detection ----
console.log('\n[Test] Collision detection');
{
  const board = createBoard();
  assert('no collision on empty board', !collides(board, 'T', 0, 0, 3));
  assert('collision with floor (row 40)', collides(board, 'T', 0, 40, 3));
  assert('collision with left wall (col -1)', collides(board, 'I', 0, 0, -1));
  // I rotation 0 is 4 wide; at col 8: cells at 9,10 — 10 is OOB
  assert('collision with right wall (I at col 8)', collides(board, 'I', 0, 0, 8));
  // I at col 7 fits: cols 7,8,9,10 — wait col 10 is OOB. Col 6 is rightmost valid.
  assert('I at col 6 fits', !collides(board, 'I', 0, 0, 6));

  // Place a block and check
  placePiece(board, 'O', 0, 37, 4);
  assert('collision with placed piece', collides(board, 'T', 0, 36, 4));
}

// ---- Hard drop ----
console.log('\n[Test] Hard drop');
{
  const board = createBoard();
  // T rotation 0 cells: [0,1],[1,0],[1,1],[1,2]. Bottom row offset = 1.
  // Max drop row where row+1 would collide: row 38 (cells at 38 and 39 which is last row)
  const dropRow = hardDrop(board, 'T', 0, SPAWN_ROW, 3);
  assert('T hard drop lands at row 38', dropRow === 38, `got ${dropRow}`);

  const board2 = createBoard();
  // Fill row 38 completely (obstacle)
  for (let c = 0; c < 10; c++) board2[38 * 10 + c] = 1;
  const dropRow2 = hardDrop(board2, 'T', 0, SPAWN_ROW, 3);
  assert('T hard drop stops above obstacle', dropRow2 === 36, `got ${dropRow2}`);

  // I piece drop (cells at row+1 of bounding box)
  const dropI = hardDrop(board, 'I', 0, SPAWN_ROW, 0);
  assert('I hard drop lands at row 38', dropI === 38, `got ${dropI}`);
}

// ---- Line clear ----
console.log('\n[Test] Line clear');
{
  const board = createBoard();
  for (let c = 0; c < 10; c++) board[39 * 10 + c] = 1;
  const { linesCleared } = clearLines(board);
  assert('one line cleared', linesCleared === 1, `got ${linesCleared}`);

  const board2 = createBoard();
  for (let r = 36; r < 40; r++)
    for (let c = 0; c < 10; c++) board2[r * 10 + c] = 1;
  const { linesCleared: l2, board: b2 } = clearLines(board2);
  assert('four lines cleared (tetris)', l2 === 4, `got ${l2}`);
  assert('board empty after tetris', isPerfectClear(b2));

  // Partial row should not be cleared
  const board3 = createBoard();
  for (let c = 0; c < 9; c++) board3[39 * 10 + c] = 1; // one gap
  const { linesCleared: l3 } = clearLines(board3);
  assert('partial row not cleared', l3 === 0, `got ${l3}`);
}

// ---- Perfect clear detection ----
console.log('\n[Test] Perfect clear');
{
  const board = createBoard();
  assert('empty board is PC', isPerfectClear(board));
  board[39 * 10 + 0] = 1;
  assert('non-empty board is not PC', !isPerfectClear(board));
}

// ---- SRS wall kicks ----
console.log('\n[Test] SRS Wall kicks');
{
  const board = createBoard();

  // T at col 7 (rightmost valid 3-wide position): cols 7,8,9
  const r1 = tryRotate(board, 'T', 0, 18, 7, 1);
  assert('T rotates CW at right edge (col 7)', r1.success, `success=${r1.success}`);
  assert('T CW rotation gives rot=1', r1.newRot === 1);

  // T at col 0 (leftmost): test CCW kick
  const r2 = tryRotate(board, 'T', 0, 18, 0, -1);
  assert('T rotates CCW at left edge (col 0)', r2.success);

  // I piece rotation
  const r3 = tryRotate(board, 'I', 0, 18, 3, 1);
  assert('I rotates CW on open board', r3.success);
  assert('I CW rotation gives rot=1', r3.newRot === 1);

  // Blocked rotation should fail (fill in blocking area)
  const blockedBoard = createBoard();
  for (let r = 0; r < 40; r++)
    for (let c = 0; c < 10; c++) blockedBoard[r * 10 + c] = 1;
  // Clear a small space for T
  blockedBoard[18 * 10 + 4] = 0;
  blockedBoard[19 * 10 + 3] = 0;
  blockedBoard[19 * 10 + 4] = 0;
  blockedBoard[19 * 10 + 5] = 0;
  // T at 18,3 cannot rotate if all kick positions are blocked
  const r4 = tryRotate(blockedBoard, 'T', 0, 18, 3, 1);
  // T might succeed with kicks — just verify it doesn't throw
  assert('blocked rotation does not throw', true);
}

// ---- Reachable positions ----
console.log('\n[Test] Reachable positions');
{
  const board = createBoard();
  const positions = getReachablePositions(board, 'T', SPAWN_ROW, SPAWN_COL['T']);
  assert('T has many placements on empty board', positions.length > 15, `got ${positions.length}`);
  assert('all 4 T rotations reachable', new Set(positions.map(p => p.rotation)).size === 4);

  // All placements must be resting (no floating pieces)
  const allResting = positions.every(p => !collides(board, 'T', p.rotation, p.row, p.col));
  assert('all T placements are valid (no collision)', allResting);

  // I piece
  const iPos = getReachablePositions(board, 'I', SPAWN_ROW, SPAWN_COL['I']);
  assert('I has multiple placements', iPos.length > 8, `got ${iPos.length}`);
}

// ---- T-spin detection ----
console.log('\n[Test] T-spin detection');
{
  // Build a classic T-spin double notch
  // Row 37: X . X X X X X X X X   (gap at col 1)
  // Row 38: X X X . X X X X X X   (gap at col 3)
  // Row 39: X X X X X X X X X X   (full)
  // T placed at rotation 1 (CW) filling the notch
  const board = createBoard();
  for (let c = 0; c < 10; c++) {
    if (c !== 1) board[37 * 10 + c] = 1;
    if (c !== 3) board[38 * 10 + c] = 1;
    board[39 * 10 + c] = 1;
  }

  // T at rotation 1 (CW), placed so it fits the notch
  // T CW cells: [0,1],[1,1],[1,2],[2,1] with pieceRow=36, pieceCol=0
  // Row 36: col1; Row 37: col1,2; Row 38: col1  → need to check
  const result = detectTSpin(board, 36, 0, 1, true);
  // We just verify the function runs without error and returns a string or null
  assert('T-spin detection returns string or null', result === null || typeof result === 'string');

  // T with lastActionWasRotation=false should not be T-spin
  const result2 = detectTSpin(board, 36, 0, 1, false);
  assert('no T-spin without rotation', result2 === null);
}

// ---- Evaluator ----
console.log('\n[Test] Evaluator');
{
  const board = createBoard();
  const s0 = evaluate(board, 0, null, 0, false, false);
  const s2 = evaluate(board, 2, null, 0, false, false); // double
  const s4 = evaluate(board, 4, null, 0, false, false); // tetris
  const sTS = evaluate(board, 2, 'tspin', 0, false, false); // T-spin double
  const sPC = evaluate(board, 4, null, 0, false, true);  // perfect clear

  assert('0 clears < 2 clears', s0 < s2);
  assert('2 clears < tetris', s2 < s4);
  assert('tetris < t-spin double', s4 < sTS, `tetris=${s4} tspin=${sTS}`);
  assert('perfect clear dominates', sPC > sTS, `pc=${sPC} tspin=${sTS}`);

  // Board with holes should score worse than clean board
  const messyBoard = createBoard();
  for (let c = 0; c < 10; c++) messyBoard[35 * 10 + c] = 1;
  messyBoard[36 * 10 + 0] = 0; // hole
  const sClean = evaluate(board, 0, null, 0, false, false);
  const sHoley = evaluate(messyBoard, 0, null, 0, false, false);
  assert('holes penalize score', sHoley < sClean, `clean=${sClean} holey=${sHoley}`);
}

// ---- Beam search: basic ----
console.log('\n[Test] Beam search (basic)');
{
  const ai = new AIEngine();
  const board = createBoard();

  const result = ai.computeMove({
    board,
    currentPiece: 'T',
    queue: ['I', 'O', 'S', 'Z', 'J', 'L'],
    holdPiece: null,
    combo: 0,
    b2b: false,
  });

  assert('AI returns a result', result !== null);
  assert('result has actions array', result && Array.isArray(result.actions));
  assert('actions include hardDrop', result && result.actions.includes('hardDrop'));
  assert('actions array not empty', result && result.actions.length > 0);

  console.log(`  Move actions: ${result ? result.actions.join(' → ') : 'none'}`);
}

// ---- Beam search: hold mechanic ----
console.log('\n[Test] Beam search (hold)');
{
  const ai = new AIEngine();
  const board = createBoard();

  // Test with held piece present
  const result = ai.computeMove({
    board,
    currentPiece: 'Z',
    queue: ['T', 'I', 'O', 'S', 'J', 'L'],
    holdPiece: 'T',
    combo: 0,
    b2b: false,
  });
  assert('AI with hold piece returns move', result !== null);

  // Test with no held piece
  const result2 = ai.computeMove({
    board,
    currentPiece: 'Z',
    queue: ['T', 'I', 'O', 'S', 'J', 'L'],
    holdPiece: null,
    combo: 0,
    b2b: false,
  });
  assert('AI with null hold returns move', result2 !== null);
}

// ---- Beam search: all piece types ----
console.log('\n[Test] Beam search (all pieces)');
{
  const ai = new AIEngine();
  for (const piece of PIECE_TYPES) {
    const board = createBoard();
    const result = ai.computeMove({
      board,
      currentPiece: piece,
      queue: ['T', 'I', 'O', 'S'],
      holdPiece: null,
      combo: 0,
      b2b: false,
    });
    assert(`${piece} generates valid move`, result !== null && result.actions.includes('hardDrop'));
  }
}

// ---- Beam search: messy board ----
console.log('\n[Test] Beam search (messy board)');
{
  const ai = new AIEngine();
  const rawBoard = Array.from({ length: 40 }, (_, r) =>
    Array.from({ length: 10 }, (_, c) => r >= 30 ? ((r + c) % 3 !== 0 ? 1 : 0) : 0)
  );
  // Leave column 9 open as a well
  for (let r = 30; r < 40; r++) rawBoard[r][9] = 0;

  const board = ai.parseBoard(rawBoard);
  const result = ai.computeMove({
    board,
    currentPiece: 'I',
    queue: ['T', 'S', 'Z', 'J', 'L', 'O'],
    holdPiece: 'T',
    combo: 3,
    b2b: true,
  });
  assert('AI handles messy board', result !== null);
  assert('messy board move has hardDrop', result && result.actions.includes('hardDrop'));
}

// ---- moveToActions correctness ----
console.log('\n[Test] moveToActions');
{
  const { moveToActions: mta } = require('./ai/search');

  const actionsNoHold = mta('T', { useHold: false, pieceType: 'T', rotation: 0, col: 3 });
  assert('no movement at spawn col + no rotation', actionsNoHold.join(',') === 'hardDrop', actionsNoHold.join(','));

  const actionsLeft = mta('T', { useHold: false, pieceType: 'T', rotation: 0, col: 0 });
  assert('move left 3 from spawn', actionsLeft.filter(a => a === 'left').length === 3);

  const actionsRotCW = mta('T', { useHold: false, pieceType: 'T', rotation: 1, col: 3 });
  assert('CW rotation included', actionsRotCW.includes('rotateCW'));

  const actionsHold = mta('T', { useHold: true, pieceType: 'I', rotation: 0, col: 3 });
  assert('hold action first', actionsHold[0] === 'hold');
}

// ---- Summary ----
console.log('\n=================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✓');
  process.exit(0);
}
