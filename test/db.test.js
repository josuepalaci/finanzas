// test/db.test.js
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let _store = {};

global.localStorage = {
  getItem(k)    { return _store[k] ?? null; },
  setItem(k, v) { _store[k] = String(v); },
  removeItem(k) { delete _store[k]; },
  clear()       { _store = {}; }
};

global.crypto = {
  randomUUID() { return require('crypto').randomUUID(); }
};

global.window = {};

const db = require('../src/modules/db');

function resetStorage() { _store = {}; }

describe('generateId', () => {
  test('genera un UUID válido', () => {
    const id = db.generateId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('genera IDs únicos', () => {
    const ids = new Set(Array.from({ length: 100 }, () => db.generateId()));
    assert.equal(ids.size, 100);
  });
});

describe('emptyDB', () => {
  test('retorna la estructura completa de v2', () => {
    const empty = db.emptyDB();
    assert.equal(empty._meta.version, 2);
    assert.ok(empty._meta.deviceId);
    assert.deepEqual(empty.accounts, []);
    assert.deepEqual(empty.transactions, []);
    assert.deepEqual(empty.categories, []);
    assert.equal(empty.settings.theme, 'dark');
    assert.equal(empty.settings.currency, '$');
  });

  test('cada llamada genera un deviceId distinto', () => {
    const a = db.emptyDB();
    const b = db.emptyDB();
    assert.notEqual(a._meta.deviceId, b._meta.deviceId);
  });
});

describe('loadData / saveData', () => {
  beforeEach(resetStorage);

  test('retorna emptyDB cuando no hay datos guardados', () => {
    const data = db.loadData();
    assert.equal(data._meta.version, 2);
    assert.deepEqual(data.transactions, []);
  });

  test('roundtrip: guarda y carga los mismos datos', () => {
    const original = db.emptyDB();
    original.transactions.push({ id: db.generateId(), desc: 'Test', amount: 100 });
    db.saveData(original);

    const loaded = db.loadData();
    assert.equal(loaded.transactions.length, 1);
    assert.equal(loaded.transactions[0].desc, 'Test');
    assert.equal(loaded.transactions[0].amount, 100);
  });

  test('no falla con localStorage corrupto', () => {
    _store['misfinanzas_v2'] = 'not-valid-json{{';
    const data = db.loadData();
    assert.equal(data._meta.version, 2);
    assert.deepEqual(data.transactions, []);
  });
});

describe('migrateV1toV2', () => {
  beforeEach(resetStorage);

  function buildV1DB() {
    return {
      accounts: [
        { id: 'abc1234', name: 'Cuenta corriente', type: 'checking', balance: 1000, color: '#7aa2f7' }
      ],
      cards: [],
      transactions: [
        { id: 'def5678', date: '2026-01-15', desc: 'Supermercado', cat: 'Alimentación', amount: 50, account: 'abc1234', type: 'expense' },
        { id: 'ghi9012', date: '2026-01-10', desc: 'Salario',      cat: 'Ingresos',      amount: 2000, account: 'abc1234', type: 'income' }
      ],
      budgets: [
        { id: 'bud1234', cat: 'Alimentación', limit: 300, color: '#7aa2f7' }
      ],
      goals: [], debts: [], recurring: [], transfers: [], installments: []
    };
  }

  test('upgrades IDs cortos a UUIDs', () => {
    const v1 = buildV1DB();
    const v2 = db.migrateV1toV2(v1);

    const accountId = v2.accounts[0].id;
    assert.match(accountId, /^[0-9a-f-]{36}$/);

    const txId = v2.transactions[0].id;
    assert.match(txId, /^[0-9a-f-]{36}$/);
  });

  test('preserva la referencia account en transactions', () => {
    const v1 = buildV1DB();
    const v2 = db.migrateV1toV2(v1);

    const newAccountId = v2.accounts[0].id;
    for (const tx of v2.transactions) {
      assert.equal(tx.account, newAccountId);
    }
  });

  test('agrega campos faltantes con valores por defecto', () => {
    const v1 = buildV1DB();
    const v2 = db.migrateV1toV2(v1);

    for (const tx of v2.transactions) {
      assert.equal(typeof tx.note, 'string');
      assert.ok(tx.createdAt);
      assert.ok(tx.updatedAt);
    }

    for (const b of v2.budgets) {
      assert.equal(b.rollover, 0);
      assert.ok(b.createdAt);
    }
  });

  test('resultado tiene _meta.version = 2', () => {
    const v2 = db.migrateV1toV2(buildV1DB());
    assert.equal(v2._meta.version, 2);
    assert.ok(v2._meta.deviceId);
  });

  test('loadData migra automáticamente datos v1 de localStorage', () => {
    const v1 = buildV1DB();
    _store['misfinanzas_v1'] = JSON.stringify(v1);

    const loaded = db.loadData();
    assert.equal(loaded._meta.version, 2);
    assert.equal(loaded.transactions.length, 2);
    assert.ok(_store['misfinanzas_v2']);
  });

  test('IDs ya en formato UUID no se re-generan', () => {
    const uuid = require('crypto').randomUUID();
    const v1 = buildV1DB();
    v1.accounts[0].id = uuid;
    const v2 = db.migrateV1toV2(v1);
    assert.equal(v2.accounts[0].id, uuid);
  });
});

describe('generateDemoData', () => {
  beforeEach(resetStorage);

  test('popula la DB con datos de ejemplo', () => {
    const result = db.generateDemoData();
    assert.ok(result.accounts.length >= 2);
    assert.ok(result.transactions.length >= 10);
    assert.ok(result.budgets.length >= 3);
  });

  test('los datos se persisten en localStorage', () => {
    db.generateDemoData();
    const loaded = db.loadData();
    assert.ok(loaded.accounts.length >= 2);
  });

  test('llamada repetida acumula datos (no reemplaza)', () => {
    db.generateDemoData();
    const first = db.loadData();
    db.generateDemoData();
    const second = db.loadData();
    assert.ok(second.accounts.length >= first.accounts.length);
  });
});
