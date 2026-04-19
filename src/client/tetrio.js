'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const INJECT_SCRIPT = fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8');

const TETRIO_URL = 'https://tetr.io/';

// tetr.io recommended speed settings (set these in game config before bot starts)
const SPEED_CONFIG = {
  das: 0,    // Delayed Auto Shift (ms) - min for max speed
  arr: 0,    // Auto Repeat Rate (ms) - min
  sdf: 41,   // Soft Drop Factor - 41 = instant (max in tetr.io)
};

class TetrioClient {
  constructor(options = {}) {
    this.options = {
      headless: options.headless || false,
      moveDelay: options.moveDelay || 30,       // ms between individual key presses
      thinkDelay: options.thinkDelay || 10,     // ms to wait for AI computation
      username: options.username || null,
      password: options.password || null,
      ...options,
    };
    this.browser = null;
    this.page = null;
    this.running = false;
  }

  async launch() {
    console.log('[Client] Launching browser...');
    this.browser = await puppeteer.launch({
      headless: this.options.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--window-size=1280,800',
        '--disable-features=VizDisplayCompositor',
        '--autoplay-policy=no-user-gesture-required',
      ],
      defaultViewport: { width: 1280, height: 800 },
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    );

    // Inject script before page loads
    await this.page.evaluateOnNewDocument(INJECT_SCRIPT);

    console.log('[Client] Navigating to tetr.io...');
    await this.page.goto(TETRIO_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await this.sleep(2000);

    console.log('[Client] tetr.io loaded.');
    return this.page;
  }

  // Wait for game to be in active state
  async waitForGame(timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ready = await this.page.evaluate(() =>
        window.__TETRIO_BOT__ && window.__TETRIO_BOT__.ready &&
        window.__TETRIO_BOT__.gameState !== null
      );
      if (ready) return true;
      await this.sleep(200);
    }
    throw new Error('Timed out waiting for game state');
  }

  // Read current game state from page
  async getGameState() {
    return this.page.evaluate(() => {
      const bot = window.__TETRIO_BOT__;
      if (!bot || !bot.gameState) return null;
      return JSON.parse(JSON.stringify(bot.gameState));
    });
  }

  // Execute a sequence of actions
  async executeActions(actions, delay) {
    const d = delay || this.options.moveDelay;
    for (const action of actions) {
      await this.page.evaluate((act) => {
        window.__TETRIO_BOT__.queueActions([act]);
      }, action);
      await this.sleep(d);
    }
  }

  // Execute actions at max speed by queueing all at once
  async executeActionsfast(actions) {
    await this.page.evaluate((acts) => {
      window.__TETRIO_BOT__.queueActions(acts);
    }, actions);
    // Wait for queue to drain
    const waitMs = actions.length * this.options.moveDelay + 100;
    await this.sleep(waitMs);
  }

  // Click the play button / start game
  async startGame(mode = 'solo') {
    console.log('[Client] Starting game...');
    try {
      // Try clicking solo/sprint mode
      await this.page.evaluate(() => {
        // Look for play buttons
        const buttons = Array.from(document.querySelectorAll('button, [role="button"], .button, .btn'));
        const playBtn = buttons.find(b =>
          b.textContent && (
            b.textContent.toLowerCase().includes('play') ||
            b.textContent.toLowerCase().includes('solo') ||
            b.textContent.toLowerCase().includes('sprint')
          )
        );
        if (playBtn) playBtn.click();
      });
      await this.sleep(1000);
    } catch (e) {
      console.warn('[Client] Could not find play button:', e.message);
    }
  }

  // Press Enter to start/restart
  async pressEnter() {
    await this.page.keyboard.press('Enter');
    await this.sleep(500);
  }

  // Check if game is over
  async isGameOver() {
    const state = await this.getGameState();
    return !state || !state.alive;
  }

  // Gracefully close browser
  async close() {
    this.running = false;
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Configure tetr.io game settings for max speed via the settings menu
  async configureSpeed() {
    console.log('[Client] Configuring speed settings...');
    try {
      await this.page.evaluate(() => {
        // Try to find and set DAS/ARR/SDF settings
        // These are stored in localStorage in tetr.io
        const cfg = JSON.parse(localStorage.getItem('tetrio_config') || '{}');
        cfg.handling = cfg.handling || {};
        cfg.handling.das = 0;
        cfg.handling.arr = 0;
        cfg.handling.sdf = 41; // instant soft drop
        cfg.handling.dcd = 0;  // DAS Cancel Delay
        localStorage.setItem('tetrio_config', JSON.stringify(cfg));
      });
    } catch (e) {
      console.warn('[Client] Could not configure speed settings:', e.message);
    }
  }

  // Take screenshot for debugging
  async screenshot(filepath) {
    await this.page.screenshot({ path: filepath || 'debug.png' });
  }
}

module.exports = TetrioClient;
