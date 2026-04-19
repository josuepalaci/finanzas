// src/modules/salario.js
// Calculadora Salarial El Salvador 2025.
// Seguridad: las unicas asignaciones a innerHTML usan _fila() con labels
// hardcoded y _fmt() que produce exclusivamente el patron "$ X,XXX.XX".
// Ningun dato ingresado por el usuario se interpola sin procesar.

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

function _calcRelacion(bruto, frecuencia, insaforp) {
  bruto = bruto || 0;
  var isssEmp = Math.min(bruto, 1000) * 0.03;
  var afpEmp  = Math.min(bruto, 7045.06) * 0.0725;
  var renta   = Math.max(0, bruto - isssEmp - afpEmp);
  var isr     = _calcISR(renta, frecuencia);
  var neto    = bruto - isssEmp - afpEmp - isr;
  var isssPat = Math.min(bruto, 1000) * 0.075;
  var afpPat  = bruto * 0.0875;
  var ins     = insaforp ? bruto * 0.01 : 0;
  var costo   = bruto + isssPat + afpPat + ins;
  return {
    isssEmp: isssEmp, afpEmp: afpEmp, isr: isr, neto: neto,
    isssPat: isssPat, afpPat: afpPat, ins: ins, costo: costo
  };
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
// formateados por _fmt() — nunca datos del usuario sin procesar.
function _fila(label, valor, estilo) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">'
    + '<span style="font-size:13px;color:var(--text2)">' + label + '</span>'
    + '<span class="mono" style="font-size:13px;' + (estilo || '') + '">' + valor + '</span>'
    + '</div>';
}

var _COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';

function _updateRelacion() {
  var bruto      = parseFloat(document.getElementById('sal-bruto').value) || 0;
  var frecuencia = document.getElementById('sal-frecuencia').value;
  var insaforp   = document.getElementById('sal-insaforp').checked;
  var r = _calcRelacion(bruto, frecuencia, insaforp);

  document.getElementById('res-emp-rows').innerHTML =
    _fila('ISSS (3%)',     '-' + _fmt(r.isssEmp))
    + _fila('AFP (7.25%)', '-' + _fmt(r.afpEmp))
    + _fila('ISR',         '-' + _fmt(r.isr));

  document.getElementById('res-neto').textContent = _fmt(r.neto);

  document.getElementById('res-pat-rows').innerHTML =
    _fila('Salario bruto',          _fmt(bruto))
    + _fila('ISSS patronal (7.5%)', '+' + _fmt(r.isssPat))
    + _fila('AFP patronal (8.75%)', '+' + _fmt(r.afpPat))
    + (insaforp ? _fila('INSAFORP (1%)', '+' + _fmt(r.ins)) : '');

  document.getElementById('res-costo').textContent = _fmt(r.costo);
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
  var bruto      = parseFloat(document.getElementById('sal-bruto').value) || 0;
  var frecuencia = document.getElementById('sal-frecuencia').value;
  var insaforp   = document.getElementById('sal-insaforp').checked;
  var r = _calcRelacion(bruto, frecuencia, insaforp);
  var freqLabel  = frecuencia === 'quincenal' ? 'Quincenal' : 'Mensual';

  var texto = '=== Calculadora Salarial \u2014 Relaci\u00f3n Laboral ===\n'
    + 'Salario bruto:          ' + _fmt(bruto) + ' (' + freqLabel + ')\n'
    + '\n\u2014 Deducciones empleado \u2014\n'
    + 'ISSS (3%):             -' + _fmt(r.isssEmp) + '\n'
    + 'AFP (7.25%):           -' + _fmt(r.afpEmp) + '\n'
    + 'ISR:                   -' + _fmt(r.isr) + '\n'
    + 'Salario neto:           ' + _fmt(r.neto) + '\n'
    + '\n\u2014 Costo patronal \u2014\n'
    + 'Salario bruto:          ' + _fmt(bruto) + '\n'
    + 'ISSS patronal (7.5%):  +' + _fmt(r.isssPat) + '\n'
    + 'AFP patronal (8.75%):  +' + _fmt(r.afpPat)
    + (insaforp ? '\nINSAFORP (1%):         +' + _fmt(r.ins) : '') + '\n'
    + 'Costo total:            ' + _fmt(r.costo);

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
            + '<input class="form-input" id="sal-bruto" type="number" min="0" step="0.01" placeholder="0.00">'
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
          + '<input class="form-input" id="prest-monto" type="number" min="0" step="0.01" placeholder="0.00">'
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

  document.getElementById('sal-bruto').addEventListener('input', _updateRelacion);
  document.getElementById('sal-frecuencia').addEventListener('change', _updateRelacion);
  document.getElementById('sal-insaforp').addEventListener('change', _updateRelacion);
  document.getElementById('prest-monto').addEventListener('input', _updatePrestador);
  document.getElementById('prest-iva').addEventListener('change', _updatePrestador);
  document.getElementById('btn-copiar-relacion').addEventListener('click', _copyRelacion);
  document.getElementById('btn-copiar-prestador').addEventListener('click', _copyPrestador);

  _updateRelacion();
  _updatePrestador();
}

var _salarioAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.salario = _salarioAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _salarioAPI; }
