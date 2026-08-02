// src/modules/salario.js
// Calculadora Salarial El Salvador 2025.
// Seguridad: el invariante es que ninguna entrada libre del usuario (los campos
// "desc" de otros ingresos/descuentos) llega nunca a un innerHTML/insertAdjacentHTML.
// - _updateRelacion() y _updatePrestador() arman HTML via _fila(), que solo
//   recibe labels hardcoded y valores ya pasados por _fmt() (patrón "$ X,XXX.XX").
// - Hay dos asignaciones a innerHTML que NO pasan por _fila(): del.innerHTML =
//   _TRASH_ICON (constante SVG del módulo) y el esqueleto estático que arma
//   render(); ambas son literales fijos del código, no datos del usuario.
// - Las descripciones, entrada libre del usuario, nunca se insertan como HTML:
//   _appendFilasOtros las escribe con createElement + textContent, y
//   _filaEditable las coloca como .value de un <input> (asignación de
//   propiedad DOM, no parseo de HTML).
// - El texto que va al portapapeles (_copyRelacion/_copyPrestador) es texto
//   plano vía navigator.clipboard.writeText, nunca HTML.

// Tablas ISR vigentes desde mayo 2025
var _ISR_MENSUAL = [
  { max: 550.00,   cuota:   0.00, tasa: 0.00, exceso:    0.00 },
  { max: 895.24,   cuota:  17.67, tasa: 0.10, exceso:  550.00 },
  { max: 2038.10,  cuota:  60.00, tasa: 0.20, exceso:  895.24 },
  { max: Infinity, cuota: 288.57, tasa: 0.30, exceso: 2038.10 }
];

var _ISR_QUINCENAL = [
  { max: 275.00,   cuota:   0.00, tasa: 0.00, exceso:    0.00 },
  { max: 447.62,   cuota:   8.83, tasa: 0.10, exceso:  275.00 },
  { max: 1019.05,  cuota:  30.00, tasa: 0.20, exceso:  447.62 },
  { max: Infinity, cuota: 144.28, tasa: 0.30, exceso: 1019.05 }
];

function _calcISR(renta, frecuencia) {
  var tabla = frecuencia === 'quincenal' ? _ISR_QUINCENAL : _ISR_MENSUAL;
  if (renta <= 0) return 0;
  for (var i = 0; i < tabla.length; i++) {
    if (renta <= tabla[i].max) {
      return tabla[i].cuota + (renta - tabla[i].exceso) * tabla[i].tasa;
    }
  }
  return 0;
}

// ── Configuración ──────────────────────────────────────────────────────────

function _num(v) {
  var n = Number(v);
  return (isFinite(n) && n > 0) ? n : 0;
}

function _genId() {
  if (typeof MF !== 'undefined' && MF.db && MF.db.generateId) return MF.db.generateId();
  return 'sal-' + Math.random().toString(36).slice(2, 10);
}

function _normLista(arr, conGravable) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function(it) {
    it = it || {};
    var row = {
      id:    it.id || _genId(),
      desc:  typeof it.desc === 'string' ? it.desc : '',
      monto: _num(it.monto)
    };
    if (conGravable) row.gravable = it.gravable !== false;
    return row;
  });
}

function normalizarCfg(cfg) {
  cfg = cfg || {};
  return {
    bruto:            _num(cfg.bruto),
    frecuencia:       cfg.frecuencia === 'quincenal' ? 'quincenal' : 'mensual',
    insaforp:         !!cfg.insaforp,
    horasDiurnas:     _num(cfg.horasDiurnas),
    horasNocturnas:   _num(cfg.horasNocturnas),
    diasFeriados:     _num(cfg.diasFeriados),
    diasNoTrabajados: _num(cfg.diasNoTrabajados),
    otrosIngresos:    _normLista(cfg.otrosIngresos, true),
    otrosDescuentos:  _normLista(cfg.otrosDescuentos, false)
  };
}

// ── Cálculo ────────────────────────────────────────────────────────────────

// Mes comercial de 30 días / quincena de 15, jornada ordinaria de 8 h (Art. 161 CT).
function calcBaseHoraria(bruto, frecuencia) {
  var dias = frecuencia === 'quincenal' ? 15 : 30;
  var salarioDiario = _num(bruto) / dias;
  return { salarioDiario: salarioDiario, horaOrdinaria: salarioDiario / 8 };
}

// Recargos: extra diurna 100% (Art. 169), nocturna 25% + 100% = 2.5x (Art. 168),
// feriado trabajado ordinario + 100% (Art. 192).
function calcAjustes(cfg) {
  cfg = normalizarCfg(cfg);
  var base = calcBaseHoraria(cfg.bruto, cfg.frecuencia);

  var gravables = 0, noGravables = 0;
  cfg.otrosIngresos.forEach(function(it) {
    if (it.gravable) gravables += it.monto; else noGravables += it.monto;
  });

  var descuentos = cfg.otrosDescuentos.reduce(function(s, it) { return s + it.monto; }, 0);

  return {
    extraDiurna:              cfg.horasDiurnas     * base.horaOrdinaria * 2,
    extraNocturna:            cfg.horasNocturnas   * base.horaOrdinaria * 2.5,
    feriados:                 cfg.diasFeriados     * base.salarioDiario * 2,
    diasNoTrabajados:         cfg.diasNoTrabajados * base.salarioDiario,
    otrosIngresosGravables:   gravables,
    otrosIngresosNoGravables: noGravables,
    otrosDescuentos:          descuentos
  };
}

function calcRelacion(cfg) {
  cfg = normalizarCfg(cfg);
  var base = calcBaseHoraria(cfg.bruto, cfg.frecuencia);
  var aj   = calcAjustes(cfg);

  var baseGravable = cfg.bruto
    + aj.extraDiurna + aj.extraNocturna + aj.feriados
    - aj.diasNoTrabajados
    + aj.otrosIngresosGravables;
  if (baseGravable < 0) baseGravable = 0;

  var totalDevengado = baseGravable + aj.otrosIngresosNoGravables;

  var isssEmp = Math.min(baseGravable, 1000)    * 0.03;
  var afpEmp  = Math.min(baseGravable, 7045.06) * 0.0725;
  var renta   = Math.max(0, baseGravable - isssEmp - afpEmp);
  var isr     = _calcISR(renta, cfg.frecuencia);
  var neto    = totalDevengado - isssEmp - afpEmp - isr - aj.otrosDescuentos;

  var isssPat = Math.min(baseGravable, 1000) * 0.075;
  var afpPat  = baseGravable * 0.0875;
  var ins     = cfg.insaforp ? baseGravable * 0.01 : 0;
  var costo   = totalDevengado + isssPat + afpPat + ins;

  return {
    salarioDiario: base.salarioDiario,
    horaOrdinaria: base.horaOrdinaria,
    extraDiurna:              aj.extraDiurna,
    extraNocturna:            aj.extraNocturna,
    feriados:                 aj.feriados,
    diasNoTrabajados:         aj.diasNoTrabajados,
    otrosIngresosGravables:   aj.otrosIngresosGravables,
    otrosIngresosNoGravables: aj.otrosIngresosNoGravables,
    otrosDescuentos:          aj.otrosDescuentos,
    baseGravable: baseGravable, totalDevengado: totalDevengado,
    isssEmp: isssEmp, afpEmp: afpEmp, isr: isr, neto: neto,
    isssPat: isssPat, afpPat: afpPat, ins: ins, costo: costo,
    ajusteNeto: totalDevengado - cfg.bruto - aj.otrosDescuentos
  };
}

// ── Persistencia ───────────────────────────────────────────────────────────
// Aditivo: no sube _CURRENT_VERSION. Una base v2 sin settings.salario se
// resuelve con los defaults de normalizarCfg, igual que hace configuracion.js.

var _saveTimer = null;

function _loadCfg() {
  try {
    var db = MF.db.loadData();
    return normalizarCfg(db.settings && db.settings.salario);
  } catch (_) {
    return normalizarCfg(null);
  }
}

function _saveCfg(cfg) {
  try {
    var db = MF.db.loadData();
    if (!db.settings) db.settings = {};
    db.settings.salario = normalizarCfg(cfg);
    MF.db.saveData(db);
  } catch (_) {
    // localStorage lleno o no disponible: la calculadora sigue funcionando en memoria.
  }
}

function _saveCfgDebounced(cfg) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() { _saveCfg(cfg); }, 400);
}

function _calcPrestador(monto, iva) {
  monto = monto || 0;
  var ivaAmt    = iva ? monto * 0.13 : 0;
  var factura   = monto + ivaAmt;
  var retencion = monto * 0.10;
  var neto      = monto - retencion;
  return { ivaAmt: ivaAmt, factura: factura, retencion: retencion, neto: neto };
}

function _fmt(n) {
  return '$ ' + Number(n || 0).toLocaleString('es', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

// Genera una fila de resultado. label y valor son strings hardcoded o numeros
// formateados por _fmt() — nunca datos del usuario sin procesar. destacado es
// booleano: activa la clase .sal-fila--destacada en vez de aceptar un estilo
// libre, para que este punto no dependa de que nadie le pase datos dinámicos.
function _fila(label, valor, destacado) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">'
    + '<span style="font-size:13px;color:var(--text2)">' + label + '</span>'
    + '<span class="mono' + (destacado ? ' sal-fila--destacada' : '') + '" style="font-size:13px">' + valor + '</span>'
    + '</div>';
}

var _COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';

var _cfgActual = null;

// true solo durante la llamada a _updateRelacion() que hace render() para
// pintar el estado inicial: evita que abrir la vista, sin que el usuario haya
// tocado nada, ya reescriba settings.salario en la DB. Cualquier _updateRelacion
// posterior (disparada por un listener de interacción real) la encuentra en
// false y guarda con normalidad.
var _renderInicial = false;

function _readCfgFromDOM() {
  var cfg = normalizarCfg({
    bruto:            document.getElementById('sal-bruto').value,
    frecuencia:       document.getElementById('sal-frecuencia').value,
    insaforp:         document.getElementById('sal-insaforp').checked,
    horasDiurnas:     document.getElementById('sal-hd').value,
    horasNocturnas:   document.getElementById('sal-hn').value,
    diasFeriados:     document.getElementById('sal-df').value,
    diasNoTrabajados: document.getElementById('sal-dnt').value
  });
  // Las listas se conservan POR REFERENCIA: _filaEditable captura cada item y su
  // array en closures, y normalizarCfg los recrearia con .map() en cada tecleo,
  // dejando esos closures huerfanos y rompiendo agregar/editar/eliminar.
  cfg.otrosIngresos   = _cfgActual ? _cfgActual.otrosIngresos   : [];
  cfg.otrosDescuentos = _cfgActual ? _cfgActual.otrosDescuentos : [];
  return cfg;
}

// Expuesto solo para tests: prepara _cfgActual antes de llamar _readCfgFromDOM()
// para verificar que las listas se conservan por referencia entre llamadas.
function _setCfgActualParaTest(cfg) { _cfgActual = cfg; }

// Las descripciones son entrada libre del usuario: se insertan por textContent,
// nunca por innerHTML. _fila() queda reservado para labels hardcoded.
function _appendFilasOtros(contenedor, lista, signo) {
  lista.forEach(function(it) {
    if (!it.monto) return;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)';

    var label = document.createElement('span');
    label.style.cssText = 'font-size:13px;color:var(--text2)';
    label.textContent = it.desc || 'Sin descripción';

    var valor = document.createElement('span');
    valor.className = 'mono';
    valor.style.cssText = 'font-size:13px';
    valor.textContent = signo + _fmt(it.monto);

    row.appendChild(label);
    row.appendChild(valor);
    contenedor.appendChild(row);
  });
}

var _TRASH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

function _filaEditable(item, lista, conGravable) {
  var row = document.createElement('div');
  row.className = conGravable ? 'sal-row sal-row--gravable' : 'sal-row';

  var desc = document.createElement('input');
  desc.className = 'form-input sal-row__desc';
  desc.type = 'text';
  desc.placeholder = 'Descripción';
  desc.value = item.desc;
  desc.addEventListener('input', function() {
    item.desc = desc.value;
    _updateRelacion();
  });

  var monto = document.createElement('input');
  monto.className = 'form-input';
  monto.type = 'number';
  monto.min = '0';
  monto.step = '0.01';
  monto.placeholder = '0.00';
  monto.value = item.monto || '';
  monto.addEventListener('input', function() {
    item.monto = _num(monto.value);
    _updateRelacion();
  });

  row.appendChild(desc);
  row.appendChild(monto);

  if (conGravable) {
    var wrap = document.createElement('label');
    wrap.className = 'sal-row__grav';
    wrap.title = 'Gravable: paga ISSS, AFP e ISR';
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = item.gravable;
    chk.addEventListener('change', function() {
      item.gravable = chk.checked;
      _updateRelacion();
    });
    var txt = document.createElement('span');
    txt.textContent = 'Grav.';
    wrap.appendChild(chk);
    wrap.appendChild(txt);
    row.appendChild(wrap);
  }

  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-icon';
  del.setAttribute('aria-label', 'Eliminar fila');
  del.innerHTML = _TRASH_ICON;
  del.addEventListener('click', function() {
    var i = lista.indexOf(item);
    if (i >= 0) lista.splice(i, 1);
    _renderListas();
    _updateRelacion();
  });
  row.appendChild(del);

  return row;
}

function _seccionLista(titulo, lista, conGravable, textoBoton) {
  var frag = document.createDocumentFragment();

  var h = document.createElement('div');
  h.className = 'sal-section-title';
  h.textContent = titulo;
  frag.appendChild(h);

  lista.forEach(function(item) {
    frag.appendChild(_filaEditable(item, lista, conGravable));
  });

  var add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn';
  add.style.width = '100%';
  add.textContent = textoBoton;
  add.addEventListener('click', function() {
    var nuevo = { id: _genId(), desc: '', monto: 0 };
    if (conGravable) nuevo.gravable = true;
    lista.push(nuevo);
    _renderListas();
    var sel = '#sal-listas .sal-row__desc';
    var todas = Array.prototype.slice.call(document.querySelectorAll(sel));
    var offset = conGravable ? 0 : _cfgActual.otrosIngresos.length;
    var idx = offset + lista.indexOf(nuevo);
    if (todas[idx]) todas[idx].focus();
    _updateRelacion();
  });
  frag.appendChild(add);

  return frag;
}

function _renderListas() {
  var cont = document.getElementById('sal-listas');
  if (!cont) return;
  cont.textContent = '';
  cont.appendChild(_seccionLista('Otros ingresos',   _cfgActual.otrosIngresos,   true,  '+ Agregar ingreso'));
  cont.appendChild(_seccionLista('Otros descuentos', _cfgActual.otrosDescuentos, false, '+ Agregar descuento'));
}

function _updateRelacion() {
  _cfgActual = _readCfgFromDOM();
  var r = calcRelacion(_cfgActual);

  document.getElementById('sal-hd-hint').textContent  = r.extraDiurna      ? '+' + _fmt(r.extraDiurna)      : '';
  document.getElementById('sal-hn-hint').textContent  = r.extraNocturna    ? '+' + _fmt(r.extraNocturna)    : '';
  document.getElementById('sal-dnt-hint').textContent = r.diasNoTrabajados ? '-' + _fmt(r.diasNoTrabajados) : '';
  document.getElementById('sal-df-hint').textContent  = r.feriados
    ? '+' + _fmt(r.feriados)
    : 'Se paga al doble (Art. 192 CT)';

  var badge = document.getElementById('sal-extras-badge');
  if (Math.abs(r.ajusteNeto) < 0.005) {
    badge.textContent = '';
  } else {
    badge.textContent = (r.ajusteNeto > 0 ? '+' : '-') + _fmt(Math.abs(r.ajusteNeto));
    badge.style.color = r.ajusteNeto > 0 ? 'var(--income)' : 'var(--expense)';
  }

  var filas = '';
  if (r.extraDiurna)      filas += _fila('Hora extra diurna',      '+' + _fmt(r.extraDiurna));
  if (r.extraNocturna)    filas += _fila('Hora extra nocturna',    '+' + _fmt(r.extraNocturna));
  if (r.feriados)         filas += _fila('Día feriado trabajado', '+' + _fmt(r.feriados));
  if (r.diasNoTrabajados) filas += _fila('Días no trabajados',    '-' + _fmt(r.diasNoTrabajados));

  // Se arma en tres tramos porque las descripciones del usuario van intercaladas
  // y solo pueden insertarse por DOM, nunca por innerHTML.
  var emp = document.getElementById('res-emp-rows');
  emp.innerHTML = _fila('Salario bruto', _fmt(_cfgActual.bruto)) + filas;
  _appendFilasOtros(emp, _cfgActual.otrosIngresos, '+');
  emp.insertAdjacentHTML('beforeend',
    _fila('Total devengado', _fmt(r.totalDevengado), true)
    + _fila('ISSS (3%)',   '-' + _fmt(r.isssEmp))
    + _fila('AFP (7.25%)', '-' + _fmt(r.afpEmp))
    + _fila('ISR',         '-' + _fmt(r.isr)));
  _appendFilasOtros(emp, _cfgActual.otrosDescuentos, '-');

  document.getElementById('res-neto').textContent = _fmt(r.neto);

  document.getElementById('res-pat-rows').innerHTML =
    _fila('Total devengado',        _fmt(r.totalDevengado))
    + _fila('ISSS patronal (7.5%)',  '+' + _fmt(r.isssPat))
    + _fila('AFP patronal (8.75%)',  '+' + _fmt(r.afpPat))
    + (_cfgActual.insaforp ? _fila('INSAFORP (1%)', '+' + _fmt(r.ins)) : '');

  document.getElementById('res-costo').textContent = _fmt(r.costo);

  if (!_renderInicial) _saveCfgDebounced(_cfgActual);
}

function _updatePrestador() {
  var monto = parseFloat(document.getElementById('prest-monto').value) || 0;
  var iva   = document.getElementById('prest-iva').checked;
  var p = _calcPrestador(monto, iva);

  document.getElementById('res-prest-rows').innerHTML =
    _fila('Monto del servicio',        _fmt(monto))
    + (iva ? _fila('IVA (13%)',        '+' + _fmt(p.ivaAmt)) : '')
    + (iva ? _fila('Total a facturar', _fmt(p.factura))       : '')
    + _fila('Retenci\u00f3n ISR (10%)', '-' + _fmt(p.retencion));

  document.getElementById('res-prest-neto').textContent = _fmt(p.neto);
}

function _copyRelacion() {
  var cfg = _readCfgFromDOM();
  var r   = calcRelacion(cfg);
  var freqLabel = cfg.frecuencia === 'quincenal' ? 'Quincenal' : 'Mensual';

  function linea(label, monto, signo) {
    var etiqueta = (label + ':').padEnd(26, ' ');
    return etiqueta + (signo || ' ') + _fmt(monto) + '\n';
  }

  // L\u00ednea del bruto construida a mano (no via linea()) porque lleva el sufijo
  // " (Mensual)"/" (Quincenal)" que linea() no produce.
  var etiquetaBruto = ('Salario bruto:').padEnd(26, ' ');
  var texto = '=== Calculadora Salarial \u2014 Relaci\u00f3n Laboral ===\n'
    + etiquetaBruto + ' ' + _fmt(cfg.bruto) + ' (' + freqLabel + ')\n';

  var ingresos = '';
  if (r.extraDiurna)   ingresos += linea('Hora extra diurna (' + cfg.horasDiurnas + 'h)', r.extraDiurna, '+');
  if (r.extraNocturna) ingresos += linea('Hora extra nocturna (' + cfg.horasNocturnas + 'h)', r.extraNocturna, '+');
  if (r.feriados)      ingresos += linea('D\u00eda feriado (' + cfg.diasFeriados + 'd)', r.feriados, '+');
  cfg.otrosIngresos.forEach(function(it) {
    if (it.monto) ingresos += linea(it.desc || 'Sin descripci\u00f3n', it.monto, '+');
  });
  if (ingresos) texto += '\n\u2014 Ingresos adicionales \u2014\n' + ingresos;

  var descuentos = '';
  if (r.diasNoTrabajados) descuentos += linea('D\u00edas no trabajados (' + cfg.diasNoTrabajados + 'd)', r.diasNoTrabajados, '-');
  cfg.otrosDescuentos.forEach(function(it) {
    if (it.monto) descuentos += linea(it.desc || 'Sin descripci\u00f3n', it.monto, '-');
  });
  if (descuentos) texto += '\n\u2014 Descuentos adicionales \u2014\n' + descuentos;

  texto += '\n' + linea('Total devengado', r.totalDevengado)
    + '\n\u2014 Deducciones de ley \u2014\n'
    + linea('ISSS (3%)',   r.isssEmp, '-')
    + linea('AFP (7.25%)', r.afpEmp,  '-')
    + linea('ISR',         r.isr,     '-')
    + linea('Salario neto', r.neto)
    + '\n\u2014 Costo patronal \u2014\n'
    + linea('Total devengado',       r.totalDevengado)
    + linea('ISSS patronal (7.5%)',  r.isssPat, '+')
    + linea('AFP patronal (8.75%)',  r.afpPat,  '+')
    + (cfg.insaforp ? linea('INSAFORP (1%)', r.ins, '+') : '')
    + linea('Costo total', r.costo);

  navigator.clipboard.writeText(texto).then(function() {
    MF.nav.toast('\u00a1Copiado!', 'success');
  }).catch(function() {
    MF.nav.toast('No se pudo copiar', 'error');
  });
}

function _copyPrestador() {
  var monto = parseFloat(document.getElementById('prest-monto').value) || 0;
  var iva   = document.getElementById('prest-iva').checked;
  var p = _calcPrestador(monto, iva);

  var texto = '=== Calculadora Salarial \u2014 Prestador de Servicio ===\n'
    + 'Monto del servicio:    ' + _fmt(monto)
    + (iva ? '\nIVA (13%):            +' + _fmt(p.ivaAmt) + '\nTotal a facturar:      ' + _fmt(p.factura) : '') + '\n'
    + 'Retenci\u00f3n ISR (10%):  -' + _fmt(p.retencion) + '\n'
    + 'Neto a recibir:        ' + _fmt(p.neto);

  navigator.clipboard.writeText(texto).then(function() {
    MF.nav.toast('\u00a1Copiado!', 'success');
  }).catch(function() {
    MF.nav.toast('No se pudo copiar', 'error');
  });
}

function _setExtrasExpanded(abierto) {
  document.getElementById('sal-extras-toggle').setAttribute('aria-expanded', abierto ? 'true' : 'false');
  document.getElementById('sal-extras-body').style.display = abierto ? '' : 'none';
}

function render() {
  MF.nav.setFabAction(null);
  var container = document.getElementById('view-salario');
  if (!container) return;

  container.textContent = '';
  container.insertAdjacentHTML('beforeend',
    '<div style="max-width:600px">'
    + '<div style="display:flex;gap:8px;margin-bottom:20px">'
      + '<button id="tab-relacion" class="btn btn-primary">Relaci\u00f3n Laboral</button>'
      + '<button id="tab-prestador" class="btn">Prestador de Servicio</button>'
    + '</div>'
    + '<div id="panel-relacion">'
      + '<div class="card" style="margin-bottom:16px">'
        + '<div class="form-row">'
          + '<div class="form-group" style="margin-bottom:0">'
            + '<label class="form-label">Salario bruto</label>'
            + '<input class="form-input" id="sal-bruto" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00">'
            + '<div style="font-size:11px;color:var(--text3);margin-top:4px">M\u00ednimo 2025: $408.80/mes</div>'
          + '</div>'
          + '<div class="form-group" style="margin-bottom:0">'
            + '<label class="form-label">Frecuencia</label>'
            + '<select class="form-select" id="sal-frecuencia">'
              + '<option value="mensual">Mensual</option>'
              + '<option value="quincenal">Quincenal</option>'
            + '</select>'
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px">'
          + '<div><div style="font-weight:500;font-size:13px">INSAFORP patronal (1%)</div>'
          + '<div style="font-size:11px;color:var(--text3)">Empresas con 10 o m\u00e1s empleados</div></div>'
          + '<label class="toggle"><input type="checkbox" id="sal-insaforp"><span class="toggle-slider"></span></label>'
        + '</div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:12px">'
        + '<button type="button" class="sal-collapse__toggle" id="sal-extras-toggle" aria-expanded="false" aria-controls="sal-extras-body">'
          + '<svg class="sal-collapse__chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
          + '<span class="card-title">Ingresos y descuentos adicionales</span>'
          + '<span class="sal-collapse__badge" id="sal-extras-badge"></span>'
        + '</button>'
        + '<div class="sal-collapse__body" id="sal-extras-body" style="display:none">'
          + '<div class="form-row">'
            + '<div class="form-group" style="margin-bottom:0">'
              + '<label class="form-label" for="sal-hd">Horas extra diurnas</label>'
              + '<input class="form-input" id="sal-hd" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0">'
              + '<div class="sal-hint" id="sal-hd-hint"></div>'
            + '</div>'
            + '<div class="form-group" style="margin-bottom:0">'
              + '<label class="form-label" for="sal-hn">Horas extra nocturnas</label>'
              + '<input class="form-input" id="sal-hn" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0">'
              + '<div class="sal-hint" id="sal-hn-hint"></div>'
            + '</div>'
          + '</div>'
          + '<div class="form-row" style="margin-top:12px">'
            + '<div class="form-group" style="margin-bottom:0">'
              + '<label class="form-label" for="sal-df">Días feriados trabajados</label>'
              + '<input class="form-input" id="sal-df" type="number" inputmode="decimal" min="0" step="1" placeholder="0">'
              + '<div class="sal-hint" id="sal-df-hint">Se paga al doble (Art. 192 CT)</div>'
            + '</div>'
            + '<div class="form-group" style="margin-bottom:0">'
              + '<label class="form-label" for="sal-dnt">Días no trabajados</label>'
              + '<input class="form-input" id="sal-dnt" type="number" inputmode="decimal" min="0" step="1" placeholder="0">'
              + '<div class="sal-hint" id="sal-dnt-hint"></div>'
            + '</div>'
          + '</div>'
          + '<div id="sal-listas"></div>'
        + '</div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:12px">'
        + '<div class="card-header"><span class="card-title">Deducciones del empleado</span></div>'
        + '<div id="res-emp-rows"></div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;margin-top:4px">'
          + '<span style="font-weight:600">Salario neto</span>'
          + '<span id="res-neto" class="mono" style="font-size:18px;font-weight:600;color:var(--income)">$ 0.00</span>'
        + '</div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:16px">'
        + '<div class="card-header"><span class="card-title">Costo patronal</span></div>'
        + '<div id="res-pat-rows"></div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;margin-top:4px">'
          + '<span style="font-weight:600">Costo total</span>'
          + '<span id="res-costo" class="mono" style="font-size:18px;font-weight:600;color:var(--warning)">$ 0.00</span>'
        + '</div>'
      + '</div>'
      + '<button class="btn" id="btn-copiar-relacion" style="width:100%">' + _COPY_ICON + ' Copiar resumen</button>'
    + '</div>'
    + '<div id="panel-prestador" style="display:none">'
      + '<div class="card" style="margin-bottom:16px">'
        + '<div class="form-group">'
          + '<label class="form-label">Monto del servicio</label>'
          + '<input class="form-input" id="prest-monto" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00">'
        + '</div>'
        + '<div style="display:flex;align-items:center;justify-content:space-between">'
          + '<div><div style="font-weight:500;font-size:13px">\u00bfIncluye IVA? (13%)</div>'
          + '<div style="font-size:11px;color:var(--text3)">El IVA se suma al monto del servicio</div></div>'
          + '<label class="toggle"><input type="checkbox" id="prest-iva"><span class="toggle-slider"></span></label>'
        + '</div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:16px">'
        + '<div class="card-header"><span class="card-title">Desglose</span></div>'
        + '<div id="res-prest-rows"></div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;margin-top:4px">'
          + '<span style="font-weight:600">Neto a recibir</span>'
          + '<span id="res-prest-neto" class="mono" style="font-size:18px;font-weight:600;color:var(--income)">$ 0.00</span>'
        + '</div>'
      + '</div>'
      + '<button class="btn" id="btn-copiar-prestador" style="width:100%">' + _COPY_ICON + ' Copiar resumen</button>'
    + '</div>'
    + '</div>'
  );

  document.getElementById('tab-relacion').addEventListener('click', function() {
    document.getElementById('panel-relacion').style.display = '';
    document.getElementById('panel-prestador').style.display = 'none';
    document.getElementById('tab-relacion').classList.add('btn-primary');
    document.getElementById('tab-prestador').classList.remove('btn-primary');
  });
  document.getElementById('tab-prestador').addEventListener('click', function() {
    document.getElementById('panel-relacion').style.display = 'none';
    document.getElementById('panel-prestador').style.display = '';
    document.getElementById('tab-prestador').classList.add('btn-primary');
    document.getElementById('tab-relacion').classList.remove('btn-primary');
  });

  _cfgActual = _loadCfg();
  document.getElementById('sal-bruto').value      = _cfgActual.bruto || '';
  document.getElementById('sal-frecuencia').value = _cfgActual.frecuencia;
  document.getElementById('sal-insaforp').checked = _cfgActual.insaforp;
  document.getElementById('sal-hd').value  = _cfgActual.horasDiurnas     || '';
  document.getElementById('sal-hn').value  = _cfgActual.horasNocturnas   || '';
  document.getElementById('sal-df').value  = _cfgActual.diasFeriados     || '';
  document.getElementById('sal-dnt').value = _cfgActual.diasNoTrabajados || '';

  // Arranca expandida si ya hay datos configurados, para no esconderlos.
  var hayExtras = _cfgActual.horasDiurnas || _cfgActual.horasNocturnas
    || _cfgActual.diasFeriados || _cfgActual.diasNoTrabajados
    || _cfgActual.otrosIngresos.length || _cfgActual.otrosDescuentos.length;
  _setExtrasExpanded(!!hayExtras);
  _renderListas();

  document.getElementById('sal-extras-toggle').addEventListener('click', function() {
    var abierto = this.getAttribute('aria-expanded') === 'true';
    _setExtrasExpanded(!abierto);
  });

  ['sal-bruto', 'sal-hd', 'sal-hn', 'sal-df', 'sal-dnt'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', _updateRelacion);
  });
  document.getElementById('sal-frecuencia').addEventListener('change', _updateRelacion);
  document.getElementById('sal-insaforp').addEventListener('change', _updateRelacion);
  document.getElementById('prest-monto').addEventListener('input', _updatePrestador);
  document.getElementById('prest-iva').addEventListener('change', _updatePrestador);
  document.getElementById('btn-copiar-relacion').addEventListener('click', _copyRelacion);
  document.getElementById('btn-copiar-prestador').addEventListener('click', _copyPrestador);

  _renderInicial = true;
  _updateRelacion();
  _renderInicial = false;
  _updatePrestador();
}

var _salarioAPI = {
  render: render,
  normalizarCfg: normalizarCfg,
  calcBaseHoraria: calcBaseHoraria,
  calcAjustes: calcAjustes,
  calcRelacion: calcRelacion,
  _loadCfg: _loadCfg,
  _saveCfg: _saveCfg,
  _saveCfgDebounced: _saveCfgDebounced,
  _readCfgFromDOM: _readCfgFromDOM,
  _setCfgActualParaTest: _setCfgActualParaTest
};
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.salario = _salarioAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _salarioAPI; }
