# Outbox del atajo: sincronizar gastos de Safari a la PWA instalada

**Fecha:** 2026-08-02
**Estado:** Aprobado
**Módulo afectado principal:** `src/modules/quickadd.js`
**Módulos afectados:** `db.js`, `gastos.js`, `nav.js`, `src/index.html`, `src/styles/components.css`

## Problema

El atajo de iOS abre `#quick-add` en Safari. Safari y la PWA instalada en la
pantalla de inicio tienen almacenamiento **particionado**: el gasto queda
guardado en la copia de Safari y la app instalada nunca lo ve. El ajuste de
iOS 18.4 ("Abrir enlaces en app web") lo mitiga, pero depende de la versión de
iOS y de un ajuste escondido. La acción "Abrir app" de Atajos **no lista web
apps** (verificado en dispositivo, 2026-08-02), así que tampoco se puede saltar
Safari.

## Solución

La copia de Safari se asume como **auxiliar**: un buzón de salida. Los gastos
que entran por el atajo se acumulan ahí y viajan a la app instalada por el
portapapeles, con dedup por UUID en el destino.

```
Atajo → Safari #quick-add → guardar gasto (normal)
                          → si NO standalone y source presente: copia a db.quickaddOutbox
Safari: banner "N gastos del atajo listos — Copiar · Vaciar"
  Copiar → portapapeles: "MFSYNC1:" + JSON array
Usuario abre la PWA instalada
  standalone + foreground → banner "¿Sincronizar gastos del atajo? — Pegar · ✕"
  Pegar → navigator.clipboard.readText() (iOS pide confirmación)
        → parseOutboxPayload → importOutboxTxs → toast "N importados, M ya existían"
        → limpiar portapapeles
```

Solo las **transacciones** viajan por este canal. Nada más.

## Datos

- `db.quickaddOutbox`: array de transacciones (shape completo de tx, con su
  UUID original). Aditivo — sin migración; acceso defensivo
  (`db.quickaddOutbox || []`). Se agrega a `emptyDB()`.
- **No** se agrega a `_COLLECTIONS` de sync.js: es un buffer local temporal,
  no debe viajar en el export/merge normal. `exportJSON` lo incluye de facto
  (exporta el objeto completo); aceptable e inocuo — el merge lo ignora.

## Payload del portapapeles

```
MFSYNC1:[{"id":"…","desc":"…","amount":24.5,"cat":"Apple Pay","date":"2026-08-02",
"note":"","type":"expense","source":"applepay","createdAt":"…","updatedAt":"…"}, …]
```

- Prefijo `MFSYNC1:` versiona el formato.
- El campo `account` NO viaja: los UUID de cuenta difieren entre copias. El
  destino asigna cuenta al importar.

## API en quickadd.js (funciones puras, testeables)

| Función | Contrato |
|---|---|
| `buildOutboxPayload(txs)` | array → string `MFSYNC1:…` |
| `parseOutboxPayload(str)` | string → array de txs válidas o `null`. Valida: prefijo, JSON parseable, array, máx 100 items; por item: `id` string no vacío, `desc` string no vacía (trunc. 120), `amount` finito > 0, `type` ∈ {expense, income}, `date` con forma `YYYY-MM-DD`. Item inválido → descartado; si todos inválidos → `null`. |
| `addToOutbox(db, tx)` | agrega copia de tx (sin `account`) al outbox; el llamador guarda |
| `importOutboxTxs(db, txs, accountId)` | por tx: si `id` ya existe en `db.transactions` → skipped++; si no → asigna `account: accountId`, `applyTxEffect`, push, imported++. Devuelve `{imported, skipped}`. El llamador guarda. |

Funciones con DOM/efectos: `copyOutbox()` (escribe el payload al clipboard + toast; NO vacía el buzón),
`renderOutboxBanner()` (Safari), `renderSyncBanner()` (instalada),
`syncFromClipboard()` (readText → parse → import → toast → limpiar clipboard).

## Disparadores

- **Llenar el buzón** — `gastos._saveTx`: tras guardar una tx nueva con
  `source` no vacío y `!MF.pwa.isInstalled()`, llama
  `MF.quickadd.addToOutbox(db, tx)` antes de `saveData`. (Las ediciones no
  re-encolan; los recurrentes no llevan `source`, no encolan.)
- **Banner Safari** (`!isInstalled()` y outbox no vacío): banner global bajo el
  topbar (mismo slot/estilo que `reminder-banner`): texto con el conteo +
  botones **Copiar** y **Vaciar**. Tras Copiar → toast "Copiados. Abre tu app
  instalada y toca Pegar." El buzón NO se vacía al copiar (dedup hace inocuo
  re-pegar); se vacía solo con **Vaciar** (con confirmación) para poder
  reintentar si el pegado falla.
- **Banner app instalada** (`isInstalled()`): al cargar y en cada
  `visibilitychange → visible`, mostrar banner descartable "¿Sincronizar gastos
  del atajo? — **Pegar** · ✕". Auto-oculta a los 15 s. Sin señal previa del
  contenido del portapapeles (imposible sin gesto): si el usuario toca Pegar y
  no hay payload válido → toast "No hay gastos del atajo en el portapapeles" y
  se oculta.
- **Cuenta destino al importar**: `settings.applePayAccount` válida, o la
  primera cuenta. Sin cuentas → toast "Crea una cuenta primero" y nav a
  `#cuentas` (mismo patrón que `consume()`).

## Seguridad

El portapapeles es entrada no confiable. `parseOutboxPayload` valida todo
(tipos, límites, truncados); los datos importados se renderizan con `esc()`
como cualquier dato de usuario. No se ejecuta nada del payload. Límite de 100
items por pegado.

## Errores

| Caso | Comportamiento |
|---|---|
| Clipboard sin permiso / lectura falla | toast error, banner sigue disponible |
| Payload sin prefijo o corrupto | toast "No hay gastos del atajo en el portapapeles" |
| Todos los ids ya existen | toast "0 importados, N ya existían" |
| Sin cuentas en la app instalada | toast + nav a cuentas, no se importa |
| Outbox > 100 items | `buildOutboxPayload` incluye solo los 100 más recientes |

## Testing (`test/quickadd.test.js`)

- `buildOutboxPayload`: round-trip con `parseOutboxPayload`; excluye `account`;
  respeta el límite de 100.
- `parseOutboxPayload`: null ante no-string, sin prefijo, JSON inválido,
  no-array; descarta items con amount ≤ 0/no finito, sin id, sin desc, type
  inválido, date malformada; trunca desc a 120.
- `addToOutbox`: agrega sin `account`; crea el array si no existe.
- `importOutboxTxs`: importa asignando cuenta y ajustando saldo
  (`applyTxEffect`); dedup por id (skipped); `{imported, skipped}` correcto;
  no toca saldo en los skipped.

## Fuera de alcance

- Sincronizar cualquier cosa que no sea transacciones.
- Backend o push (filosofía 100% offline).
- Detección automática del contenido del portapapeles sin gesto (imposible en iOS).
- Cambios al atajo `.shortcut` (sigue igual: abre `#quick-add` en Safari).
