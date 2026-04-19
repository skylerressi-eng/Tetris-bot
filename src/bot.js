'use strict';

const TetrioClient = require('./client/tetrio');
const AIEngine = require('./ai/engine');

const ARGS = process.argv.slice(2);
const HEADLESS = ARGS.includes('--headless');
const MOVE_DELAY = parseInt(ARGS.find(a => a.startsWith('--delay='))?.split('=')[1] || '30', 10);

class TetrisBot {
  constructor() {
    this.client = new TetrioClient({
      headless: HEADLESS,
      moveDelay: MOVE_DELAY,
      thinkDelay: 5,
    });
    this.ai = new AIEngine();
    this.stats = {
      piecesPlaced: 0,
      linesCleared: 0,
      tspins: 0,
      perfectClears: 0,
      attack: 0,
      gamesPlayed: 0,
      startTime: null,
    };
    this.running = false;
    this.prevBoardHash = null;
    this.prevPiece = null;
  }

  async start() {
    console.log('=== TETRIS BOT v1.0 ===');
    console.log(`Mode: ${HEADLESS ? 'headless' : 'visual'}, Move delay: ${MOVE_DELAY}ms`);

    try {
      await this.client.launch();
      await this.client.configureSpeed();
      await this.sleep(1000);
      await this.client.startGame();
      await this.sleep(1500);

      this.running = true;
      this.stats.startTime = Date.now();

      console.log('[Bot] Waiting for game state...');
      try {
        await this.client.waitForGame(30000);
        console.log('[Bot] Game state found! Starting game loop.');
      } catch (e) {
        console.warn('[Bot] Could not read game state automatically. Attempting manual start...');
        await this.client.pressEnter();
        await this.sleep(1000);
      }

      await this.gameLoop();
    } catch (err) {
      console.error('[Bot] Fatal error:', err);
    } finally {
      this.printStats();
      if (!HEADLESS) {
        console.log('[Bot] Browser left open. Press Ctrl+C to exit.');
        // Keep process alive for visual mode
        await new Promise(() => {}); // eslint-disable-line
      }
      await this.client.close();
    }
  }

  async gameLoop() {
    console.log('[Bot] Game loop started.');
    let idleFrames = 0;
    let consecutiveErrors = 0;
    const MAX_ERRORS = 20;

    while (this.running) {
      try {
        const gameState = await this.client.getGameState();

        if (!gameState) {
          idleFrames++;
          if (idleFrames > 50) {
            console.log('[Bot] No game state. Attempting to restart...');
            await this.client.pressEnter();
            await this.sleep(2000);
            idleFrames = 0;
            this.stats.gamesPlayed++;
          }
          await this.sleep(100);
          continue;
        }

        idleFrames = 0;

        // Check if game is over
        if (!gameState.alive) {
          console.log('[Bot] Game over. Restarting...');
          this.printStats();
          await this.sleep(1500);
          await this.client.pressEnter();
          await this.sleep(1500);
          this.stats.gamesPlayed++;
          this.prevBoardHash = null;
          this.prevPiece = null;
          consecutiveErrors = 0;
          continue;
        }

        // Skip if no piece or no queue
        if (!gameState.currentPiece) {
          await this.sleep(50);
          continue;
        }

        // Skip if board state hasn't changed (same piece, no new data)
        const stateKey = `${gameState.currentPiece}:${gameState.currentRotation}:${gameState.currentRow}:${gameState.currentCol}`;
        if (stateKey === this.prevPiece) {
          await this.sleep(30);
          continue;
        }
        this.prevPiece = stateKey;

        // Parse board
        const board = this.ai.parseBoard(gameState.board);

        const aiInput = {
          board,
          currentPiece: gameState.currentPiece,
          queue: (gameState.queue || []).filter(Boolean).slice(0, 6),
          holdPiece: gameState.holdPiece || null,
          combo: gameState.combo || 0,
          b2b: gameState.b2b || false,
        };

        // Compute best move
        const result = this.ai.computeMove(aiInput);

        if (!result || !result.actions || result.actions.length === 0) {
          await this.sleep(50);
          continue;
        }

        // Execute actions
        await this.client.executeActionsfast(result.actions);

        // Track stats
        this.stats.piecesPlaced++;
        if (result.move) {
          if (result.move.linesCleared > 0) this.stats.linesCleared += result.move.linesCleared;
          if (result.move.tspinType) this.stats.tspins++;
          if (result.move.isPC) {
            this.stats.perfectClears++;
            console.log('[Bot] PERFECT CLEAR!');
          }
        }

        if (this.stats.piecesPlaced % 50 === 0) {
          this.printStats(true);
        }

        consecutiveErrors = 0;
        await this.sleep(this.client.options.thinkDelay);
      } catch (err) {
        consecutiveErrors++;
        console.error(`[Bot] Loop error (${consecutiveErrors}/${MAX_ERRORS}):`, err.message);
        if (consecutiveErrors >= MAX_ERRORS) {
          console.error('[Bot] Too many consecutive errors. Stopping.');
          break;
        }
        await this.sleep(200);
      }
    }
  }

  printStats(inline = false) {
    const elapsed = this.stats.startTime ? ((Date.now() - this.stats.startTime) / 1000).toFixed(1) : '?';
    const pps = this.stats.startTime
      ? (this.stats.piecesPlaced / ((Date.now() - this.stats.startTime) / 1000)).toFixed(2)
      : '?';

    const msg = [
      `[Stats] Games: ${this.stats.gamesPlayed}`,
      `Pieces: ${this.stats.piecesPlaced} (${pps}/s)`,
      `Lines: ${this.stats.linesCleared}`,
      `T-spins: ${this.stats.tspins}`,
      `PCs: ${this.stats.perfectClears}`,
      `Time: ${elapsed}s`,
    ].join(' | ');

    console.log(msg);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle graceful shutdown
const bot = new TetrisBot();

process.on('SIGINT', async () => {
  console.log('\n[Bot] Shutting down...');
  bot.running = false;
  bot.printStats();
  await bot.client.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[Bot] Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Bot] Unhandled rejection:', err);
});

bot.start().catch(console.error);
