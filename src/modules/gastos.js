// src/modules/gastos.js
// Transacciones con búsqueda en tiempo real, filtro de fechas y CRUD con nota.

let _allTxs   = [];
let _query    = '';
let _fromDate = '';
let _toDate   = '';
let _db       = null;

const CAT_ICON_KEYS = {
  'Alimentación': 'food', 'Transporte': 'car',
  'Entretenimiento': 'film', 'Salud': 'health',
  'Servicios': 'bolt', 'Ropa': 'shirt',
  'Ingresos': 'gastos'
};

function _catIcon(cat) { return MF.icons[CAT_ICON_KEYS[cat]] || MF.icons.gastos; }

// ── render ──────────────────────────────────────────────────────────────────

function render() {
  MF.nav.setFabAction(_openAddModal);

  _db = MF.db.loadData();

  const now  = new Date();
  const y    = now.getFullYear();
  const m    = String(now.getMonth() + 1).padStart(2, '0');
  _fromDate = y + '-' + m + '-01';
  _toDate   = now.toISOString().slice(0, 10);
  _query    = '';

  _allTxs = _db.transactions.slice().sort((a, b) => b.date.localeCompare(a.date));

  const container = document.getElementById('view-gastos');
  if (!container) return;

  const shellHTML = '<div style="max-width:700px">'
    + '<div class="search-bar"><span style="color:var(--text3)">' + MF.icons.reporte + '</span>'
    + '<input id="gastos-search" type="text" placeholder="Buscar transacciones\u2026" autocomplete="off"></div>'
    + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">'
    + '<label style="font-size:12px;color:var(--text3)">Desde</label>'
    + '<input class="form-input" id="gastos-from" type="date" value="' + MF.nav.esc(_fromDate) + '" style="width:auto;flex:0">'
    + '<label style="font-size:12px;color:var(--text3)">Hasta</label>'
    + '<input class="form-input" id="gastos-to" type="date" value="' + MF.nav.esc(_toDate) + '" style="width:auto;flex:0">'
    + '<button class="btn btn-ghost" id="gastos-clear-dates" style="font-size:12px">Todo</button>'
    + '</div>'
    + '<div id="gastos-list"></div>'
    + '</div>';

  container.textContent = '';
  container.insertAdjacentHTML('beforeend', shellHTML);

  _renderList();

  document.getElementById('gastos-search').addEventListener('input', e => {
    _query = e.target.value.toLowerCase();
    _renderList();
  });

  document.getElementById('gastos-from').addEventListener('change', e => {
    _fromDate = e.target.value;
    _renderList();
  });

  document.getElementById('gastos-to').addEventListener('change', e => {
    _toDate = e.target.value;
    _renderList();
  });

  document.getElementById('gastos-clear-dates').addEventListener('click', () => {
    _fromDate = '';
    _toDate   = '';
    document.getElementById('gastos-from').value = '';
    document.getElementById('gastos-to').value   = '';
    _renderList();
  });

  document.getElementById('gastos-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    if (action === 'edit-tx') _openAddModal(id);
    else if (action === 'del-tx') _deleteTx(id);
  });
}

// ── Renderizar lista filtrada ────────────────────────────────────────────────

function _renderList() {
  const list = document.getElementById('gastos-list');
  if (!list) return;

  const filtered = _allTxs.filter(tx => {
    if (_fromDate && tx.date < _fromDate) return false;
    if (_toDate   && tx.date > _toDate)   return false;
    if (_query) {
      const hay = ((tx.desc || '') + ' ' + (tx.cat || '') + ' ' + (tx.note || '')).toLowerCase();
      if (!hay.includes(_query)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    list.textContent = '';
    list.insertAdjacentHTML('beforeend',
      '<div class="empty-state"><div class="empty-state__icon">' + MF.icons.reporte + '</div>'
      + '<div class="empty-state__text">Sin resultados</div></div>');
    return;
  }

  const byDate = {};
  filtered.forEach(tx => {
    if (!byDate[tx.date]) byDate[tx.date] = [];
    byDate[tx.date].push(tx);
  });

  const cur = (_db && _db.settings && _db.settings.currency) || '$';
  const accountNames = {};
  ((_db && _db.accounts) || []).forEach(a => { accountNames[a.id] = a.name; });

  let html = '';
  Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([date, txs]) => {
      html += '<div style="font-size:12px;color:var(--text3);margin:12px 0 6px;font-weight:500">'
            + MF.nav.esc(_dateLabel(date)) + '</div>';
      txs.forEach(tx => {
        const isIncome  = tx.type === 'income';
        const sign      = isIncome ? '+' : '\u2212';
        const amtColor  = isIncome ? 'var(--income)' : 'var(--expense)';
        const accName   = accountNames[tx.account] ? ' \u00b7 ' + MF.nav.esc(accountNames[tx.account]) : '';
        const noteLabel = tx.note ? ' \u00b7 <em>' + MF.nav.esc(tx.note) + '</em>' : '';
        html += '<div class="list-item">'
          + '<div class="list-item__icon" style="background:var(--bg3)">' + _catIcon(tx.cat) + '</div>'
          + '<div class="list-item__content">'
          + '<div class="list-item__title">' + MF.nav.esc(tx.desc) + '</div>'
          + '<div class="list-item__sub">' + MF.nav.esc(tx.cat || 'Sin categor\u00eda') + accName + noteLabel + '</div>'
          + '</div>'
          + '<div class="list-item__amount" style="color:' + amtColor + '">'
          + sign + ' ' + MF.nav.esc(MF.nav.formatCurrency(tx.amount, cur)) + '</div>'
          + '<div class="list-item__actions">'
          + '<button class="btn-icon" data-action="edit-tx" data-id="' + MF.nav.esc(tx.id) + '" title="Editar">' + MF.icons.pencil + '</button>'
          + '<button class="btn-icon" data-action="del-tx"  data-id="' + MF.nav.esc(tx.id) + '" title="Eliminar">' + MF.icons.trash + '</button>'
          + '</div></div>';
      });
    });

  list.textContent = '';
  list.insertAdjacentHTML('beforeend', html);
}

function _dateLabel(isoDate) {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (isoDate === today)     return 'Hoy';
  if (isoDate === yesterday) return 'Ayer';
  return MF.nav.formatDate(isoDate);
}

// ── Modal de transacción ──────────────────────────────────────────────────────

function _openAddModal(id) {
  _db = MF.db.loadData();
  const tx = id ? _db.transactions.find(t => t.id === id) : null;

  const accOptions = _db.accounts.map(a =>
    '<option value="' + MF.nav.esc(a.id) + '"' + (tx && tx.account === a.id ? ' selected' : '') + '>'
    + MF.nav.esc(a.name) + '</option>'
  ).join('');

  const today       = new Date().toISOString().slice(0, 10);
  const defaultCats = ['Alimentación','Transporte','Entretenimiento','Salud','Servicios','Ropa','Hogar','Educación','Ingresos','Otro'];
  const customCats  = (_db.categories || []).filter(c => !c.hidden).map(c => c.name);
  const allCats     = defaultCats.concat(customCats.filter(c => !defaultCats.includes(c)));

  const catOptions = allCats.map(c =>
    '<option value="' + MF.nav.esc(c) + '"' + (tx && tx.cat === c ? ' selected' : '') + '>' + MF.nav.esc(c) + '</option>'
  ).join('');

  const formHTML = '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Tipo</label>'
    + '<select class="form-select" id="tx-type">'
    + '<option value="expense"' + (!tx || tx.type === 'expense' ? ' selected' : '') + '>Gasto</option>'
    + '<option value="income"'  + (tx && tx.type === 'income' ? ' selected' : '') + '>Ingreso</option>'
    + '</select></div>'
    + '<div class="form-group"><label class="form-label">Fecha</label>'
    + '<input class="form-input" id="tx-date" type="date" value="' + MF.nav.esc(tx ? tx.date : today) + '"></div>'
    + '</div>'
    + '<div class="form-group"><label class="form-label">Descripci\u00f3n</label>'
    + '<input class="form-input" id="tx-desc" value="' + MF.nav.esc(tx ? tx.desc : '') + '" placeholder="ej: Supermercado"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Monto</label>'
    + '<input class="form-input" id="tx-amount" type="number" step="0.01" min="0" value="' + (tx ? tx.amount : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">Categor\u00eda</label>'
    + '<select class="form-select" id="tx-cat">' + catOptions + '</select></div>'
    + '</div>'
    + '<div class="form-group"><label class="form-label">Cuenta</label>'
    + '<select class="form-select" id="tx-account">' + accOptions + '</select></div>'
    + '<div class="form-group"><label class="form-label">Nota (opcional)</label>'
    + '<textarea class="form-textarea" id="tx-note" rows="2" placeholder="Detalles adicionales\u2026">'
    + MF.nav.esc(tx ? tx.note : '') + '</textarea></div>';

  MF.nav.showModal(formHTML, tx ? 'Editar transacci\u00f3n' : 'Nueva transacci\u00f3n', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: tx ? 'Guardar' : 'Agregar', primary: true, action: () => _saveTx(id) }
  ]);
}

function _saveTx(id) {
  const desc    = ((document.getElementById('tx-desc') || {}).value || '').trim();
  const amount  = parseFloat((document.getElementById('tx-amount') || {}).value);
  const date    = (document.getElementById('tx-date') || {}).value;
  const type    = (document.getElementById('tx-type') || {}).value;
  const cat     = (document.getElementById('tx-cat') || {}).value;
  const account = (document.getElementById('tx-account') || {}).value;
  const note    = ((document.getElementById('tx-note') || {}).value || '').trim();

  if (!desc)               { MF.nav.toast('Descripci\u00f3n requerida', 'error'); return; }
  if (!amount || amount <= 0) { MF.nav.toast('Monto inv\u00e1lido', 'error'); return; }
  if (!date)               { MF.nav.toast('Fecha requerida', 'error'); return; }

  const db  = MF.db.loadData();
  const now = new Date().toISOString();

  if (id) {
    const idx = db.transactions.findIndex(t => t.id === id);
    if (idx >= 0) db.transactions[idx] = { ...db.transactions[idx], desc, amount, date, type, cat, account, note, updatedAt: now };
  } else {
    db.transactions.push({ id: MF.db.generateId(), desc, amount, date, type, cat, account, note, createdAt: now, updatedAt: now });
  }

  MF.db.saveData(db);
  MF.nav.closeModal();
  MF.nav.toast(id ? 'Transacci\u00f3n actualizada' : 'Transacci\u00f3n guardada');
  render();
}

function _deleteTx(id) {
  MF.nav.showModal(
    '<p style="color:var(--text2)">\u00bfEliminar esta transacci\u00f3n?</p>',
    'Eliminar',
    [
      { label: 'Cancelar', action: MF.nav.closeModal },
      { label: 'Eliminar', danger: true, action: () => {
        const db = MF.db.loadData();
        db.transactions = db.transactions.filter(t => t.id !== id);
        MF.db.saveData(db);
        MF.nav.closeModal();
        MF.nav.toast('Transacci\u00f3n eliminada');
        render();
      }}
    ]
  );
}

// ── Exports ─────────────────────────────────────────────────────────────────

const _gastosAPI = { render };

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.gastos = _gastosAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _gastosAPI;
}
