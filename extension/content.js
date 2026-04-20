// Content script — runs in isolated world, bridges popup and the injected page-world script.
(function () {
  'use strict';

  if (window.__TETRIO_BOT_CONTENT__) return;
  window.__TETRIO_BOT_CONTENT__ = true;

  // Inject bot-core.js and injected.js into the page's main world so they can
  // access tetr.io's internal JS objects and dispatch trusted-feeling events.
  function injectScript(file) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(file);
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error('Failed to load ' + file)); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  (async () => {
    try {
      await injectScript('bot-core.js');
      await injectScript('injected.js');
    } catch (e) {
      console.error('[TetrisBot content]', e);
    }
  })();

  let latestStatus = null;

  // Listen for status updates from injected script
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.__tetrisBot !== 'from-page') return;
    if (data.cmd === 'status') latestStatus = data.payload;
  });

  // Relay commands from popup to page
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.__tetrisBot) return;
    if (msg.cmd === 'getStatus') {
      sendResponse({ status: latestStatus });
      // Request a fresh status from page
      window.postMessage({ __tetrisBot: 'to-page', cmd: 'status' }, '*');
      return true;
    }
    // Forward other commands (start/stop/setSpeed) to the injected script
    window.postMessage({ __tetrisBot: 'to-page', cmd: msg.cmd, payload: msg.payload }, '*');
    sendResponse({ ok: true });
    return true;
  });
})();
