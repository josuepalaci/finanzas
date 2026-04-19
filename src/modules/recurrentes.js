// src/modules/recurrentes.js
// Gastos recurrentes con alerta de vencidos en el mes actual.

function render() {
  MF.nav.setFabAction(_openAddModal);
  var db  = MF.db.loadData();
  var cur = (db.settings && db.settings.currency) || '$';

  var today     = new Date();
  var month     = today.toISOString().slice(0, 7);
  var dayOfMonth = today.getDate();

  var overdueIds = new Set();
  db.recurring.forEach(function(r) {
    if ((r.day || 1) > dayOfMonth) return;
    var registered = db.transactions.some(function(t) {
      return t.date.startsWith(month) && t.desc === r.desc && t.cat === r.cat;
    });
    if (!registered) overdueIds.add(r.id);
  });

  var alertHTML = overdueIds.size > 0
    ? '<div style="background:color-mix(in srgb,var(--warning) 10%,transparent);border:1px solid color-mix(in srgb,var(--warning) 30%,transparent);'
      + 'border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;font-size:13px;color:var(--text2);display:flex;align-items:center;gap:6px">'
      + MF.icons.warning + ' ' + overdueIds.size + ' gasto' + (overdueIds.size !== 1 ? 's' : '') + ' recurrente' + (overdueIds.size !== 1 ? 's' : '') + ' vencido' + (overdueIds.size !== 1 ? 's' : '') + ' sin registrar este mes.</div>'
    : '';

  var accountNames = {};
  db.accounts.forEach(function(a) { accountNames[a.id] = a.name; });

  var listHTML = db.recurring.length ? db.recurring.map(function(r) {
    var overdue = overdueIds.has(r.id);
    return '<div class="list-item"' + (overdue ? ' style="border-color:var(--warning)"' : '') + '>'
      + '<div class="list-item__icon" style="background:var(--bg3)">' + MF.icons.recurrentes + '</div>'
      + '<div class="list-item__content">'
      + '<div class="list-item__title">' + MF.nav.esc(r.desc) + (overdue ? ' <span style="color:var(--warning);font-size:11px">' + MF.icons.warning + ' Pendiente</span>' : '') + '</div>'
      + '<div class="list-item__sub">' + MF.nav.esc(r.cat) + ' \u00b7 D\u00eda ' + MF.nav.esc(String(r.day || 1)) + ' \u00b7 ' + MF.nav.esc(accountNames[r.account] || '') + '</div>'
      + '</div>'
      + '<div class="list-item__amount">' + MF.nav.esc(MF.nav.formatCurrency(r.amount, cur)) + '/mes</div>'
      + '<div class="list-item__actions">'
      + '<button class="btn-icon" data-action="edit-rec" data-id="' + MF.nav.esc(r.id) + '">' + MF.icons.pencil + '</button>'
      + '<button class="btn-icon" data-action="del-rec"  data-id="' + MF.nav.esc(r.id) + '">' + MF.icons.trash + '</button>'
      + '</div></div>';
  }).join('')
  : '<div class="empty-state"><div class="empty-state__icon">' + MF.icons.recurrentes + '</div><div class="empty-state__text">Sin gastos recurrentes</div></div>';

  var container = document.getElementById('view-recurrentes');
  if (!container) return;
  container.textContent = '';
  container.insertAdjacentHTML('beforeend', '<div style="max-width:700px">' + alertHTML + '<h2 style="margin-bottom:16px">Gastos recurrentes</h2><div id="rec-list">' + listHTML + '</div></div>');

  document.getElementById('rec-list')?.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit-rec') _openAddModal(btn.dataset.id);
    else if (btn.dataset.action === 'del-rec') _deleteRec(btn.dataset.id);
  });
}

function _openAddModal(id) {
  var db  = MF.db.loadData();
  var rec = id ? db.recurring.find(function(r) { return r.id === id; }) : null;
  var accOpts = db.accounts.map(function(a) {
    return '<option value="' + MF.nav.esc(a.id) + '"' + (rec && rec.account === a.id ? ' selected' : '') + '>' + MF.nav.esc(a.name) + '</option>';
  }).join('');
  var defaultCats = ['Alimentaci\u00f3n','Transporte','Entretenimiento','Salud','Servicios','Ropa','Hogar','Educaci\u00f3n','Otro'];
  var catOpts = defaultCats.map(function(c) {
    return '<option value="' + MF.nav.esc(c) + '"' + (rec && rec.cat === c ? ' selected' : '') + '>' + MF.nav.esc(c) + '</option>';
  }).join('');

  var formHTML = '<div class="form-group"><label class="form-label">Descripci\u00f3n</label>'
    + '<input class="form-input" id="rec-desc" value="' + MF.nav.esc(rec ? rec.desc : '') + '" placeholder="ej: Netflix"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Categor\u00eda</label><select class="form-select" id="rec-cat">' + catOpts + '</select></div>'
    + '<div class="form-group"><label class="form-label">Monto</label><input class="form-input" id="rec-amount" type="number" step="0.01" min="0" value="' + (rec ? rec.amount : '') + '"></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Cuenta</label><select class="form-select" id="rec-account">' + accOpts + '</select></div>'
    + '<div class="form-group"><label class="form-label">D\u00eda del mes</label><input class="form-input" id="rec-day" type="number" min="1" max="31" value="' + (rec ? rec.day : 1) + '"></div>'
    + '</div>';

  MF.nav.showModal(formHTML, rec ? 'Editar recurrente' : 'Nuevo recurrente', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: rec ? 'Guardar' : 'Crear', primary: true, action: function() {
      var desc    = ((document.getElementById('rec-desc') || {}).value || '').trim();
      var cat     = (document.getElementById('rec-cat') || {}).value;
      var amount  = parseFloat((document.getElementById('rec-amount') || {}).value);
      var account = (document.getElementById('rec-account') || {}).value;
      var day     = parseInt((document.getElementById('rec-day') || {}).value) || 1;
      if (!desc || !amount)  { MF.nav.toast('Completa todos los campos', 'error'); return; }
      var db2 = MF.db.loadData(); var now = new Date().toISOString();
      if (id) {
        var idx = db2.recurring.findIndex(function(r) { return r.id === id; });
        if (idx >= 0) db2.recurring[idx] = Object.assign({}, db2.recurring[idx], { desc: desc, cat: cat, amount: amount, account: account, day: day, updatedAt: now });
      } else {
        db2.recurring.push({ id: MF.db.generateId(), desc: desc, cat: cat, amount: amount, account: account, day: day, createdAt: now, updatedAt: now });
      }
      MF.db.saveData(db2);
      MF.nav.closeModal();
      MF.nav.toast(id ? 'Recurrente actualizado' : 'Recurrente creado');
      render();
    }}
  ]);
}

function _deleteRec(id) {
  MF.nav.showModal('<p style="color:var(--text2)">\u00bfEliminar este gasto recurrente?</p>', 'Eliminar', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: 'Eliminar', danger: true, action: function() {
      var db = MF.db.loadData();
      db.recurring = db.recurring.filter(function(r) { return r.id !== id; });
      MF.db.saveData(db);
      MF.nav.closeModal();
      MF.nav.toast('Recurrente eliminado');
      render();
    }}
  ]);
}

var _recAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.recurrentes = _recAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _recAPI; }
