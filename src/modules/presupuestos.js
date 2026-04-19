// src/modules/presupuestos.js
// Presupuestos mensuales con barra de progreso y rollover acumulativo.

function render() {
  MF.nav.setFabAction(_openAddModal);

  const db  = MF.db.loadData();
  const cur = (db.settings && db.settings.currency) || '$';

  const now      = new Date();
  const month    = now.toISOString().slice(0, 7);
  const monthTxs = db.transactions.filter(t => t.date && t.date.startsWith(month) && t.type === 'expense');

  const spentByCat = {};
  monthTxs.forEach(tx => {
    const cat = tx.cat || '';
    spentByCat[cat] = (spentByCat[cat] || 0) + tx.amount;
  });

  const container = document.getElementById('view-presupuestos');
  if (!container) return;

  if (!db.budgets.length) {
    container.textContent = '';
    container.insertAdjacentHTML('beforeend',
      '<div class="empty-state"><div class="empty-state__icon">' + MF.icons.presupuestos + '</div>'
      + '<div class="empty-state__text">Sin presupuestos. Crea uno con el bot\u00f3n +</div></div>');
    return;
  }

  const rolloverEnabled = (db.settings && db.settings.budgetRollover) || false;
  const monthLabel = now.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  const budgetCardsHTML = db.budgets.map(b =>
    _budgetCardHTML(b, spentByCat[b.cat] || 0, rolloverEnabled, cur)
  ).join('');

  const viewHTML = '<div style="max-width:700px">'
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">'
    + '<h2 style="flex:1">Presupuestos \u2014 ' + MF.nav.esc(monthLabel) + '</h2>'
    + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2)">Rollover'
    + '<label class="toggle"><input type="checkbox" id="toggle-rollover"' + (rolloverEnabled ? ' checked' : '') + '>'
    + '<span class="toggle-slider"></span></label></label>'
    + '</div>'
    + '<div id="budgets-list">' + budgetCardsHTML + '</div>'
    + '</div>';

  container.textContent = '';
  container.insertAdjacentHTML('beforeend', viewHTML);

  document.getElementById('toggle-rollover').addEventListener('change', e => {
    const db2 = MF.db.loadData();
    db2.settings.budgetRollover = e.target.checked;
    MF.db.saveData(db2);
    render();
  });

  document.getElementById('budgets-list')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    if (action === 'edit-budget') _openAddModal(id);
    else if (action === 'del-budget') _deleteBudget(id);
  });
}

function _budgetCardHTML(b, spent, rolloverEnabled, cur) {
  const rollover       = rolloverEnabled ? (b.rollover || 0) : 0;
  const effectiveLimit = (b.limit || 0) + rollover;
  const pct            = effectiveLimit > 0 ? Math.min((spent / effectiveLimit) * 100, 100) : 0;
  const remaining      = effectiveLimit - spent;
  const overBudget     = spent > effectiveLimit;
  const barClass       = overBudget ? 'progress-bar__fill--danger' : pct > 80 ? 'progress-bar__fill--warning' : '';
  const color          = b.color || '#7aa2f7';

  const rolloverLabel = (rolloverEnabled && rollover > 0)
    ? '<span style="font-size:11px;color:var(--text3)">+ ' + MF.nav.esc(MF.nav.formatCurrency(rollover, cur)) + ' rollover</span>'
    : '';

  const statusLabel = overBudget
    ? 'Excedido'
    : 'Disponible: ' + MF.nav.formatCurrency(remaining, cur);

  return '<div class="card" style="margin-bottom:12px">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
    + '<div class="color-dot" style="background:' + MF.nav.esc(color) + ';width:12px;height:12px"></div>'
    + '<div style="flex:1"><div style="font-weight:500">' + MF.nav.esc(b.cat) + '</div>' + rolloverLabel + '</div>'
    + '<div style="text-align:right">'
    + '<span class="amount' + (overBudget ? ' text-expense' : '') + '">' + MF.nav.esc(MF.nav.formatCurrency(spent, cur)) + '</span>'
    + '<span style="color:var(--text3)"> / ' + MF.nav.esc(MF.nav.formatCurrency(effectiveLimit, cur)) + '</span>'
    + '</div>'
    + '<div class="list-item__actions" style="opacity:1">'
    + '<button class="btn-icon" data-action="edit-budget" data-id="' + MF.nav.esc(b.id) + '">' + MF.icons.pencil + '</button>'
    + '<button class="btn-icon" data-action="del-budget"  data-id="' + MF.nav.esc(b.id) + '">' + MF.icons.trash + '</button>'
    + '</div></div>'
    + '<div class="progress-bar"><div class="progress-bar__fill ' + MF.nav.esc(barClass) + '" style="width:' + pct.toFixed(1) + '%;background:' + MF.nav.esc(color) + '"></div></div>'
    + '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:var(--text3)">'
    + '<span>' + MF.nav.esc(statusLabel) + '</span>'
    + '<span>' + pct.toFixed(0) + '%</span>'
    + '</div></div>';
}

function _openAddModal(id) {
  const db     = MF.db.loadData();
  const budget = id ? db.budgets.find(b => b.id === id) : null;

  const defaultCats = ['Alimentación','Transporte','Entretenimiento','Salud','Servicios','Ropa','Hogar','Educación','Otro'];
  const customCats  = (db.categories || []).filter(c => !c.hidden).map(c => c.name);
  const allCats     = defaultCats.concat(customCats.filter(c => !defaultCats.includes(c)));
  const catOptions  = allCats.map(c =>
    '<option value="' + MF.nav.esc(c) + '"' + (budget && budget.cat === c ? ' selected' : '') + '>' + MF.nav.esc(c) + '</option>'
  ).join('');

  const formHTML = '<div class="form-group"><label class="form-label">Categor\u00eda</label>'
    + '<select class="form-select" id="budget-cat">' + catOptions + '</select></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">L\u00edmite mensual</label>'
    + '<input class="form-input" id="budget-limit" type="number" step="0.01" min="0" value="' + (budget ? budget.limit : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">Color</label>'
    + '<input class="form-input" id="budget-color" type="color" value="' + MF.nav.esc(budget ? budget.color : '#7aa2f7') + '" style="height:40px;padding:4px"></div>'
    + '</div>';

  MF.nav.showModal(formHTML, budget ? 'Editar presupuesto' : 'Nuevo presupuesto', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: budget ? 'Guardar' : 'Crear', primary: true, action: () => _saveBudget(id) }
  ]);
}

function _saveBudget(id) {
  const cat   = (document.getElementById('budget-cat') || {}).value;
  const limit = parseFloat((document.getElementById('budget-limit') || {}).value);
  const color = (document.getElementById('budget-color') || {}).value;

  if (!cat)               { MF.nav.toast('Selecciona una categor\u00eda', 'error'); return; }
  if (!limit || limit <= 0) { MF.nav.toast('L\u00edmite inv\u00e1lido', 'error'); return; }

  const db  = MF.db.loadData();
  const now = new Date().toISOString();

  if (id) {
    const idx = db.budgets.findIndex(b => b.id === id);
    if (idx >= 0) db.budgets[idx] = { ...db.budgets[idx], cat, limit, color, updatedAt: now };
  } else {
    if (db.budgets.some(b => b.cat === cat)) {
      MF.nav.toast('Ya existe un presupuesto para esa categor\u00eda', 'error');
      return;
    }
    db.budgets.push({ id: MF.db.generateId(), cat, limit, color, rollover: 0, createdAt: now, updatedAt: now });
  }

  MF.db.saveData(db);
  MF.nav.closeModal();
  MF.nav.toast(id ? 'Presupuesto actualizado' : 'Presupuesto creado');
  render();
}

function _deleteBudget(id) {
  MF.nav.showModal(
    '<p style="color:var(--text2)">\u00bfEliminar este presupuesto?</p>',
    'Eliminar presupuesto',
    [
      { label: 'Cancelar', action: MF.nav.closeModal },
      { label: 'Eliminar', danger: true, action: () => {
        const db = MF.db.loadData();
        db.budgets = db.budgets.filter(b => b.id !== id);
        MF.db.saveData(db);
        MF.nav.closeModal();
        MF.nav.toast('Presupuesto eliminado');
        render();
      }}
    ]
  );
}

// ── Exports ─────────────────────────────────────────────────────────────────

const _presupuestosAPI = { render };

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.presupuestos = _presupuestosAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _presupuestosAPI;
}
