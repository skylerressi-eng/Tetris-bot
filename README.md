# Tetris Bot for tetr.io

Top-tier AI bot that plays tetr.io automatically. Uses beam search (depth 6, width 150) with correct SRS wall kicks, T-spin detection, and perfect-clear recognition.

---

## Quick Install (Chrome Extension — no terminal needed)

**1. Download the code**

- Click the green **Code** button on GitHub → **Download ZIP**
- Unzip the file somewhere you'll remember

**2. Load the extension in Chrome**

- Open Chrome and go to `chrome://extensions/`
- Turn on **Developer mode** (top-right toggle)
- Click **Load unpacked**
- Select the **`extension`** folder from the unzipped download

**3. Play**

- Go to [tetr.io](https://tetr.io/) and start any solo match (Sprint, Blitz, Zen, etc.)
- Click the Tetris Bot icon in your Chrome toolbar
- Click **▶ Start Bot**
- Keep the tetr.io tab focused — the bot plays automatically

**4. (Optional) Max Speed Settings in tetr.io**

- In tetr.io: Settings → Handling
- Set: `DAS = 0`, `ARR = 0`, `SDF = 41`

The bot works without these, but these make inputs execute as fast as the game allows.

---

## Popup Controls

- **Start / Stop** — run the bot on demand
- **Speed slider** — ms between keypresses (lower = faster, default 25ms)
- **Stats** — pieces placed, PPS (pieces per second), lines cleared, tetrises, T-spins, perfect clears

---

## How It Works

| Component | What it does |
|---|---|
| `extension/bot-core.js` | The AI: SRS rotation, BFS placement search, 6-piece lookahead beam search, evaluator tuned for attack meta |
| `extension/injected.js` | Runs in tetr.io's page context; reads game state each tick, computes best move, dispatches keyboard events |
| `extension/content.js` | Bridges the popup and the injected page script |
| `extension/popup.html/js/css` | UI to start/stop and show stats |

**AI evaluation rewards:** perfect clears (huge), T-spins, tetrises, combos, back-to-back bonuses.
**Penalizes:** holes, stack height, bumpiness, covered cells, row/column transitions.

---

## Alternative: Node.js / Puppeteer Version

If you prefer running headless or via terminal, the original `src/` folder has a Puppeteer-based version.

```bash
npm install
npm start              # visual mode
npm start -- --headless
```

(Requires Node.js 18+ and Chrome/Chromium.)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Popup says "Start a match in tetr.io" forever | Click into the game, start a match, keep tab focused |
| Bot doesn't place pieces | tetr.io may need tab focus — click the game canvas once |
| Popup says "Not on tetr.io" | Navigate to `https://tetr.io/` in the active tab |
| Extension won't load | Chrome → `chrome://extensions/` → enable **Developer mode** first |
| Bot can't see the game state | tetr.io occasionally changes internal structure; the heuristic scanner may need an update |

---

## Notes

- Use solo modes (Sprint, Blitz, Zen, 40L) to practice/benchmark. Multiplayer automation may violate tetr.io's TOS — use at your own risk.
- The AI runs entirely in your browser. No data leaves your machine.
