# Registro rápido de gastos desde un atajo de iOS

**Fecha:** 2026-07-28
**Estado:** Aprobado, pendiente de implementación
**Módulo nuevo:** `src/modules/quickadd.js`
**Módulos afectados:** `nav.js`, `db.js`, `categorias.js`, `gastos.js`, `configuracion.js`, `build.js`, `src/index.html`

## Problema

Registrar un gasto en la app requiere abrirla, navegar a Gastos, abrir el modal y
llenar cinco campos. En la práctica eso significa que los pagos con Apple Pay —
rápidos, frecuentes y de monto pequeño — no se registran nunca.

La app es una PWA 100% offline sobre `localStorage`, servida como HTML estático:
**no hay backend**. La "ruta" que recibe los datos tiene que ser una ruta de
cliente que la app lee al arrancar, no un endpoint HTTP.

## Alcance

Dentro:

- Ruta de cliente `#quick-add` que acepta descripción y monto por URL.
- Modal de confirmación pre-llenado antes de guardar.
- Categoría por defecto `Apple Pay` más un campo `source` en la transacción.
- Cuenta destino configurable en Configuración.
- Generación y descarga de un archivo `.shortcut` desde la app.
- Instrucciones manuales de respaldo para crear el atajo a mano.

Fuera:

- Sincronización o backend de ningún tipo.
- Captura automática del monto real del pago (iOS no lo expone fuera de
  Apple Card / Apple Cash).
- Registro de ingresos por esta vía: `#quick-add` siempre crea un `expense`.
- Firma criptográfica del `.shortcut`.

## Formato de la URL

```
https://josuepalaci.github.io/finanzas/#quick-add?desc=Super%20Selectos&amount=24.50&src=applepay
```

Ese es el despliegue actual (GitHub Pages bajo el subdirectorio `/finanzas/`),
pero el dominio no se hardcodea: la base se deriva de
`location.origin + location.pathname` en tiempo de generación del atajo.

| Param | Requerido | Regla |
|---|---|---|
| `desc` | sí | `trim()`, truncado a 120 caracteres |
| `amount` | sí | `parseFloat`, debe ser finito y `> 0` |
| `cat` | no | default `Apple Pay`; si el valor no corresponde a una categoría existente, cae al default |
| `src` | no | default `applepay`, se guarda en `tx.source` |

La fecha no viaja por la URL: se toma del momento del registro
(`new Date().toISOString().slice(0, 10)`).

### Por qué hash y no query string

El Service Worker (`src/sw.js:47`) resuelve con `cache.match(event.request)` sin
`ignoreSearch`. Una URL `?desc=...` produciría cache miss contra el `./`
precacheado, y la app fallaría al abrir sin conexión — exactamente el escenario
de uso, pagar en un comercio con mala señal. El fragmento nunca se envía en la
petición, así que el hash funciona offline sin modificar el Service Worker.

## Módulo `quickadd.js`

Responsabilidad única: traducir un intent de URL a un movimiento, y generar el
archivo del atajo.

| Función | Tipo | Contrato |
|---|---|---|
| `parseIntent(hash)` | pura | `string` → `{desc, amount, cat, src}` o `null` |
| `isIOS(nav)` | pura | objeto tipo `navigator` → `boolean` |
| `buildShortcutPlist(baseUrl)` | pura | `string` → XML plist como `string` |
| `consume()` | efectos | lee el hash, lo limpia, abre el modal |
| `downloadShortcut(baseUrl)` | efectos | Blob + `<a download>` |
| `renderInstallCard(container)` | efectos | UI dentro de Configuración |

Las cuatro primeras no tocan DOM ni `localStorage`, y son las que cubren los
tests.

### `parseIntent`

Recibe el hash completo (`#quick-add?desc=...`). Devuelve `null` si el segmento
base no es `quick-add`. Si lo es pero `desc` está vacío o `amount` no es un
número finito mayor que cero, devuelve `null` — la validación de campos vive
aquí, no en el llamador.

### `isIOS`

```js
function isIOS(nav) {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Mac/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}
```

La segunda condición cubre iPadOS 13+, que se identifica como Mac en el user
agent y solo se distingue por soportar más de un punto táctil.

## Flujo

```
Apple Pay → Wallet se cierra → la automatización dispara el atajo
  → "¿En qué gastaste?"  → "¿Cuánto?"
  → URL-encode de la descripción → Abrir URL
  → arranca la app → consume() → history.replaceState limpia el hash
  → modal pre-llenado (cuenta = settings.applePayAccount)
  → Guardar → transacción con source:'applepay' → toast
```

El `history.replaceState` ocurre **antes** de abrir el modal. Sin eso, recargar
la página volvería a disparar el intent y produciría un registro duplicado.

## Reutilización del formulario

El modal de confirmación no se escribe de cero. `gastos._openAddModal(id)` pasa
a `_openAddModal(id, prefill)`, donde `prefill` es el objeto de `parseIntent`
más la cuenta resuelta. El formulario, la validación y `_saveTx` siguen siendo
los mismos, así que un cambio futuro en el modal de gastos aplica solo.

`_saveTx` persiste además `source`, tomado del prefill y conservado en las
ediciones posteriores de la transacción.

## Cambios en archivos existentes

| Archivo | Cambio |
|---|---|
| `nav.js:80,95` | el router parte el hash en `?` antes de resolver la sección; `init()` llama a `MF.quickadd.consume()` |
| `db.js:41` | `applePayAccount: ''` en `settings` de `emptyDB()` |
| `categorias.js:4` | nueva default `{ name: 'Apple Pay', color: '#a9b1d6', icon: 'coins' }`; exportar `DEFAULT_CATS` en `_categoriasAPI` |
| `gastos.js:164` | `_openAddModal(id)` pasa a `_openAddModal(id, prefill)`; se exporta como `openAddModal` |
| `gastos.js:174` | consume `MF.categorias.DEFAULT_CATS` en vez del array literal duplicado |
| `gastos.js:211` | `_saveTx` persiste `source` |
| `gastos.js:_renderList` | badge con el origen en cada transacción que tenga `source` |
| `configuracion.js` | card de instalación, solo en iOS |
| `build.js:82` | `quickadd.js` en `MODULE_ORDER`, después de `categorias.js` |
| `src/index.html` | `<script src="modules/quickadd.js">` |

Sobre el orden de carga: `nav.js` se carga antes que `quickadd.js`, pero la
referencia a `MF.quickadd.consume()` se resuelve dentro de `init()`, que el
build invoca al final del bundle. Lo mismo aplica a la llamada de `quickadd` a
`MF.gastos.openAddModal`. Ningún módulo necesita al otro en tiempo de carga.

### Deuda que se paga de paso

`gastos.js:174` duplica hoy la lista de categorías por defecto que ya vive en
`categorias.js:4`. Agregar "Apple Pay" obliga a tocar ambas; si se dejaran
separadas, la categoría aparecería en una pantalla y no en la otra. Se unifica
exponiendo `MF.categorias.DEFAULT_CATS` y consumiéndola desde `gastos.js`. El
orden de `MODULE_ORDER` ya carga `categorias.js` antes que `gastos.js`, así que
no hace falta reordenar.

### Compatibilidad de datos

`applePayAccount` se agrega a `emptyDB()` pero **no** requiere migración a v3.
Las bases existentes se leen defensivamente con
`db.settings?.applePayAccount ?? ''`, siguiendo el patrón aditivo ya usado para
`settings.salario`. Una base v2 sin el campo funciona: cae al fallback de la
primera cuenta.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| `desc` vacío o `amount` inválido | toast de error, modal de gasto vacío — no se pierde el flujo |
| No hay cuentas creadas | toast "Crea una cuenta primero" y navega a `#cuentas` |
| `applePayAccount` apunta a una cuenta borrada | cae a la primera cuenta disponible |
| `desc` mayor a 120 caracteres | se trunca |
| Hash malformado o sección desconocida | se ignora, la app abre en dashboard |

### Seguridad

`desc` es entrada externa no confiable que llega por URL. Debe pasar por
`MF.nav.esc()` antes de cualquier interpolación en HTML, igual que el resto de
datos de usuario según la convención de `nav.js:26`. Es el punto de riesgo XSS
de esta feature y el foco de la revisión de código.

## Pantalla de instalación

Vive dentro de Configuración, como card "Registro rápido desde iOS". Contiene:

- Selector de cuenta destino, persistido en `settings.applePayAccount`.
- **Sin enlace guardado:** explicación de la firma, los pasos manuales visibles,
  botón "Copiar URL base" y campo para pegar el enlace de iCloud.
- **Con enlace guardado:** botón "Instalar atajo", "Copiar URL base" y "Olvidar
  enlace".
- Acordeón "Opciones avanzadas" con la descarga del `.shortcut` sin firmar.

El enlace se valida con `normalizeShortcutLink()`, que exige `https` y host
`icloud.com`/`www.icloud.com` con ruta `/shortcuts/<id>`. Nunca se interpola en
el markup: el botón de instalar lo relee de la DB y lo revalida justo antes de
abrirlo, así un valor manipulado en `localStorage` no llega a `window.open`.

La `baseUrl` se deriva de `location.origin + location.pathname` en tiempo de
generación. El dominio no se hardcodea, así que el atajo generado desde una
copia local apunta a esa copia local.

El `pathname` se normaliza antes de usarlo: si apunta a un directorio sin barra
final (`/finanzas`), se le agrega. GitHub Pages responde un 301 hacia
`/finanzas/`, y un atajo que apunte a la forma sin barra dependería de que el
fragmento sobreviva esa redirección. Las rutas con extensión de archivo
(`/finanzas/index.html`) se dejan intactas.

### Visibilidad condicionada a iOS

La card se renderiza solo si `isIOS(navigator)` devuelve `true`. En cualquier
otra plataforma no aparece.

Consecuencia aceptada: desde escritorio no se puede elegir la cuenta destino.
El fallback a la primera cuenta cubre ese caso, y la ruta `#quick-add` sigue
funcionando en todas las plataformas — lo único que se oculta es la UI de
instalación, que no tiene sentido fuera de iOS.

### Advertencia de almacenamiento

Si la app corre en `display-mode: standalone`, la card muestra un aviso: los
enlaces abiertos desde Atajos van a Safari, cuyo `localStorage` es un almacén
distinto al de la PWA instalada, así que el gasto no aparecería en la app. La
mitigación es activar *Ajustes → Apps → Safari → Abrir enlaces en app web*
(iOS 18.4 o superior).

## El archivo `.shortcut`

`buildShortcutPlist` genera un plist XML con esta secuencia de acciones:

1. `is.workflow.actions.ask` — texto, "¿En qué gastaste?"
2. `is.workflow.actions.ask` — número, "¿Cuánto?"
3. `is.workflow.actions.urlencode` — sobre la descripción
4. `is.workflow.actions.openurl` — URL construida con `WFTextTokenString`

El paso 3 no es opcional: sin él, una descripción con espacios o acentos rompe
la URL.

La interpolación de las respuestas usa `WFTextTokenString`, con el carácter
`U+FFFC` (object replacement character) como marcador de posición y
`attachmentsByRange` mapeando cada posición al UUID de la acción
correspondiente. Cada acción lleva un `UUID` constante escrito en el código, no
generado al azar, para que dos descargas del mismo atajo sean byte a byte
idénticas y los tests puedan compararlas.

### Riesgo conocido — confirmado en dispositivo (2026-07-29)

El plist va sin firmar y **iOS no lo importa**. El diseño original asumía que
bastaba con *Ajustes → Atajos → Permitir atajos no confiables*; esa suposición
era incorrecta. Desde iOS 15 los archivos `.shortcut` requieren firma de Apple,
y ese ajuste gobierna otra cosa: los atajos compartidos por enlace, no los
archivos plist crudos. La firma se emite en los servidores de Apple, así que no
hay forma de producirla desde la app ni offline.

**Vía de instalación adoptada.** El usuario crea el atajo a mano una vez y lo
comparte con *Compartir → Copiar enlace de iCloud*: Apple lo notariza en ese
momento y devuelve un `https://www.icloud.com/shortcuts/…` ya firmado. Ese
enlace se guarda en `settings.applePayShortcutUrl` y a partir de ahí la card
ofrece instalación de un toque, sin ajustes previos y reutilizable en cualquier
iPhone.

Por eso los pasos manuales pasaron de estar escondidos tras un `<details>` a ser
la vía principal de la card. La descarga del `.shortcut` sin firmar queda en
"Opciones avanzadas", útil solo para quien tenga un Mac y pueda ejecutar
`shortcuts sign -m anyone -i entrada.shortcut -o firmado.shortcut`.

### Trigger de la automatización

La automatización nativa de tipo "Transacción" solo existe para Apple Card,
Apple Cash y Apple Savings, disponibles únicamente en Estados Unidos. Fuera de
ahí, las instrucciones documentan el equivalente práctico: una automatización
personal **App → Wallet → Se cierra**, que dispara justo al terminar el pago.

## Testing

`test/quickadd.test.js`, con `node --test` sobre las funciones puras:

- `parseIntent` con hash válido, devuelve los cuatro campos.
- `parseIntent` con `desc` vacío, con `amount` en cero, negativo y no numérico:
  `null` en todos los casos.
- `parseIntent` con `desc` de más de 120 caracteres: trunca.
- `parseIntent` con sección distinta a `quick-add`: `null`.
- `parseIntent` con descripción URL-encodeada con acentos: decodifica bien.
- `isIOS` con user agents de iPhone, iPad, iPadOS 13+ (Mac con touch),
  macOS de escritorio y Windows.
- `buildShortcutPlist` produce un plist con las cuatro acciones esperadas y con
  la `baseUrl` recibida.
- `buildShortcutPlist` es determinista: dos llamadas con la misma entrada
  devuelven strings idénticos.
