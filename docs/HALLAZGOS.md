# Hallazgos de la revisión completa — 2026-08-02

Revisión de todo el código fuente, estilos, tests y CI (verificado contra origin/master `187d63b`, que ya incluía los fixes de safe-areas, SW e ícono de julio). Ordenado por severidad.

> Nota: durante la revisión el working tree local estaba 6 commits detrás de origin/master; ya se actualizó. Los hallazgos de abajo están verificados contra el código actual.

## 🐛 Bugs vigentes

### B1. Bug de zona horaria en todo el cálculo de fechas (confirmado: `npm test` falla hoy — 170/171)
El código usa `new Date().toISOString().slice(0,10|7)` (UTC) para "hoy" y "mes actual", pero las fechas de transacción son locales. En El Salvador (UTC−6), **después de las 6 p.m. "hoy" en UTC ya es mañana**. Afecta a 13 módulos (`grep -rl "toISOString().slice" src/modules/`):
- gastos.js / quickadd.js: fecha por defecto de nueva transacción = mañana; etiquetas Hoy/Ayer corridas.
- nav.js: banner "No has registrado movimientos hoy" y notificación diaria comparan contra el día equivocado.
- dashboard/presupuestos/reporte/analytics/recurrentes: "mes actual" incorrecto en las noches de fin de mes. El test `agrupa gastos por categoría correctamente` falla hoy (2 ago, 1:30 p.m. CST) exactamente por esto.
**Fix sugerido:** helpers únicos `localISODate()` / `localMonth()` con `getFullYear/getMonth/getDate` y reemplazo global.

### B2. Botones editar/eliminar invisibles en móvil (Gastos, Transferencias, Recurrentes)
`.list-item__actions { opacity: 0 }` visible solo con `:hover` (components.css:373-380). En táctil no hay hover → en la vista más usada **no se puede editar/borrar una transacción**. Otras vistas lo parchean con `style="opacity:1"` inline. Fix: `@media (hover: none) { .list-item__actions { opacity: 1 } }`.

### B3. El deploy no es automático: el workflow dispara en `main` pero la rama es `master`
`.github/workflows/main.yml:5` → `branches: [main]`. Todos los runs recientes fueron `workflow_dispatch` (manuales). Un push a master no publica nada hasta que alguien lance el workflow a mano. Fix: `branches: [master]`.

### B4. Ocultar categorías predeterminadas no tiene efecto
categorias.js guarda `settings.hiddenCats`, pero gastos.js:185 (via `DEFAULT_CATS`) y presupuestos.js nunca lo consultan. Una categoría "oculta" sigue apareciendo en los formularios.

### B5. Ícono de pantalla de inicio en iOS sigue sin funcionar
`apple-touch-icon` existe pero es un SVG data-URI (src/index.html:20) — iOS solo acepta **PNG** en apple-touch-icon; hoy cae al fallback (screenshot). Siendo app móvil-first para iPhone, hace falta un PNG 180×180 real (puede generarse en el build desde el SVG).

### B6. Import: "Dispositivo origen" muestra la fecha
sync.js:172 interpola `preview.exportedAt` bajo la etiqueta "Dispositivo origen" (el `deviceId` nunca se muestra).

### B7. Categorías personalizadas se crean sin `createdAt`/`updatedAt`
categorias.js:122. El merge de sync resuelve por timestamp; sin él, una categoría editada en otro dispositivo nunca gana el merge.

### B8. Editar deuda con "Saldo restante" vacío guarda `NaN`
deudas.js:208: en edición `remaining = parseFloat('') = NaN` se asigna sin validar (creación sí tiene fallback `remaining || total`).

### B9. `npm run dev` abre un archivo muerto
package.json abre `dist/MisFinanzas.html`, congelado desde abril; el build genera `dist/index.html`.

## 💡 Mejoras funcionales

### M1. Las transacciones no afectan los saldos (decisión de diseño a revisar)
Registrar gasto/ingreso, transferencia, pago de deuda o cuota **no ajusta ningún saldo** de cuenta/tarjeta — todo saldo es manual. El "Balance total" del dashboard y el patrimonio se desactualizan en cuanto usas la app. Si es intencional, explicarlo en la UI; si no, es la mejora de mayor impacto de toda la app.

### M2. Recurrentes vencidos: falta "Registrar ahora" de 1 tap
La alerta detecta vencidos pero obliga a ir a Gastos y teclear todo de nuevo. Un botón por item que abra el modal pre-llenado (patrón ya existente: `MF.gastos.openAddModal(null, prefill)` de quickadd) cerraría el loop. La detección matchea por `desc+cat` exactos — frágil si editas la descripción.

### M3. Pagos de deuda/cuota no crean transacción
No aparecen en gastos del mes, presupuestos ni analytics → health score y ahorro mensual sobreestimados.

### M4. Import no acepta backups v1
`importIncremental` rechaza archivos sin `_meta`, aunque `migrateV1toV2` existe. Migrar-luego-mergear permitiría traer datos del app v1.

### M5. Emojis de categorías personalizadas no se ven en la lista de transacciones
gastos.js `_catIcon` solo mapea las predeterminadas.

### M6. README desactualizado
"Salario" es la Calculadora Salarial de El Salvador (no "info de salario para proyecciones"); no hay reportes diario/anual, solo mensual; la estructura de `dist/` menciona `MisFinanzas.html`.

### M7. Dead code: dashboard.js `CAT_COLORS` ya no se usa.

## 📱 UX móvil (uso principal)

### U1. Botón atrás de Android no cierra modal/drawer
Escape ya funciona (nav.js:68) pero en una PWA Android el botón atrás sale de la app con un modal abierto. Se intercepta con un history state al abrir capas.

### U2. El FAB tapa la última fila de las listas
El swap al topbar solo ocurre al llegar al fondo; en scroll intermedio cubre monto/acciones del último item visible. Un `padding-bottom` extra (~72px) en las vistas de lista es más predecible.

### U3. Inputs de monto sin `inputmode="decimal"`
Con `type="number"` a secas, iOS puede mostrar teclado sin punto decimal según región.

### U4. "Más" (drawer) concentra 9 secciones — las frecuentes (Reporte, Deudas) siempre a 2 taps. Considerar acceso directo desde dashboard.

### U5. Confirmación de borrado genérica — "¿Eliminar esta transacción?" sin decir cuál (descripción + monto en el texto evitaría borrados equivocados).

### U6. Toggle de rollover global en la cabecera de Presupuestos — un tap accidental cambia el cálculo de todos los presupuestos sin confirmación.

## ✅ Verificados como ya corregidos (commits de julio)
- SW precacheaba `MisFinanzas.html` inexistente → ahora `./index.html`.
- Safe-areas (notch / home indicator) en topbar, bottom-tabs, FAB y modales.
- `start_url` hardcodeado `/finanzas/` → ahora `./`.
- Grid inline `1fr 1fr` del Reporte → clase responsive.
- Escape cierra modal/drawer.
- gastos.js consume `MF.categorias.DEFAULT_CATS` (ya no duplica la lista).
