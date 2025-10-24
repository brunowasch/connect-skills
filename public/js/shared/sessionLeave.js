(function() {
    (function loadConfig() {
    try {
      const el = document.getElementById('cs-config');
      if (!el) return;
      const cfg = JSON.parse(el.textContent || '{}');
      window.CS_REMEMBER = !!cfg.CS_REMEMBER;
    } catch (_) {
      window.CS_REMEMBER = false;
    }
  })();

  let internalNav = false;

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    try {
      const url = new URL(a.href, window.location.href);
      if (url.origin === window.location.origin) {
        internalNav = true;
        setTimeout(() => { internalNav = false; }, 1500);
      }
    } catch (_) {}
  }, true);

  document.addEventListener('submit', () => {
    internalNav = true;
    setTimeout(() => { internalNav = false; }, 1500);
  }, true);

  window.addEventListener('pagehide', () => {
    if (internalNav) return;

    if (window.CS_REMEMBER) return;

    try {
      fetch('/usuarios/_leave', {
        method: 'POST',
        keepalive: true,
        headers: {
          'X-External-Leave': '1',
          'Content-Type': 'text/plain'
        },
        body: '1'
      });
    } catch (_) {}
  });
})();
