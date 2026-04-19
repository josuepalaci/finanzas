// src/modules/nav.js
// Hub de navegación: router, tema, FAB, drawer, modal y toast.

// ── Constantes ─────────────────────────────────────────────────────────────

const _SECTION_LABELS = {
  dashboard:      'Dashboard',
  cuentas:        'Cuentas',
  gastos:         'Gastos',
  presupuestos:   'Presupuestos',
  metas:          'Metas',
  deudas:         'Deudas',
  transferencias: 'Transferencias',
  recurrentes:    'Recurrentes',
  reporte:        'Reporte',
  cuotas:         'Cuotas',
  categorias:     'Categorías',
  configuracion:  'Configuración',
  salario:        'Salario'
};

let _currentSection = 'dashboard';
let _fabAction      = null;

// ── Escape helper (XSS prevention) ────────────────────────────────────────
// TODOS los datos del usuario interpolados en HTML deben pasar por esc().

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Inicialización ─────────────────────────────────────────────────────────

function init() {
  _initTheme();
  _initRouter();
  _initFab();
  _initDrawer();
  _initModal();
  _checkReminderBanner();
  _applySystemNotificationOnLoad();
}

// ── Router (hash-based) ────────────────────────────────────────────────────

function _initRouter() {
  window.addEventListener('hashchange', () => {
    const section = location.hash.slice(1) || 'dashboard';
    _showSection(section);
    closeDrawer();
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    const section = btn.dataset.nav;
    if (section === 'mas') return;
    go(section);
  });

  document.getElementById('tab-mas')?.addEventListener('click', openDrawer);

  const initial = location.hash.slice(1) || 'dashboard';
  _showSection(initial);
}

function go(section) {
  if (!_SECTION_LABELS[section]) return;
  if (location.hash.slice(1) === section) {
    _showSection(section);
  } else {
    location.hash = '#' + section;
  }
}

function refresh() {
  _showSection(_currentSection);
}

function _showSection(section) {
  if (!_SECTION_LABELS[section]) section = 'dashboard';

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  const viewEl = document.getElementById('view-' + section);
  if (viewEl) viewEl.classList.add('active');

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === section);
  });

  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = _SECTION_LABELS[section] || section;

  const main = document.getElementById('main-content');
  if (main) main.scrollTop = 0;

  _fabAction = null;

  window.MF[section]?.render?.();

  _currentSection = section;
}

// ── FAB ────────────────────────────────────────────────────────────────────

function _initFab() {
  const fab       = document.getElementById('fab');
  const btnTopbar = document.getElementById('btn-add-topbar');
  const main      = document.getElementById('main-content');
  let   atBottom  = false;

  // On desktop the FAB is CSS-hidden; btn-add-topbar is the primary add button.
  // On mobile, btn-add-topbar replaces the FAB only when the user scrolls to the
  // bottom (so the FAB doesn't overlap content). These two modes are handled
  // separately so that setFabAction() can immediately show/hide the topbar button
  // on desktop without waiting for a scroll event.

  function _syncDesktopBtn() {
    if (!btnTopbar || window.innerWidth < 768) return;
    btnTopbar.style.display = _fabAction ? 'flex' : 'none';
  }

  // Expose so setFabAction (defined below) can call it.
  _initFab._sync = _syncDesktopBtn;

  function updateFabState(isBottom) {
    if (isBottom === atBottom) return;
    atBottom = isBottom;
    // Only manage the mobile swap; desktop is handled by _syncDesktopBtn.
    if (window.innerWidth >= 768) return;

    if (isBottom) {
      fab?.classList.add('fab--hidden');
      if (btnTopbar) btnTopbar.style.display = _fabAction ? 'flex' : 'none';
    } else {
      fab?.classList.remove('fab--hidden');
      if (btnTopbar) btnTopbar.style.display = 'none';
    }
  }

  main?.addEventListener('scroll', () => {
    const nearBottom = main.scrollHeight - main.scrollTop <= main.clientHeight + 48;
    updateFabState(nearBottom);
  });

  // Re-sync when window is resized across the breakpoint.
  window.addEventListener('resize', _syncDesktopBtn);

  function handleAddClick() {
    if (_fabAction) {
      _fabAction();
    } else {
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  fab?.addEventListener('click', handleAddClick);
  btnTopbar?.addEventListener('click', handleAddClick);
}

function setFabAction(fn) {
  _fabAction = fn;
  // Immediately sync the topbar button on desktop (no scroll needed).
  if (typeof _initFab._sync === 'function') _initFab._sync();
}

// ── Drawer móvil ──────────────────────────────────────────────────────────

function _initDrawer() {
  document.getElementById('drawer-overlay')?.addEventListener('click', closeDrawer);
}

function openDrawer() {
  document.getElementById('drawer')?.classList.add('active');
  document.getElementById('drawer-overlay')?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  document.getElementById('drawer')?.classList.remove('active');
  document.getElementById('drawer-overlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

// ── Tema ───────────────────────────────────────────────────────────────────

function _initTheme() {
  let theme = 'dark';
  try {
    const db = window.MF?.db?.loadData?.();
    if (db?.settings?.theme) {
      theme = db.settings.theme;
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light';
    }
  } catch (_) {}

  _applyTheme(theme);
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  _applyTheme(current === 'dark' ? 'light' : 'dark');
}

function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  // MF.icons values are trusted static SVG strings defined in icons.js (not user data)
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.innerHTML = theme === 'dark' ? MF.icons.sun : MF.icons.moon; // trusted static SVG

  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.content = theme === 'dark' ? '#1e1f2e' : '#f5f5ff';

  try {
    const db = window.MF?.db?.loadData?.();
    if (db) {
      db.settings.theme = theme;
      window.MF.db.saveData(db);
    }
  } catch (_) {}
}

// ── Modal ──────────────────────────────────────────────────────────────────

function _initModal() {
  document.getElementById('modal-overlay')?.addEventListener('click', closeModal);
}

function showModal(trustedHTML, title, buttons) {
  const modal = document.getElementById('modal');
  if (!modal) return;

  const header = document.createElement('div');
  header.className = 'modal-header';

  const titleEl = document.createElement('h3');
  titleEl.id = 'modal-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-icon modal-close';
  closeBtn.setAttribute('aria-label', 'Cerrar');
  closeBtn.innerHTML = MF.icons.x; // trusted static SVG
  closeBtn.addEventListener('click', closeModal);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.innerHTML = trustedHTML; // trustedHTML: caller must sanitize user data via esc()

  modal.innerHTML = '';
  modal.appendChild(header);
  modal.appendChild(body);

  if (buttons && buttons.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = `btn ${btn.primary ? 'btn-primary' : btn.danger ? 'btn-danger' : 'btn-ghost'}`;
      el.textContent = btn.label;
      if (btn.action) el.addEventListener('click', btn.action);
      footer.appendChild(el);
    }

    modal.appendChild(footer);
  }

  document.getElementById('modal-overlay')?.classList.add('active');
  modal.classList.add('active');

  setTimeout(() => modal.querySelector('input, select, textarea')?.focus(), 50);
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.remove('active');
  document.getElementById('modal')?.classList.remove('active');
}

// ── Toast ──────────────────────────────────────────────────────────────────

function toast(msg, type) {
  type = type || 'success';
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'toast toast--' + type;
  el.textContent = msg;
  container.appendChild(el);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('toast--visible'));
  });

  setTimeout(() => {
    el.classList.remove('toast--visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 3000);
}

// ── Reminder banner ────────────────────────────────────────────────────────

function _checkReminderBanner() {
  try {
    const db = window.MF?.db?.loadData?.();
    if (!db) return;
    const today = new Date().toISOString().slice(0, 10);
    const hasTx = db.transactions.some(t => t.date === today);
    if (!hasTx) {
      document.getElementById('reminder-banner')?.classList.add('active');
    }
  } catch (_) {}

  document.getElementById('banner-dismiss')?.addEventListener('click', () => {
    document.getElementById('reminder-banner')?.classList.remove('active');
  });
}

// ── Notificación del sistema ───────────────────────────────────────────────

function _applySystemNotificationOnLoad() {
  try {
    const db = window.MF?.db?.loadData?.();
    if (!db?.settings?.reminderEnabled) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const today   = new Date().toISOString().slice(0, 10);
    const hasTx   = db.transactions.some(t => t.date === today);
    if (hasTx) return;

    const [h, m]  = (db.settings.reminderTime || '20:00').split(':').map(Number);
    const now     = new Date();
    const after   = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
    if (!after) return;

    const key = 'mf_notif_' + today;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    new Notification('MisFinanzas', {
      body: 'No has registrado movimientos hoy \uD83D\uDCA1',
      tag:  'mf-daily-reminder'
    });
  } catch (_) {}
}

// ── Helpers de UI reutilizables ────────────────────────────────────────────

function formatCurrency(amount, currency) {
  currency = currency || '$';
  return currency + ' ' + Number(amount || 0).toLocaleString('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('es', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function contrastColor(hexBg) {
  if (!hexBg || hexBg.length < 7) return '#c0caf5';
  const r = parseInt(hexBg.slice(1, 3), 16);
  const g = parseInt(hexBg.slice(3, 5), 16);
  const b = parseInt(hexBg.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#1e1f2e' : '#c0caf5';
}

// ── Exports ────────────────────────────────────────────────────────────────

const _navAPI = {
  init,
  go,
  refresh,
  toggleTheme,
  showModal,
  closeModal,
  toast,
  openDrawer,
  closeDrawer,
  setFabAction,
  formatCurrency,
  formatDate,
  contrastColor,
  esc,
  getCurrentSection: () => _currentSection
};

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.nav = _navAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _navAPI;
}
