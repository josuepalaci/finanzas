# MisFinanzas — Control de Finanzas Personales 100% Offline

Una aplicación PWA minimalista y potente para gestionar tus finanzas personales sin necesidad de conexión a internet. Funciona completamente offline, sincroniza entre dispositivos y proporciona análisis avanzados de tus gastos.

**Demo en vivo:** [josue-martinez.web.app](https://josue-martinez.web.app)

---

## ✨ Características principales

### 💰 Gestión de Transacciones
- **Registro de ingresos y egresos** con categorías personalizables
- **Historial completo** de transacciones con filtros y búsqueda avanzada
- **Notas en transacciones** para contexto adicional
- **Transacciones recurrentes** para gastos/ingresos fijos
- **Transferencias entre cuentas** con seguimiento

### 📊 Análisis y Reportes
- **Dashboard integral** con resumen de cuentas y movimientos del mes
- **Tendencias de gasto** - análisis de 6 meses por categoría
- **Evolución del patrimonio** - gráfica histórica de tu balance
- **Puntaje de Salud Financiera** (0-100) basado en 4 factores clave
- **Reportes detallados** por período (diario, mensual, anual)
- **Export a CSV** para análisis en Excel

### 🎯 Planificación Financiera
- **Presupuestos acumulativos** con rollover a próximo período
- **Metas de ahorro** con proyecciones de cumplimiento
- **Seguimiento de deudas** y cuotas pendientes
- **Recordatorios diarios** del sistema para mantener disciplina

### 🔧 Configuración Avanzada
- **Múltiples cuentas** independientes
- **Categorías personalizables** con iconos propios
- **Información de salario** para cálculos de proyección
- **Datos de prueba** precargados para explorar
- **Reset completo** cuando lo necesites
- **Dark/Light mode** con detección automática

---

## 🛠️ Stack Tecnológico

| Aspecto | Tecnología |
|--------|-----------|
| **Lenguaje** | Vanilla JavaScript (ES2023) — Sin frameworks |
| **Visualizaciones** | [Chart.js](https://www.chartjs.org/) (inlinado en build) |
| **Tipografías** | DM Sans + DM Mono (inlinadas en build) |
| **Almacenamiento** | localStorage (100% offline) |
| **PWA** | Service Worker + Web App Manifest |
| **Build** | Node.js custom build script |
| **Hosting** | GitHub Pages + GitHub Actions |
| **Tema** | Tokyo Night Color Scheme |
| **IDs únicos** | `crypto.randomUUID()` |

---

## 🚀 Inicio Rápido

### Requisitos
- Node.js ≥ 18

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/josuepalaci/finanzas.git
cd finanzas

# No requiere dependencias externas (devDependencies vacío)
```

### Desarrollo

```bash
# Compilar y abrir en navegador
npm run dev

# Solo compilar
npm run build

# Ejecutar tests
npm run test
```

La app se compilará como `dist/MisFinanzas.html` (archivo único) junto con:
- `dist/sw.js` - Service Worker
- `dist/manifest.json` - PWA Manifest

---

## 💾 Arquitectura

### Estructura de Código
```
src/
├── index.html              # Plantilla HTML principal
├── modules/                # Módulos funcionales
│   ├── db.js              # Base de datos (localStorage)
│   ├── sync.js            # Sincronización incremental con UUID
│   ├── analytics.js       # Cálculos de análisis y salud financiera
│   ├── dashboard.js       # Vista principal
│   ├── gastos.js          # Gestión de transacciones
│   ├── presupuestos.js    # Presupuestos y metas
│   ├── cuentas.js         # Múltiples cuentas
│   ├── categorias.js      # Categorías personalizables
│   ├── metas.js           # Seguimiento de objetivos
│   ├── deudas.js          # Gestión de deudas
│   ├── transferencias.js  # Transferencias entre cuentas
│   ├── recurrentes.js     # Transacciones recurrentes
│   ├── cuotas.js          # Seguimiento de cuotas
│   ├── reporte.js         # Reportes y exportación
│   ├── salario.js         # Datos de salario
│   ├── configuracion.js   # Ajustes de usuario
│   ├── nav.js             # Navegación (mobile + desktop)
│   ├── pwa.js             # Funcionalidades PWA
│   ├── icons.js           # Sistema de iconos
│   └── [más módulos]
├── styles/                 # Estilos CSS
│   ├── base.css           # Base y variables
│   ├── layout.css         # Layout responsivo
│   ├── components.css     # Componentes
│   └── themes.css         # Dark/Light themes
└── sw.js                   # Service Worker

dist/
├── MisFinanzas.html       # Archivo único compilado
├── sw.js                  # Service Worker
└── manifest.json          # PWA Manifest
```

### Características de Arquitectura
- **Single HTML File** - Fácil de desplegar
- **100% Offline** - Funciona sin conexión a internet
- **PWA** - Instalable como app nativa
- **Responsive** - Mobile-first, adaptable a desktop
- **Sincronización Incremental** - Import de datos con UUID
- **Migraciones Aditivas** - Siempre hacia adelante, nunca destructivas

---

## 🎨 Diseño y UX

### Tema: Tokyo Night
- **Color Primario:** `#7aa2f7` (Azul)
- **Fondo:** `#1e1f2e`
- **Dark/Light Mode** con detección automática de preferencia del sistema

### Navegación
**Mobile:** Bottom tabs (Dashboard, Gastos, Presupuestos, Más) + FAB flotante que sube al topbar en scroll

**Desktop:** Sidebar de 220px con menú expandido

---

## 📝 Uso

### Primera Vez
1. Abre la app en tu navegador
2. Ve a **Configuración** → **Cargar datos de prueba** para explorar
3. Crea tus propias categorías y cuentas

### Flujo Principal
1. **Dashboard** - Resumen de tu situación financiera
2. **Gastos** - Registra ingresos y egresos
3. **Presupuestos** - Define límites y metas
4. **Más** - Accede a análisis, reportes y configuración

### Sincronización
- **Datos locales:** Se guardan automáticamente en localStorage
- **Importar datos:** Desde otro dispositivo o backup en Configuración
- **Exportar CSV:** Para análisis externo

---

## 🧪 Testing

```bash
npm run test
```

Tests incluyen:
- Funcionalidad de DB y sync
- Cálculos de analytics
- Migraciones de datos
- Validaciones de entrada

---

## 🛣️ Roadmap

- [ ] Sincronización cloud opcional
- [ ] Categorías por recurrencias automáticas
- [ ] Predicción de patrones de gasto con IA
- [ ] Soporte multiidioma

---

## 📄 Licencia

MIT - Libre para usar, modificar y distribuir

---

## 👤 Autor

**Josué Martínez**  
[josue-martinez.web.app](https://josue-martinez.web.app)

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Para cambios mayores:
1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 💬 Soporte

¿Preguntas o sugerencias? Abre un [issue](https://github.com/josuepalaci/finanzas/issues) en el repositorio.
