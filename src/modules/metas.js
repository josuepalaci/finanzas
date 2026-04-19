// src/modules/metas.js
// Metas de ahorro: progreso, proyección "alcanzas en X meses" y CRUD.

function render() {
  MF.nav.setFabAction(_openAddModal);

  var db  = MF.db.loadData();
  var cur = (db.settings && db.settings.currency) || '$';

  // Calcular ahorro promedio mensual de los últimos 3 meses para proyecciones
  var avgSavings = MF.analytics.calcMonthlyAvgSavings(db, 3);

  var container = document.getElementById('view-metas');
  if (!container) return;

  if (!db.goals.length) {
    container.textContent = '';
    container.insertAdjacentHTML('beforeend',
      '<div class="empty-state"><div class="empty-state__icon">' + MF.icons.metas + '</div>'
      + '<div class="empty-state__text">Sin metas. Crea una con el bot\u00f3n +</div></div>');
    return;
  }

  var cardsHTML = db.goals.map(function(g) { return _goalCardHTML(g, avgSavings, cur); }).join('');

  var viewHTML = '<div style="max-width:700px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
    + '<h2>Metas de ahorro</h2>'
    + (avgSavings > 0
      ? '<span style="font-size:12px;color:var(--text3)">Ahorro prom.: ' + MF.nav.esc(MF.nav.formatCurrency(avgSavings, cur)) + '/mes</span>'
      : '')
    + '</div>'
    + '<div id="metas-list">' + cardsHTML + '</div>'
    + '</div>';

  container.textContent = '';
  container.insertAdjacentHTML('beforeend', viewHTML);

  document.getElementById('metas-list')?.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit-goal') _openAddModal(btn.dataset.id);
    else if (btn.dataset.action === 'del-goal') _deleteGoal(btn.dataset.id);
    else if (btn.dataset.action === 'add-savings') _openAddSavingsModal(btn.dataset.id);
  });
}

function _goalCardHTML(g, avgSavings, cur) {
  var pct       = Math.min(((g.saved || 0) / Math.max(g.target || 1, 1)) * 100, 100);
  var remaining = Math.max((g.target || 0) - (g.saved || 0), 0);
  var months    = MF.analytics.projectGoal(g, avgSavings);
  var color     = g.color || '#7aa2f7';

  var projLabel = '';
  if (pct >= 100) {
    projLabel = '<span style="color:var(--income)">' + MF.icons.check + ' Meta alcanzada</span>';
  } else if (months !== null && months > 0) {
    projLabel = '<span style="color:var(--text3)">~' + months + ' mes' + (months !== 1 ? 'es' : '') + ' a este ritmo</span>';
  } else if (avgSavings <= 0) {
    projLabel = '<span style="color:var(--text3)">Agrega ahorros para proyectar</span>';
  }

  var deadlineLabel = g.deadline
    ? '<span style="font-size:11px;color:var(--text3)">Meta: ' + MF.nav.esc(MF.nav.formatDate(g.deadline)) + '</span>'
    : '';

  return '<div class="card" style="margin-bottom:12px">'
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
    + '<div style="width:40px;height:40px;border-radius:50%;background:' + MF.nav.esc(color) + ';display:flex;align-items:center;justify-content:center">' + MF.icons.metas + '</div>'
    + '<div style="flex:1">'
    + '<div style="font-weight:500">' + MF.nav.esc(g.name) + '</div>'
    + deadlineLabel
    + '</div>'
    + '<div style="text-align:right">'
    + '<div class="amount">' + MF.nav.esc(MF.nav.formatCurrency(g.saved, cur)) + '</div>'
    + '<div style="font-size:11px;color:var(--text3)">de ' + MF.nav.esc(MF.nav.formatCurrency(g.target, cur)) + '</div>'
    + '</div>'
    + '<div class="list-item__actions" style="opacity:1">'
    + '<button class="btn-icon" data-action="add-savings" data-id="' + MF.nav.esc(g.id) + '" title="Agregar ahorro">' + MF.icons.plus + '</button>'
    + '<button class="btn-icon" data-action="edit-goal"   data-id="' + MF.nav.esc(g.id) + '" title="Editar">' + MF.icons.pencil + '</button>'
    + '<button class="btn-icon" data-action="del-goal"    data-id="' + MF.nav.esc(g.id) + '" title="Eliminar">' + MF.icons.trash + '</button>'
    + '</div></div>'
    + '<div class="progress-bar" style="height:8px">'
    + '<div class="progress-bar__fill" style="width:' + pct.toFixed(1) + '%;background:' + MF.nav.esc(color) + '"></div>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">'
    + '<div>' + projLabel + '</div>'
    + '<span style="color:var(--text3)">' + pct.toFixed(0) + '%</span>'
    + '</div></div>';
}

function _openAddModal(id) {
  var db   = MF.db.loadData();
  var goal = id ? db.goals.find(function(g) { return g.id === id; }) : null;
  var today = new Date().toISOString().slice(0, 10);

  var formHTML = '<div class="form-group"><label class="form-label">Nombre</label>'
    + '<input class="form-input" id="goal-name" value="' + MF.nav.esc(goal ? goal.name : '') + '" placeholder="ej: Fondo de emergencia"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Meta ($)</label>'
    + '<input class="form-input" id="goal-target" type="number" step="0.01" min="0" value="' + (goal ? goal.target : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">Ahorrado ($)</label>'
    + '<input class="form-input" id="goal-saved" type="number" step="0.01" min="0" value="' + (goal ? goal.saved : 0) + '"></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Fecha l\u00edmite</label>'
    + '<input class="form-input" id="goal-deadline" type="date" value="' + MF.nav.esc(goal && goal.deadline ? goal.deadline : today) + '"></div>'
    + '<div class="form-group"><label class="form-label">Color</label>'
    + '<input class="form-input" id="goal-color" type="color" value="' + MF.nav.esc(goal ? goal.color : '#9ece6a') + '" style="height:40px;padding:4px"></div>'
    + '</div>';

  MF.nav.showModal(formHTML, goal ? 'Editar meta' : 'Nueva meta', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: goal ? 'Guardar' : 'Crear', primary: true, action: function() { _saveGoal(id); } }
  ]);
}

function _openAddSavingsModal(id) {
  var db   = MF.db.loadData();
  var goal = db.goals.find(function(g) { return g.id === id; });
  if (!goal) return;

  var formHTML = '<p style="color:var(--text2);margin-bottom:12px">Meta: <strong>' + MF.nav.esc(goal.name) + '</strong></p>'
    + '<div class="form-group"><label class="form-label">Monto a agregar</label>'
    + '<input class="form-input" id="savings-amount" type="number" step="0.01" min="0.01" placeholder="0.00"></div>';

  MF.nav.showModal(formHTML, 'Agregar ahorro', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: 'Agregar', primary: true, action: function() {
      var amount = parseFloat((document.getElementById('savings-amount') || {}).value);
      if (!amount || amount <= 0) { MF.nav.toast('Monto inv\u00e1lido', 'error'); return; }
      var db2  = MF.db.loadData();
      var idx  = db2.goals.findIndex(function(g) { return g.id === id; });
      if (idx >= 0) db2.goals[idx].saved = (db2.goals[idx].saved || 0) + amount;
      MF.db.saveData(db2);
      MF.nav.closeModal();
      MF.nav.toast('Ahorro registrado');
      render();
    }}
  ]);
}

function _saveGoal(id) {
  var name     = ((document.getElementById('goal-name') || {}).value || '').trim();
  var target   = parseFloat((document.getElementById('goal-target') || {}).value);
  var saved    = parseFloat((document.getElementById('goal-saved') || {}).value) || 0;
  var deadline = (document.getElementById('goal-deadline') || {}).value;
  var color    = (document.getElementById('goal-color') || {}).value;

  if (!name)              { MF.nav.toast('Nombre requerido', 'error'); return; }
  if (!target || target <= 0) { MF.nav.toast('Meta inv\u00e1lida', 'error'); return; }

  var db  = MF.db.loadData();
  var now = new Date().toISOString();

  if (id) {
    var idx = db.goals.findIndex(function(g) { return g.id === id; });
    if (idx >= 0) db.goals[idx] = Object.assign({}, db.goals[idx], { name: name, target: target, saved: saved, deadline: deadline, color: color, updatedAt: now });
  } else {
    db.goals.push({ id: MF.db.generateId(), name: name, target: target, saved: saved, deadline: deadline, color: color, createdAt: now, updatedAt: now });
  }

  MF.db.saveData(db);
  MF.nav.closeModal();
  MF.nav.toast(id ? 'Meta actualizada' : 'Meta creada');
  render();
}

function _deleteGoal(id) {
  MF.nav.showModal('<p style="color:var(--text2)">\u00bfEliminar esta meta?</p>', 'Eliminar meta', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: 'Eliminar', danger: true, action: function() {
      var db = MF.db.loadData();
      db.goals = db.goals.filter(function(g) { return g.id !== id; });
      MF.db.saveData(db);
      MF.nav.closeModal();
      MF.nav.toast('Meta eliminada');
      render();
    }}
  ]);
}

var _metasAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.metas = _metasAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _metasAPI; }
