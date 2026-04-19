// test/sync.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

global.window = { MF: { db: { loadData: () => ({}), saveData: () => {} } } };
global.crypto = { randomUUID: () => require('crypto').randomUUID() };

const { mergeCollection, mergeDB, calcMergePreview } = require('../src/modules/sync');

function makeItem(id, updatedAt, extra = {}) {
  return { id, updatedAt, ...extra };
}

function ago(ms) {
  return new Date(Date.now() - ms).toISOString();
}

describe('mergeCollection', () => {
  test('Regla 1: ID nuevo en incoming → se agrega', () => {
    const local    = [makeItem('aaa', ago(5000), { name: 'Local' })];
    const incoming = [makeItem('bbb', ago(1000), { name: 'Nuevo' })];
    const result   = mergeCollection(local, incoming);
    assert.equal(result.length, 2);
    assert.ok(result.find(r => r.id === 'bbb'));
  });

  test('Regla 2: ID existe y incoming más reciente → reemplaza local', () => {
    const local    = [makeItem('aaa', ago(5000), { name: 'Viejo' })];
    const incoming = [makeItem('aaa', ago(1000), { name: 'Nuevo' })];
    const result   = mergeCollection(local, incoming);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Nuevo');
  });

  test('Regla 3: ID existe y local más reciente → se mantiene local', () => {
    const local    = [makeItem('aaa', ago(1000), { name: 'Reciente' })];
    const incoming = [makeItem('aaa', ago(5000), { name: 'Antiguo' })];
    const result   = mergeCollection(local, incoming);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Reciente');
  });

  test('Regla 4: ID solo local (no en incoming) → se mantiene', () => {
    const local    = [makeItem('aaa', ago(1000), { name: 'Local' })];
    const incoming = [makeItem('bbb', ago(1000), { name: 'Otro' })];
    const result   = mergeCollection(local, incoming);
    assert.equal(result.length, 2);
    assert.ok(result.find(r => r.id === 'aaa'));
  });

  test('IDs iguales con mismo updatedAt (diferencia < 1s) → se mantiene local (unchanged)', () => {
    const ts     = ago(5000);
    const local  = [makeItem('aaa', ts, { name: 'Local' })];
    const inc    = [makeItem('aaa', ts, { name: 'Otro' })];
    const result = mergeCollection(local, inc);
    assert.equal(result[0].name, 'Local');
  });

  test('incoming vacío → retorna local intacto', () => {
    const local  = [makeItem('aaa', ago(1000)), makeItem('bbb', ago(2000))];
    const result = mergeCollection(local, []);
    assert.deepEqual(result, local);
  });

  test('local vacío → retorna todos los items de incoming', () => {
    const incoming = [makeItem('aaa', ago(1000)), makeItem('bbb', ago(2000))];
    const result   = mergeCollection([], incoming);
    assert.equal(result.length, 2);
  });
});

describe('mergeDB', () => {
  test('merge completo de todas las colecciones', () => {
    const local = {
      accounts:     [makeItem('acc1', ago(5000), { name: 'Cuenta local' })],
      cards:        [],
      transactions: [makeItem('tx1', ago(5000), { amount: 100 })],
      budgets:      [], goals: [], debts: [], recurring: [],
      transfers: [], installments: [], categories: []
    };

    const incoming = {
      accounts:     [makeItem('acc2', ago(1000), { name: 'Cuenta nueva' })],
      cards:        [],
      transactions: [makeItem('tx2', ago(1000), { amount: 200 })],
      budgets:      [], goals: [], debts: [], recurring: [],
      transfers: [], installments: [], categories: []
    };

    const result = mergeDB(local, incoming);
    assert.equal(result.accounts.length, 2);
    assert.equal(result.transactions.length, 2);
  });

  test('no modifica collections ausentes en incoming', () => {
    const local = {
      accounts: [makeItem('a1', ago(1000))],
      cards: [], transactions: [], budgets: [], goals: [],
      debts: [], recurring: [], transfers: [], installments: [], categories: []
    };
    const incoming = {
      accounts: [], cards: [], transactions: [], budgets: [], goals: [],
      debts: [], recurring: [], transfers: [], installments: [], categories: []
    };
    const result = mergeDB(local, incoming);
    assert.equal(result.accounts.length, 1);
  });
});

describe('calcMergePreview', () => {
  function emptyDB() {
    return { accounts: [], cards: [], transactions: [], budgets: [], goals: [],
             debts: [], recurring: [], transfers: [], installments: [], categories: [] };
  }

  test('newRecords cuenta IDs que no existen en local', () => {
    const local    = { ...emptyDB(), transactions: [makeItem('tx1', ago(1000))] };
    const incoming = { ...emptyDB(), transactions: [makeItem('tx2', ago(500))] };
    const preview  = calcMergePreview(local, incoming);
    assert.equal(preview.newRecords, 1);
    assert.equal(preview.unchanged, 0);
    assert.equal(preview.conflicts, 0);
  });

  test('unchanged cuenta IDs con timestamps idénticos', () => {
    const ts       = ago(5000);
    const local    = { ...emptyDB(), accounts: [makeItem('a1', ts)] };
    const incoming = { ...emptyDB(), accounts: [makeItem('a1', ts)] };
    const preview  = calcMergePreview(local, incoming);
    assert.equal(preview.unchanged, 1);
    assert.equal(preview.newRecords, 0);
  });

  test('conflicts cuenta IDs donde incoming es más reciente', () => {
    const local    = { ...emptyDB(), accounts: [makeItem('a1', ago(5000))] };
    const incoming = { ...emptyDB(), accounts: [makeItem('a1', ago(1000))] };
    const preview  = calcMergePreview(local, incoming);
    assert.equal(preview.conflicts, 1);
  });

  test('localWins cuenta IDs donde local es más reciente', () => {
    const local    = { ...emptyDB(), accounts: [makeItem('a1', ago(1000))] };
    const incoming = { ...emptyDB(), accounts: [makeItem('a1', ago(5000))] };
    const preview  = calcMergePreview(local, incoming);
    assert.equal(preview.localWins, 1);
  });
});
