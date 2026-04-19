// src/modules/cuentas.js
// CRUD de cuentas bancarias y tarjetas de crédito.

const ACC_TYPES = { savings: 'Ahorros', checking: 'Corriente', cash: 'Efectivo', other: 'Otro' };

// ── render ──────────────────────────────────────────────────────────────────

function render() {
  MF.nav.setFabAction(_openAddTypeModal);

  const db  = MF.db.loadData();
  const cur = (db.settings && db.settings.currency) || '$';

  const totalBalance = db.accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const totalDebt    = db.cards.reduce((s, c)    => s + (c.balance || 0), 0);

  const accountsHTML = db.accounts.length
    ? db.accounts.map(a => _accountItemHTML(a, cur)).join('')
    : _emptyStateHTML('No tienes cuentas registradas');

  const cardsHTML = db.cards.length
    ? db.cards.map(c => _cardItemHTML(c, cur)).join('')
    : _emptyStateHTML('No tienes tarjetas registradas');

  const viewHTML = '<div style="max-width:700px">'
    + '<div class="card-grid" style="margin-bottom:20px">'
    + '<div class="card"><div class="card-title">Total en cuentas</div>'
    + '<div class="card-value" style="margin-top:8px;color:var(--income)">'
    + MF.nav.esc(MF.nav.formatCurrency(totalBalance, cur)) + '</div></div>'
    + '<div class="card"><div class="card-title">Deuda tarjetas</div>'
    + '<div class="card-value" style="margin-top:8px;color:var(--expense)">'
    + MF.nav.esc(MF.nav.formatCurrency(totalDebt, cur)) + '</div></div>'
    + '</div>'
    + '<div class="section-header"><h2>Cuentas</h2></div>'
    + '<div id="list-accounts">' + accountsHTML + '</div>'
    + '<div class="section-header" style="margin-top:24px"><h2>Tarjetas de cr\u00e9dito</h2></div>'
    + '<div id="list-cards">' + cardsHTML + '</div>'
    + '</div>';

  const container = document.getElementById('view-cuentas');
  if (!container) return;
  container.textContent = '';
  container.insertAdjacentHTML('beforeend', viewHTML);

  document.getElementById('list-accounts')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    if (action === 'edit-account')     _openAccountModal(id);
    else if (action === 'del-account') _deleteAccount(id);
  });

  document.getElementById('list-cards')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    if (action === 'edit-card')     _openCardModal(id);
    else if (action === 'del-card') _deleteCard(id);
  });
}

// ── Templates ────────────────────────────────────────────────────────────────

function _accountItemHTML(a, cur) {
  const bg = a.color || '#7aa2f7';
  return '<div class="list-item">'
    + '<div class="list-item__icon" style="background:' + MF.nav.esc(bg) + '">' + MF.icons.cuentas + '</div>'
    + '<div class="list-item__content">'
    + '<div class="list-item__title">' + MF.nav.esc(a.name) + '</div>'
    + '<div class="list-item__sub">' + MF.nav.esc(ACC_TYPES[a.type] || a.type) + '</div>'
    + '</div>'
    + '<div class="list-item__amount text-income">' + MF.nav.esc(MF.nav.formatCurrency(a.balance, cur)) + '</div>'
    + '<div class="list-item__actions">'
    + '<button class="btn-icon" data-action="edit-account" data-id="' + MF.nav.esc(a.id) + '" title="Editar">' + MF.icons.pencil + '</button>'
    + '<button class="btn-icon" data-action="del-account"  data-id="' + MF.nav.esc(a.id) + '" title="Eliminar">' + MF.icons.trash + '</button>'
    + '</div></div>';
}

function _cardItemHTML(c, cur) {
  const used     = ((c.balance || 0) / Math.max(c.limit || 1, 1)) * 100;
  const barClass = used > 90 ? 'progress-bar__fill--danger' : used > 70 ? 'progress-bar__fill--warning' : '';
  return '<div class="list-item" style="flex-direction:column;align-items:stretch;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:12px">'
    + '<div class="list-item__icon" style="background:' + MF.nav.esc(c.color || '#bb9af7') + '">' + MF.icons.deudas + '</div>'
    + '<div class="list-item__content">'
    + '<div class="list-item__title">' + MF.nav.esc(c.name) + '</div>'
    + '<div class="list-item__sub">Cierra d\u00eda ' + MF.nav.esc(String(c.closeDay || '?')) + '</div>'
    + '</div>'
    + '<div style="text-align:right">'
    + '<div class="amount text-expense">' + MF.nav.esc(MF.nav.formatCurrency(c.balance, cur)) + '</div>'
    + '<div style="font-size:11px;color:var(--text3)">de ' + MF.nav.esc(MF.nav.formatCurrency(c.limit, cur)) + '</div>'
    + '</div>'
    + '<div class="list-item__actions" style="opacity:1">'
    + '<button class="btn-icon" data-action="edit-card" data-id="' + MF.nav.esc(c.id) + '">' + MF.icons.pencil + '</button>'
    + '<button class="btn-icon" data-action="del-card"  data-id="' + MF.nav.esc(c.id) + '">' + MF.icons.trash + '</button>'
    + '</div></div>'
    + '<div class="progress-bar"><div class="progress-bar__fill ' + MF.nav.esc(barClass) + '" style="width:' + Math.min(used, 100).toFixed(1) + '%"></div></div>'
    + '</div>';
}

function _emptyStateHTML(msg) {
  return '<div class="empty-state"><div class="empty-state__icon">' + MF.icons.cuentas + '</div>'
    + '<div class="empty-state__text">' + MF.nav.esc(msg) + '</div></div>';
}

// ── Modal: tipo ───────────────────────────────────────────────────────────────

function _openAddTypeModal() {
  MF.nav.showModal(
    '<p style="color:var(--text2)">\u00bfQu\u00e9 deseas agregar?</p>',
    'Nueva entrada',
    [
      { label: 'Cancelar', action: MF.nav.closeModal },
      { label: 'Cuenta bancaria', action: () => { MF.nav.closeModal(); _openAccountModal(); } },
      { label: 'Tarjeta de cr\u00e9dito', primary: true, action: () => { MF.nav.closeModal(); _openCardModal(); } }
    ]
  );
}

// ── Modal: cuenta ─────────────────────────────────────────────────────────────

function _openAccountModal(id) {
  const db  = MF.db.loadData();
  const acc = id ? db.accounts.find(a => a.id === id) : null;

  const typeOptions = Object.entries(ACC_TYPES).map(([k, v]) =>
    '<option value="' + MF.nav.esc(k) + '"' + (acc && acc.type === k ? ' selected' : '') + '>'
    + MF.nav.esc(v) + '</option>'
  ).join('');

  const formHTML = '<div class="form-group"><label class="form-label">Nombre</label>'
    + '<input class="form-input" id="acc-name" value="' + MF.nav.esc(acc ? acc.name : '') + '" placeholder="ej: Cuenta corriente"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Tipo</label>'
    + '<select class="form-select" id="acc-type">' + typeOptions + '</select></div>'
    + '<div class="form-group"><label class="form-label">Saldo</label>'
    + '<input class="form-input" id="acc-balance" type="number" step="0.01" value="' + (acc ? acc.balance : 0) + '"></div>'
    + '</div>'
    + '<div class="form-group"><label class="form-label">Color</label>'
    + '<input class="form-input" id="acc-color" type="color" value="' + MF.nav.esc(acc ? acc.color : '#7aa2f7') + '" style="height:40px;padding:4px"></div>';

  MF.nav.showModal(formHTML, acc ? 'Editar cuenta' : 'Nueva cuenta', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: acc ? 'Guardar' : 'Crear', primary: true, action: () => _saveAccount(id) }
  ]);
}

function _saveAccount(id) {
  const name    = (document.getElementById('acc-name') || {}).value?.trim() || '';
  const type    = (document.getElementById('acc-type') || {}).value;
  const balance = parseFloat((document.getElementById('acc-balance') || {}).value) || 0;
  const color   = (document.getElementById('acc-color') || {}).value;

  if (!name) { MF.nav.toast('El nombre es requerido', 'error'); return; }

  const db  = MF.db.loadData();
  const now = new Date().toISOString();

  if (id) {
    const idx = db.accounts.findIndex(a => a.id === id);
    if (idx >= 0) db.accounts[idx] = { ...db.accounts[idx], name, type, balance, color, updatedAt: now };
  } else {
    db.accounts.push({ id: MF.db.generateId(), name, type, balance, color, createdAt: now, updatedAt: now });
  }

  MF.db.saveData(db);
  MF.nav.closeModal();
  MF.nav.toast(id ? 'Cuenta actualizada' : 'Cuenta creada');
  render();
}

function _deleteAccount(id) {
  MF.nav.showModal(
    '<p style="color:var(--text2)">\u00bfEliminar esta cuenta? Las transacciones asociadas no se eliminan.</p>',
    'Eliminar cuenta',
    [
      { label: 'Cancelar', action: MF.nav.closeModal },
      { label: 'Eliminar', danger: true, action: () => {
        const db = MF.db.loadData();
        db.accounts = db.accounts.filter(a => a.id !== id);
        MF.db.saveData(db);
        MF.nav.closeModal();
        MF.nav.toast('Cuenta eliminada');
        render();
      }}
    ]
  );
}

// ── Modal: tarjeta ────────────────────────────────────────────────────────────

function _openCardModal(id) {
  const db   = MF.db.loadData();
  const card = id ? db.cards.find(c => c.id === id) : null;

  const formHTML = '<div class="form-group"><label class="form-label">Nombre</label>'
    + '<input class="form-input" id="card-name" value="' + MF.nav.esc(card ? card.name : '') + '" placeholder="ej: Visa Platinum"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">L\u00edmite</label>'
    + '<input class="form-input" id="card-limit" type="number" step="0.01" value="' + (card ? card.limit : 0) + '"></div>'
    + '<div class="form-group"><label class="form-label">Saldo actual</label>'
    + '<input class="form-input" id="card-balance" type="number" step="0.01" value="' + (card ? card.balance : 0) + '"></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">D\u00eda de cierre</label>'
    + '<input class="form-input" id="card-closeday" type="number" min="1" max="31" value="' + (card ? (card.closeDay || 15) : 15) + '"></div>'
    + '<div class="form-group"><label class="form-label">Color</label>'
    + '<input class="form-input" id="card-color" type="color" value="' + MF.nav.esc(card ? card.color : '#bb9af7') + '" style="height:40px;padding:4px"></div>'
    + '</div>';

  MF.nav.showModal(formHTML, card ? 'Editar tarjeta' : 'Nueva tarjeta', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: card ? 'Guardar' : 'Crear', primary: true, action: () => _saveCard(id) }
  ]);
}

function _saveCard(id) {
  const name     = (document.getElementById('card-name') || {}).value?.trim() || '';
  const limit    = parseFloat((document.getElementById('card-limit') || {}).value) || 0;
  const balance  = parseFloat((document.getElementById('card-balance') || {}).value) || 0;
  const closeDay = parseInt((document.getElementById('card-closeday') || {}).value) || 15;
  const color    = (document.getElementById('card-color') || {}).value;

  if (!name) { MF.nav.toast('El nombre es requerido', 'error'); return; }

  const db  = MF.db.loadData();
  const now = new Date().toISOString();

  if (id) {
    const idx = db.cards.findIndex(c => c.id === id);
    if (idx >= 0) db.cards[idx] = { ...db.cards[idx], name, limit, balance, closeDay, color, updatedAt: now };
  } else {
    db.cards.push({ id: MF.db.generateId(), name, limit, balance, closeDay, color, createdAt: now, updatedAt: now });
  }

  MF.db.saveData(db);
  MF.nav.closeModal();
  MF.nav.toast(id ? 'Tarjeta actualizada' : 'Tarjeta creada');
  render();
}

function _deleteCard(id) {
  MF.nav.showModal(
    '<p style="color:var(--text2)">\u00bfEliminar esta tarjeta?</p>',
    'Eliminar tarjeta',
    [
      { label: 'Cancelar', action: MF.nav.closeModal },
      { label: 'Eliminar', danger: true, action: () => {
        const db = MF.db.loadData();
        db.cards = db.cards.filter(c => c.id !== id);
        MF.db.saveData(db);
        MF.nav.closeModal();
        MF.nav.toast('Tarjeta eliminada');
        render();
      }}
    ]
  );
}

// ── Exports ─────────────────────────────────────────────────────────────────

const _cuentasAPI = { render };

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.cuentas = _cuentasAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _cuentasAPI;
}
