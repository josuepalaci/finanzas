// src/modules/pwa.js
// Registro del Service Worker y manejo del install prompt de PWA.

let _deferredInstallPrompt = null;

function init() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.MF?.nav?.toast('App actualizada. Recarga para ver los cambios.', 'info');
          }
        });
      });
    })
    .catch(err => {
      console.warn('[PWA] SW not registered:', err.message);
    });

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstallPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    _deferredInstallPrompt = null;
  });
}

function canInstall() {
  return _deferredInstallPrompt !== null;
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

async function triggerInstall() {
  if (!_deferredInstallPrompt) return null;
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  return outcome;
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// ── Exports ────────────────────────────────────────────────────────────────

const _pwaAPI = {
  init,
  canInstall,
  isInstalled,
  triggerInstall,
  requestNotificationPermission,
  getNotificationPermission
};

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.pwa = _pwaAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _pwaAPI;
}
