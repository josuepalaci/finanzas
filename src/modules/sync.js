// src/modules/sync.js
// Export JSON/CSV e import incremental con preview y merge sin duplicados.

function _getDB() {
  if (typeof window !== 'undefined' && window.MF && window.MF.db) {
    return window.MF.db.loadData();
  }
  return {};
}

function _saveDB(db) {
  if (typeof window !== 'undefined' && window.MF && window.MF.db) {
    window.MF.db.saveData(db);
  }
}

function _triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function exportJSON() {
  const db = _getDB();
  db._meta.exportedAt = new Date().toISOString();
  const filename = `misfinanzas_backup_${_isoDate(new Date())}.json`;
  _triggerDownload(filename, JSON.stringify(db, null, 2), 'application/json');
}

function exportCSV() {
  const db = _getDB();
  const rows = [['fecha', 'descripcion', 'categoria', 'monto', 'cuenta', 'tipo', 'nota']];

  const accountNames = {};
  for (const a of (db.accounts || [])) accountNames[a.id] = a.name;

  for (const tx of (db.transactions || [])) {
    rows.push([
      tx.date,
      `"${(tx.desc || '').replace(/"/g, '""')}"`,
      tx.cat || '',
      tx.amount,
      accountNames[tx.account] || tx.account || '',
      tx.type,
      `"${(tx.note || '').replace(/"/g, '""')}"`
    ].join(','));
  }

  const filename = `misfinanzas_transacciones_${_isoDate(new Date())}.csv`;
  _triggerDownload(filename, rows[0].join(',') + '\n' + rows.slice(1).join('\n'), 'text/csv;charset=utf-8');
}

// ── mergeCollection ────────────────────────────────────────────────────────

function mergeCollection(local, incoming) {
  const result    = [...local];
  const localMap  = new Map(local.map(item => [item.id, item]));
  const resultMap = new Map(local.map((item, i) => [item.id, i]));

  for (const item of incoming) {
    if (!localMap.has(item.id)) {
      result.push(item);
    } else {
      const localItem  = localMap.get(item.id);
      const localMs    = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
      const incomingMs = new Date(item.updatedAt     || item.createdAt     || 0).getTime();

      if (incomingMs > localMs) {
        const idx = resultMap.get(item.id);
        if (idx !== undefined) result[idx] = item;
      }
    }
  }

  return result;
}

const _COLLECTIONS = [
  'accounts', 'cards', 'transactions', 'budgets',
  'goals', 'debts', 'recurring', 'transfers',
  'installments', 'categories'
];

function mergeDB(local, incoming) {
  const merged = { ...local };
  for (const col of _COLLECTIONS) {
    merged[col] = mergeCollection(local[col] || [], incoming[col] || []);
  }
  return merged;
}

function calcMergePreview(local, incoming) {
  let newRecords = 0;
  let unchanged  = 0;
  let conflicts  = 0;
  let localWins  = 0;

  for (const col of _COLLECTIONS) {
    const localMap = new Map((local[col] || []).map(i => [i.id, i]));

    for (const item of (incoming[col] || [])) {
      if (!localMap.has(item.id)) {
        newRecords++;
      } else {
        const localItem  = localMap.get(item.id);
        const localMs    = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
        const incomingMs = new Date(item.updatedAt     || item.createdAt     || 0).getTime();
        const diff       = Math.abs(localMs - incomingMs);

        if (diff < 1000) {
          unchanged++;
        } else if (incomingMs > localMs) {
          conflicts++;
        } else {
          localWins++;
        }
      }
    }
  }

  const incomingMeta = incoming._meta || {};
  return {
    newRecords,
    unchanged,
    conflicts,
    localWins,
    deviceId:   incomingMeta.deviceId || 'desconocido',
    exportedAt: incomingMeta.exportedAt
      ? new Date(incomingMeta.exportedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'desconocido'
  };
}

function importIncremental() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';

  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    let incoming;
    try {
      incoming = JSON.parse(await file.text());
    } catch (_) {
      window.MF.nav.toast('Archivo JSON inválido', 'error');
      return;
    }

    if (!incoming._meta) {
      window.MF.nav.toast('El archivo no parece ser un backup de MisFinanzas', 'error');
      return;
    }

    const local   = _getDB();
    const preview = calcMergePreview(local, incoming);

    const html = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="font-size:13px;color:var(--text2)">
          Dispositivo origen: <strong style="color:var(--text)">${preview.exportedAt}</strong>
        </div>
        <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:12px;display:flex;flex-direction:column;gap:6px;">
          ${preview.newRecords > 0 ? `<div style="color:var(--income);display:flex;align-items:center;gap:4px">${window.MF.icons.check} ${preview.newRecords} registro${preview.newRecords !== 1 ? 's' : ''} nuevo${preview.newRecords !== 1 ? 's' : ''}</div>` : ''}
          ${preview.unchanged   > 0 ? `<div style="color:var(--text3)">${preview.unchanged} sin cambios (se omiten)</div>` : ''}
          ${preview.conflicts   > 0 ? `<div style="color:var(--warning);display:flex;align-items:center;gap:4px">${window.MF.icons.warning} ${preview.conflicts} conflicto${preview.conflicts !== 1 ? 's' : ''} \u2192 gana el m\u00e1s reciente</div>` : ''}
          ${preview.localWins   > 0 ? `<div style="color:var(--text3)">${preview.localWins} registro${preview.localWins !== 1 ? 's' : ''} local m\u00e1s reciente (se mantiene)</div>` : ''}
          ${preview.newRecords === 0 && preview.conflicts === 0 ? `<div style="color:var(--text3)">No hay cambios nuevos para importar.</div>` : ''}
        </div>
        <p style="font-size:12px;color:var(--text3)">Los datos locales nunca se borran al importar.</p>
      </div>
    `;

    window.MF.nav.showModal(html, 'Importar datos', [
      {
        label: 'Cancelar',
        action: () => window.MF.nav.closeModal()
      },
      {
        label: 'Importar y mezclar',
        primary: true,
        action: () => {
          const merged = mergeDB(local, incoming);
          _saveDB(merged);
          window.MF.nav.closeModal();
          window.MF.nav.toast(`Importado: ${preview.newRecords} nuevos, ${preview.conflicts} actualizados`, 'success');
          window.MF.nav.refresh();
        }
      }
    ]);
  };

  input.click();
}

const _syncAPI = {
  exportJSON,
  exportCSV,
  mergeDB,
  mergeCollection,
  calcMergePreview,
  importIncremental
};

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.sync = _syncAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _syncAPI;
}
