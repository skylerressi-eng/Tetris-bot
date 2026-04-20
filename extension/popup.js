(function () {
  'use strict';

  const els = {
    status: document.getElementById('status'),
    statusText: document.getElementById('status-text'),
    controls: document.getElementById('controls'),
    notTetrio: document.getElementById('not-tetrio'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),
    speed: document.getElementById('speed'),
    speedVal: document.getElementById('speed-value'),
    pieces: document.getElementById('stat-pieces'),
    pps: document.getElementById('stat-pps'),
    lines: document.getElementById('stat-lines'),
    tetrises: document.getElementById('stat-tetrises'),
    tspins: document.getElementById('stat-tspins'),
    pc: document.getElementById('stat-pc'),
  };

  let activeTabId = null;

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  function isTetrio(url) {
    return url && /^https?:\/\/tetr\.io\//.test(url);
  }

  async function send(cmd, payload) {
    if (activeTabId == null) return null;
    try {
      return await chrome.tabs.sendMessage(activeTabId, { __tetrisBot: true, cmd, payload });
    } catch (e) {
      return null;
    }
  }

  function setStatus(cls, text) {
    els.status.className = 'status ' + cls;
    els.statusText.textContent = text;
  }

  function updateUI(status) {
    if (!status) {
      setStatus('status-waiting', 'Waiting for tetr.io…');
      return;
    }
    if (status.running) {
      if (status.hasGameState) setStatus('status-running', 'Playing — bot active');
      else setStatus('status-waiting', 'Bot on — waiting for game');
    } else {
      if (status.hasGameState) setStatus('status-ready', 'Ready — game detected');
      else if (status.gameFound) setStatus('status-ready', 'Game object found');
      else setStatus('status-waiting', 'Start a match in tetr.io');
    }

    els.btnStart.classList.toggle('hidden', status.running);
    els.btnStop.classList.toggle('hidden', !status.running);

    const s = status.stats || {};
    els.pieces.textContent = s.piecesPlaced || 0;
    els.pps.textContent = (s.pps || 0).toFixed(2);
    els.lines.textContent = s.linesCleared || 0;
    els.tetrises.textContent = s.tetrises || 0;
    els.tspins.textContent = s.tspins || 0;
    els.pc.textContent = s.perfectClears || 0;

    if (status.commandInterval) {
      els.speed.value = status.commandInterval;
      els.speedVal.textContent = status.commandInterval + 'ms';
    }
  }

  async function refresh() {
    const resp = await send('getStatus');
    if (resp && resp.status) updateUI(resp.status);
  }

  async function init() {
    const tab = await getActiveTab();
    if (!tab || !isTetrio(tab.url)) {
      els.notTetrio.classList.remove('hidden');
      setStatus('status-error', 'Not on tetr.io');
      return;
    }
    activeTabId = tab.id;
    els.controls.classList.remove('hidden');

    els.btnStart.addEventListener('click', async () => {
      await send('start');
      setTimeout(refresh, 150);
    });
    els.btnStop.addEventListener('click', async () => {
      await send('stop');
      setTimeout(refresh, 150);
    });
    els.speed.addEventListener('input', async () => {
      const v = parseInt(els.speed.value, 10);
      els.speedVal.textContent = v + 'ms';
      await send('setSpeed', { commandInterval: v });
    });

    refresh();
    setInterval(refresh, 750);
  }

  init();
})();
