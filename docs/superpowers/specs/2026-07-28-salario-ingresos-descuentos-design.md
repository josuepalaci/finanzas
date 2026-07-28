# Ingresos y descuentos adicionales en `/#salario`

**Fecha:** 2026-07-28
**Estado:** Aprobado, pendiente de implementación
**Módulo afectado:** `src/modules/salario.js`, pestaña "Relación Laboral"

## Problema

La calculadora salarial solo acepta un salario bruto y aplica las deducciones
legales sobre él. Una planilla real casi nunca es tan simple: incluye horas
extra, días feriados trabajados, días no laborados y descuentos administrativos
como préstamos o anticipos. Hoy el usuario tiene que calcular todo eso aparte.

## Alcance

Dentro:

- Horas extra diurnas y nocturnas (entrada en horas).
- Días feriados trabajados (entrada en días).
- Días no trabajados (entrada en días, descuenta).
- Lista libre de otros ingresos (descripción, monto, gravable sí/no).
- Lista libre de otros descuentos (descripción, monto).
- Persistencia de todo lo anterior más bruto, frecuencia e INSAFORP.

Fuera:

- La pestaña "Prestador de Servicio" no cambia y sigue sin persistir.
- No se generan transacciones ni se integra con cuentas o presupuestos.
- No se calcula aguinaldo, vacaciones ni indemnización.

## Modelo de cálculo

### Base horaria

```
salarioDiario = frecuencia === 'quincenal' ? bruto / 15 : bruto / 30
horaOrdinaria = salarioDiario / 8
```

La jornada ordinaria diurna en El Salvador es de 8 horas (Art. 161 CT). El mes
comercial de 30 días y la quincena de 15 son la convención de planilla local.

### Conceptos

| Concepto | Entrada | Fórmula | Signo |
|---|---|---|---|
| Hora extra diurna | horas | `horas × horaOrdinaria × 2.00` | + |
| Hora extra nocturna | horas | `horas × horaOrdinaria × 2.50` | + |
| Día feriado trabajado | días | `días × salarioDiario × 2.00` | + |
| Días no trabajados | días | `días × salarioDiario` | − |
| Otros ingresos | desc + monto + gravable | monto | + |
| Otros descuentos | desc + monto | monto | − |

Justificación de los multiplicadores:

- **Extra diurna ×2.00** — Art. 169 CT: recargo del 100 % sobre el salario
  ordinario.
- **Extra nocturna ×2.50** — la hora nocturna ordinaria lleva recargo del 25 %
  (Art. 168 CT); sobre ella se aplica el recargo del 100 % por extraordinaria:
  `1.25 × 2 = 2.50`.
- **Feriado trabajado ×2.00** — Art. 192 CT: salario ordinario más recargo del
  100 %. Existe la interpretación de pagar solo el recargo (×1.00) porque el
  salario mensual ya cubre el día de asueto. Se adopta ×2.00 y se documenta el
  supuesto con un texto de ayuda bajo el campo.

### Orden de aplicación

```
baseGravable   = bruto
               + extraDiurna + extraNocturna + feriados
               − diasNoTrabajados
               + suma(otrosIngresos donde gravable === true)

totalDevengado = baseGravable + suma(otrosIngresos donde gravable === false)

ISSS = min(baseGravable, 1000)    × 0.03
AFP  = min(baseGravable, 7045.06) × 0.0725
ISR  = tablaISR(baseGravable − ISSS − AFP, frecuencia)

neto = totalDevengado − ISSS − AFP − ISR − suma(otrosDescuentos)
```

Los topes de ISSS y AFP se evalúan contra `baseGravable`, no contra `bruto`.
Los otros descuentos se restan al final porque son retenciones administrativas
posteriores a las deducciones de ley y no reducen la base imponible.

### Costo patronal

Las aportaciones patronales se calculan sobre `baseGravable`; el costo total
parte de `totalDevengado`:

```
ISSSPat  = min(baseGravable, 1000) × 0.075
AFPPat   = baseGravable × 0.0875
INSAFORP = insaforp ? baseGravable × 0.01 : 0
costo    = totalDevengado + ISSSPat + AFPPat + INSAFORP
```

Los otros descuentos no afectan el costo patronal: el empleador desembolsa el
devengado completo y luego retiene.

### Ejemplo de referencia

Bruto $1,000.00 mensual, 10 h extra diurnas, 4 h extra nocturnas, 1 día feriado
trabajado, 2 días no trabajados, préstamo de $50.00.

```
salarioDiario = 1000 / 30 = 33.333333
horaOrdinaria = 33.333333 / 8 = 4.166667

Salario bruto                 $1,000.00
+ Hora extra diurna (10 h)        $83.33
+ Hora extra nocturna (4 h)       $41.67
+ Día feriado (1 d)               $66.67
− Días no trabajados (2 d)       −$66.67
= Total devengado             $1,125.00
− ISSS (3 %)                     −$30.00
− AFP (7.25 %)                   −$81.56
− ISR                            −$83.64
− Préstamo planilla              −$50.00
= Salario neto                  $879.80
```

Verificación del ISR: `1125 − 30 − 81.5625 = 1013.4375`, que cae en el tramo
`≤ 2038.10`, luego `60 + (1013.4375 − 895.24) × 0.20 = 83.64`.

## Modelo de datos

Nueva clave `salario` dentro de `db.settings`:

```js
{
  bruto: 0,
  frecuencia: 'mensual',
  insaforp: false,
  horasDiurnas: 0,
  horasNocturnas: 0,
  diasFeriados: 0,
  diasNoTrabajados: 0,
  otrosIngresos:   [],  // [{ id, desc, monto, gravable }]
  otrosDescuentos: []   // [{ id, desc, monto }]
}
```

`id` se genera con `MF.db.generateId()`, igual que el resto de colecciones.

### Migración

No se sube `_CURRENT_VERSION`. El cambio es puramente aditivo y sigue el patrón
que ya usa `configuracion.js` para `reminderEnabled`, `reminderTime` y
`currency`: valores por defecto en `emptyDB().settings` para instalaciones
nuevas, y normalización defensiva al leer para bases existentes.

`salario.js` expone `_loadCfg()`, que fusiona lo persistido sobre los valores
por defecto y sanea tipos (números no finitos o negativos a 0, arreglos
ausentes a `[]`). Así una base v2 previa funciona sin tocar la cadena de
migraciones ni el flujo de sync.

### Escritura

Patrón existente de `configuracion.js`: `loadData()` → mutar
`db.settings.salario` → `saveData(db)`. Se aplica con debounce de 400 ms sobre
los eventos `input` para no escribir a localStorage en cada tecla. Los eventos
`change` y las acciones de agregar/eliminar fila guardan de inmediato.

## Interfaz

Card plegable **"Ingresos y descuentos adicionales"**, ubicada entre la card de
salario bruto y la de deducciones. Colapsada por defecto.

```
+-------------------------------------------+
| Salario bruto [1000.00]  Frec [Mensual v] |
| INSAFORP patronal (1%)            (o   )  |
+-------------------------------------------+

+-------------------------------------------+
| > Ingresos y descuentos adicionales   +$75|
+-------------------------------------------+

+-------------------------------------------+
| Deducciones del empleado                  |
| Total devengado              $1,125.00    |
| ISSS (3%)                      -$30.00    |
| ...                                       |
+-------------------------------------------+
```

Encabezado: título, chevron que rota al expandir y badge con el ajuste neto de
todo lo que contiene la card, `totalDevengado − bruto − otrosDescuentos`, en
verde si es positivo y en rojo si es negativo. En el ejemplo de referencia son
`1125 − 1000 − 50 = +$75.00`. El badge se oculta cuando el ajuste es 0. La card arranca
expandida si al abrir la vista ya hay algún valor distinto de cero, para que el
usuario no pierda de vista datos que sí configuró.

Contenido expandido:

1. Grid de 2 columnas (1 en móvil, usando `.form-row`) con los cuatro campos
   numéricos. Bajo cada input, en 11 px y `var(--text3)`, el monto calculado.
2. Sección "Otros ingresos": filas
   `[descripción] [monto] [toggle gravable] [×]` y botón "Agregar ingreso".
3. Sección "Otros descuentos": filas `[descripción] [monto] [×]` y botón
   "Agregar descuento".

Las filas nuevas nacen vacías y se enfocan en el campo de descripción. Una fila
sin descripción se muestra en el desglose como "Sin descripción". Las filas con
monto 0 se guardan pero no aparecen en el desglose de resultados.

En el desglose de resultados, cada concepto se muestra solo si su valor es
distinto de 0, para no ensuciar la vista de quien no usa la función. Se añade
una fila "Total devengado" cuando hay algún ajuste.

Rangos de entrada: los cuatro campos numéricos aceptan `min="0"`; horas con
`step="0.5"` y días con `step="1"`. Los montos usan `step="0.01"` y `min="0"`.
Valores negativos o no numéricos se tratan como 0 en el cálculo.

## Seguridad

La cabecera de `salario.js` documenta que ningún dato del usuario se interpola
en `innerHTML`, y ese invariante debe conservarse. Las descripciones de las
listas sí son entrada libre del usuario, así que:

- Las filas de las listas se construyen con `document.createElement()` y se
  asignan por `textContent` / `value`, nunca por concatenación de strings. Es
  el patrón que ya usa `nav.js` para modales y toasts.
- En el desglose de resultados, `_fila()` sigue recibiendo únicamente labels
  hardcoded y montos de `_fmt()`. Para las filas de otros ingresos y descuentos
  se usa una variante que inserta la descripción por `textContent`.
- El resumen que va al portapapeles es texto plano, sin riesgo de inyección.

Se actualiza el comentario de cabecera para reflejar la nueva regla.

## Resumen copiado

`_copyRelacion()` incorpora las secciones nuevas, omitiendo las líneas en cero:

```
=== Calculadora Salarial — Relación Laboral ===
Salario bruto:          $ 1,000.00 (Mensual)

— Ingresos adicionales —
Hora extra diurna (10h): +$ 83.33
Hora extra nocturna (4h):+$ 41.67
Día feriado (1d):        +$ 66.67

— Descuentos —
Días no trabajados (2d): -$ 66.67
Préstamo planilla:       -$ 50.00

Total devengado:         $ 1,125.00
...
```

## Testing

Se extrae la lógica pura a funciones exportables y se agrega
`test/salario.test.js`, siguiendo el estilo de `analytics.test.js`
(`node:test`, `global.window = {}`, `require('../src/modules/salario')`).

Funciones a exportar además de `render`: `calcBaseHoraria`, `calcAjustes`,
`calcRelacion` y `normalizarCfg`.

Casos:

1. Base horaria mensual y quincenal a partir del bruto.
2. Cada multiplicador por separado con valores conocidos.
3. Días no trabajados restan del devengado.
4. Tope de ISSS: `baseGravable` sobre $1,000 no aumenta la cuota.
5. Tope de AFP: `baseGravable` sobre $7,045.06 no aumenta la cuota.
6. Otro ingreso gravable mueve ISSS/AFP/ISR; uno no gravable solo mueve el neto.
7. Los otros descuentos no alteran la base del ISR.
8. Costo patronal se calcula sobre `baseGravable` y no lo afectan los otros
   descuentos.
9. `normalizarCfg` con `undefined`, con arreglos ausentes y con números
   negativos o `NaN`.
10. El caso de referencia completo cuadra en $879.80.

Los tests existentes (56) deben seguir pasando.

## Riesgos

- **Interpretación del feriado.** El ×2.00 puede diferir de lo que aplica la
  empresa del usuario. Mitigación: texto de ayuda que explicita el supuesto.
- **Crecimiento de `salario.js`.** El archivo pasa de 263 líneas a
  aproximadamente 500. Si la construcción de filas por DOM lo infla más de lo
  previsto, conviene separar el render de las listas en su propia sección del
  archivo antes que dividir el módulo, para no alterar el orden de carga del
  build.
