// src/modules/db.js
// Capa de acceso a datos: localStorage, migraciones, UUIDs, demo data.

const _STORAGE_V2 = 'misfinanzas_v2';
const _STORAGE_V1 = 'misfinanzas_v1'; // clave legacy del app v1
const _CURRENT_VERSION = 2;

// ── UUID ───────────────────────────────────────────────────────────────────

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Polyfill para iOS Safari < 15.4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── DB vacía ───────────────────────────────────────────────────────────────

function emptyDB() {
  return {
    _meta: {
      version: _CURRENT_VERSION,
      deviceId: generateId(),
      exportedAt: null,
      appVersion: '2.0.0'
    },
    accounts:     [],
    cards:        [],
    transactions: [],
    budgets:      [],
    goals:        [],
    debts:        [],
    recurring:    [],
    transfers:    [],
    installments: [],
    categories:   [],
    settings: {
      theme: 'dark',
      currency: '$',
      reminderEnabled: false,
      reminderTime: '20:00',
      budgetRollover: false
    }
  };
}

// ── Migración v1 → v2 ──────────────────────────────────────────────────────

function migrateV1toV2(db) {
  const now = new Date().toISOString();
  const idMap = {};

  function ensureUUID(oldId) {
    if (!oldId) return generateId();
    if (oldId.length >= 32) return oldId;
    if (!idMap[oldId]) idMap[oldId] = generateId();
    return idMap[oldId];
  }

  function resolveRef(oldId) {
    if (!oldId) return '';
    return idMap[oldId] || oldId;
  }

  const accounts = (db.accounts || []).map(a => ({
    ...a,
    id: ensureUUID(a.id),
    createdAt: a.createdAt || now,
    updatedAt: a.updatedAt || now
  }));

  const cards = (db.cards || []).map(c => ({
    ...c,
    id: ensureUUID(c.id),
    createdAt: c.createdAt || now,
    updatedAt: c.updatedAt || now
  }));

  const budgets = (db.budgets || []).map(b => ({
    ...b,
    id: ensureUUID(b.id),
    rollover: b.rollover ?? 0,
    createdAt: b.createdAt || now,
    updatedAt: b.updatedAt || now
  }));

  const goals = (db.goals || []).map(g => ({
    ...g,
    id: ensureUUID(g.id),
    createdAt: g.createdAt || now,
    updatedAt: g.updatedAt || now
  }));

  const debts = (db.debts || []).map(d => ({
    ...d,
    id: ensureUUID(d.id),
    createdAt: d.createdAt || now,
    updatedAt: d.updatedAt || now
  }));

  const recurring = (db.recurring || []).map(r => ({
    ...r,
    id: ensureUUID(r.id),
    createdAt: r.createdAt || now,
    updatedAt: r.updatedAt || now
  }));

  const installments = (db.installments || []).map(i => ({
    ...i,
    id: ensureUUID(i.id),
    createdAt: i.createdAt || now,
    updatedAt: i.updatedAt || now
  }));

  const transactions = (db.transactions || []).map(t => ({
    ...t,
    id: ensureUUID(t.id),
    account: resolveRef(t.account),
    note: t.note || '',
    createdAt: t.createdAt || now,
    updatedAt: t.updatedAt || now
  }));

  const transfers = (db.transfers || []).map(t => ({
    ...t,
    id: ensureUUID(t.id),
    from: resolveRef(t.from),
    to: resolveRef(t.to),
    note: t.note || '',
    createdAt: t.createdAt || now
  }));

  return {
    _meta: {
      version: 2,
      deviceId: generateId(),
      exportedAt: null,
      appVersion: '2.0.0'
    },
    accounts, cards, transactions, budgets,
    goals, debts, recurring, transfers, installments,
    categories: [],
    settings: {
      theme: db.settings?.theme || 'dark',
      currency: db.settings?.currency || '$',
      reminderEnabled: false,
      reminderTime: '20:00',
      budgetRollover: false
    }
  };
}

const _MIGRATIONS = {
  1: migrateV1toV2
};

// ── loadData ───────────────────────────────────────────────────────────────

function loadData() {
  try {
    let raw = localStorage.getItem(_STORAGE_V2);

    if (!raw) {
      const v1raw = localStorage.getItem(_STORAGE_V1);
      if (v1raw) {
        const v1db = JSON.parse(v1raw);
        const v2db = migrateV1toV2(v1db);
        saveData(v2db);
        return v2db;
      }
      return emptyDB();
    }

    let db = JSON.parse(raw);
    let version = db._meta?.version ?? 1;

    while (version < _CURRENT_VERSION) {
      if (!_MIGRATIONS[version]) break;
      db = _MIGRATIONS[version](db);
      version++;
    }

    return db;
  } catch (_) {
    return emptyDB();
  }
}

// ── saveData ───────────────────────────────────────────────────────────────

function saveData(db) {
  try {
    localStorage.setItem(_STORAGE_V2, JSON.stringify(db));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw new Error('Storage full: unable to save data. Free up space and try again.');
    }
    throw e;
  }
}

// ── clearData ──────────────────────────────────────────────────────────────

function clearData() {
  localStorage.removeItem(_STORAGE_V2);
  localStorage.removeItem(_STORAGE_V1);
}

// ── storageUsedKB ──────────────────────────────────────────────────────────

function storageUsedKB() {
  const raw = localStorage.getItem(_STORAGE_V2) || '';
  return (raw.length / 1024).toFixed(1);
}

// ── generateDemoData ───────────────────────────────────────────────────────

function generateDemoData() {
  const db = loadData();
  const now = new Date();

  function isoDate(daysAgo) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  function isoNow() { return now.toISOString(); }

  const accChecking = generateId();
  const accSavings  = generateId();
  const accCash     = generateId();

  db.accounts.push(
    { id: accChecking, name: 'Cuenta corriente', type: 'checking', balance: 2850.00, color: '#7aa2f7', createdAt: isoNow(), updatedAt: isoNow() },
    { id: accSavings,  name: 'Ahorros',          type: 'savings',  balance: 8400.00, color: '#9ece6a', createdAt: isoNow(), updatedAt: isoNow() },
    { id: accCash,     name: 'Efectivo',          type: 'cash',     balance:  320.00, color: '#ff9e64', createdAt: isoNow(), updatedAt: isoNow() }
  );

  const cardVisa = generateId();
  db.cards.push(
    { id: cardVisa, name: 'Visa Platinum', limit: 5000, balance: 1240.00, closeDay: 15, color: '#bb9af7', createdAt: isoNow(), updatedAt: isoNow() }
  );

  const txData = [
    { daysAgo: 0,  desc: 'Salario',              cat: 'Ingresos',      amount: 3500, account: accChecking, type: 'income'  },
    { daysAgo: 30, desc: 'Salario',              cat: 'Ingresos',      amount: 3500, account: accChecking, type: 'income'  },
    { daysAgo: 60, desc: 'Salario',              cat: 'Ingresos',      amount: 3500, account: accChecking, type: 'income'  },
    { daysAgo: 15, desc: 'Freelance diseño',     cat: 'Ingresos',      amount:  800, account: accChecking, type: 'income'  },
    { daysAgo: 2,  desc: 'Supermercado',         cat: 'Alimentación',  amount:  180, account: accChecking, type: 'expense', note: 'Compra semanal' },
    { daysAgo: 5,  desc: 'Restaurante',          cat: 'Alimentación',  amount:   45, account: accCash,     type: 'expense' },
    { daysAgo: 3,  desc: 'Gasolina',             cat: 'Transporte',    amount:   60, account: accChecking, type: 'expense' },
    { daysAgo: 1,  desc: 'Gimnasio',             cat: 'Salud',         amount:   40, account: accChecking, type: 'expense' },
    { daysAgo: 4,  desc: 'Netflix',              cat: 'Entretenimiento', amount: 18, account: accChecking, type: 'expense' },
    { daysAgo: 6,  desc: 'Luz',                  cat: 'Servicios',     amount:   85, account: accChecking, type: 'expense' },
    { daysAgo: 7,  desc: 'Internet',             cat: 'Servicios',     amount:   35, account: accChecking, type: 'expense' },
    { daysAgo: 8,  desc: 'Farmacia',             cat: 'Salud',         amount:   28, account: accCash,     type: 'expense' },
    { daysAgo: 35, desc: 'Supermercado',         cat: 'Alimentación',  amount:  165, account: accChecking, type: 'expense' },
    { daysAgo: 38, desc: 'Transporte público',   cat: 'Transporte',    amount:   25, account: accCash,     type: 'expense' },
    { daysAgo: 40, desc: 'Cine',                 cat: 'Entretenimiento', amount:  22, account: accCash,    type: 'expense' },
    { daysAgo: 42, desc: 'Restaurante',          cat: 'Alimentación',  amount:   55, account: accCash,     type: 'expense' },
    { daysAgo: 45, desc: 'Ropa',                 cat: 'Ropa',          amount:  120, account: accChecking, type: 'expense' },
    { daysAgo: 50, desc: 'Médico',               cat: 'Salud',         amount:   80, account: accChecking, type: 'expense' },
    { daysAgo: 62, desc: 'Supermercado',         cat: 'Alimentación',  amount:  175, account: accChecking, type: 'expense' },
    { daysAgo: 65, desc: 'Gasolina',             cat: 'Transporte',    amount:   55, account: accChecking, type: 'expense' },
    { daysAgo: 68, desc: 'Ropa',                 cat: 'Ropa',          amount:   90, account: accChecking, type: 'expense' }
  ];

  db.transactions.push(...txData.map(t => ({
    id: generateId(),
    date: isoDate(t.daysAgo),
    desc: t.desc,
    cat: t.cat,
    amount: t.amount,
    account: t.account,
    type: t.type,
    note: t.note || '',
    createdAt: isoNow(),
    updatedAt: isoNow()
  })));

  db.budgets.push(
    { id: generateId(), cat: 'Alimentación',    limit: 300, color: '#7aa2f7', rollover: 0, createdAt: isoNow(), updatedAt: isoNow() },
    { id: generateId(), cat: 'Transporte',      limit: 150, color: '#ff9e64', rollover: 0, createdAt: isoNow(), updatedAt: isoNow() },
    { id: generateId(), cat: 'Entretenimiento', limit: 80,  color: '#bb9af7', rollover: 0, createdAt: isoNow(), updatedAt: isoNow() },
    { id: generateId(), cat: 'Salud',           limit: 120, color: '#9ece6a', rollover: 0, createdAt: isoNow(), updatedAt: isoNow() }
  );

  db.goals.push(
    { id: generateId(), name: 'Fondo de emergencia', target: 10000, saved: 8400, deadline: isoDate(-180), color: '#9ece6a', createdAt: isoNow(), updatedAt: isoNow() },
    { id: generateId(), name: 'Vacaciones',          target: 2000,  saved: 650,  deadline: isoDate(-120), color: '#7aa2f7', createdAt: isoNow(), updatedAt: isoNow() }
  );

  db.debts.push(
    { id: generateId(), name: 'Préstamo auto', total: 12000, remaining: 7800, rate: 8.5, monthly: 380, type: 'loan',   color: '#f7768e', createdAt: isoNow(), updatedAt: isoNow() },
    { id: generateId(), name: 'Tarjeta Visa',  total: 1240,  remaining: 1240, rate: 24,  monthly: 200, type: 'credit', color: '#bb9af7', createdAt: isoNow(), updatedAt: isoNow() }
  );

  db.recurring.push(
    { id: generateId(), desc: 'Netflix',   cat: 'Entretenimiento', amount: 18,  account: accChecking, day: 5,  createdAt: isoNow(), updatedAt: isoNow() },
    { id: generateId(), desc: 'Gimnasio',  cat: 'Salud',           amount: 40,  account: accChecking, day: 1,  createdAt: isoNow(), updatedAt: isoNow() },
    { id: generateId(), desc: 'Internet',  cat: 'Servicios',       amount: 35,  account: accChecking, day: 10, createdAt: isoNow(), updatedAt: isoNow() },
    { id: generateId(), desc: 'Seguro',    cat: 'Servicios',       amount: 120, account: accChecking, day: 20, createdAt: isoNow(), updatedAt: isoNow() }
  );

  saveData(db);
  return db;
}

// ── Exports ────────────────────────────────────────────────────────────────

const _dbAPI = {
  loadData,
  saveData,
  clearData,
  emptyDB,
  generateId,
  storageUsedKB,
  generateDemoData,
  migrateV1toV2
};

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.db = _dbAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _dbAPI;
}
