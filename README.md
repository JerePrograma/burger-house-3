# Burger House 3

Demo funcional de tienda y administración para Burger House 3. Catálogo móvil, personalización de ingredientes, pedidos por web/WhatsApp, pagos simulados, ventas e inventario con movimientos trazables.

## Despliegue actual

- Frontend público de demostración: https://jereprograma.github.io/burger-house-3/
- Backend independiente: https://burger-house-3-api.jeremias-j-riv.workers.dev
- Panel: https://jereprograma.github.io/burger-house-3/admin/
- Repositorio: https://github.com/JerePrograma/burger-house-3

El frontend usa GitHub Pages y el backend usa Cloudflare Workers con D1. No necesita Sites ni una cuenta de ChatGPT. Los pedidos y el inventario son compartidos entre dispositivos. Los pagos siguen siendo simulados; esta publicación es una demostración, no un comercio operativo.

Cada push a `main` valida TypeScript, ejecuta las pruebas, compila el frontend estático y lo publica mediante `.github/workflows/pages.yml`. La URL de la API está en `frontend.config.json`; la variable de GitHub `API_BASE_URL` puede reemplazarla. Ningún secreto se incluye en el frontend.

## Ejecutar

Requisitos: Node.js 24, npm y, para el backend alojado, una cuenta autorizada en Cloudflare.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

El frontend compilado está en `dist-pages/`. Se generan rutas estáticas para la tienda y `/admin/`, y todas las imágenes y enlaces respetan el prefijo `/burger-house-3/`.

Para desarrollo completo en PowerShell:

```powershell
# Sólo en un clon nuevo sin credenciales locales: genera claves locales ignoradas por Git.
node scripts/setup-admin.mjs
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config backend/wrangler.jsonc
npm run backend:dev
# En otra terminal:
$env:VITE_API_BASE_URL='http://127.0.0.1:8787'
npm run dev
```

Abrir http://127.0.0.1:5173/burger-house-3/. `backend:dev` configura el origen local para CORS y usa `backend/.dev.vars`, generado por el script de acceso. No se deben volver a generar claves existentes automáticamente.

Para publicar cambios del backend:

```sh
npx wrangler login
npm run backend:migrate
npm run backend:deploy
```

La configuración es `backend/wrangler.jsonc`. Las migraciones están en `backend/migrations/`. El despliegue del backend es independiente del frontend; para automatizarlo hay que configurar un token de Cloudflare acotado como secreto de CI, nunca guardarlo en el repositorio.

## Única fuente del catálogo

Las **17 imágenes JPEG nuevas de WhatsApp del 19/10/2026** dentro de `referencias/` sustituyen por completo a los primeros folletos PNG. `referencias/indice.json` distingue fuentes vigentes y archivo histórico. Ningún PNG anterior alimenta el catálogo, las recetas ni las imágenes activas.

- `lib/catalog-burgers.ts`: hamburguesas, combos relacionados y transcripción de evidencia con archivo de origen.
- `lib/seed.ts`: resto del catálogo, ingredientes y configuración inicial.
- `public/images/references/current-sources.json`: procedencia de cada referencia y recorte activo.
- `scripts/prepare-assets.py`: reproduce los recortes desde los JPEG vigentes. Requiere Python y Pillow; ejecutar `python scripts/prepare-assets.py --clean`.

Los precios base, tamaños, cantidades expresamente publicadas y el adicional de medallón a $3.500 provienen del catálogo nuevo. Los gramajes no publicados, stock inicial, umbrales, límites y restantes precios de adicionales son simbólicos para la demo y se editan desde administración. Las fotografías de algunas hamburguesas clásicas son representativas y proceden también de los folletos nuevos; no definen su receta.

PVC, la promo de dos Bomba Chesse House, la promo de pizzas N.º 2 y la cajita para cuatro conservan su precio publicado y permiten consultar por WhatsApp. Su compra queda pendiente hasta completar los datos que el material no permite determinar con certeza. La tipografía comercial “Chesse Burger Triple” se conserva aunque el menú nuevo ofrezca simple, doble y triple. Los folletos muestran varios usuarios de Instagram; se usa `burgerhousee3`, publicado en la ficha de contacto y envíos.

## Flujo de pedidos e inventario

1. El comprador elige productos y variantes, quita ingredientes gratis y agrega adicionales con límites. El servidor vuelve a calcular todos los precios.
2. El pedido conserva una copia de sus precios y recetas, aunque después se edite el catálogo. Crear un pedido no descuenta stock.
3. Delivery: Marcos Paz y Mariano Acosta. La administradora cotiza el costo según el barrio; el total de productos se muestra como provisional mientras falta ese importe. No se puede verificar el pago antes de cotizar.
4. Verificar el pago simulado descuenta todos los ingredientes una sola vez, incluidos los acompañamientos. Un faltante impide confirmar la operación completa.
5. Estados: pendiente → aceptado → preparando → listo → entregado. Preparar requiere pago verificado.
6. Cancelar antes de preparar devuelve los insumos descontados. Después de iniciar la preparación registra merma sin reponerlos. Un eventual reembolso se gestiona aparte.

También se cargan pedidos de mostrador y WhatsApp. El panel permite editar productos, variantes, recetas, adicionales, stock mínimo, datos del comercio y tarifas; registrar entradas, conteos y mermas; consultar ventas, favoritos e historial; exportar ventas CSV.

## Arquitectura y evolución

React + TypeScript compilado con Vite para GitHub Pages; API de servidor TypeScript independiente en Cloudflare Workers, sin VPS. SQL alojado con Cloudflare D1/SQLite y migraciones Drizzle. Las capas de dominio (`commerce.ts`), contrato (`domain.ts`) y persistencia (`repository.ts`) están separadas para permitir otros comercios y reemplazar el almacenamiento.

La demo usa un agregado por comercio con control de versión optimista (CAS). Pedido, stock, pago, movimientos e idempotencia se guardan juntos; las pruebas incluyen verificaciones concurrentes para evitar sobreventa. Es una base de demostración, no una plataforma multiempresa terminada. Para una operación con volumen: normalizar las tablas, añadir aislamiento por negocio/sucursal, membresías explícitas, auditoría persistente, backups, límites de tráfico, pagos reales con webhooks y las reglas concretas de cada comercio.

El catálogo nuevo utiliza la clave de dataset `burger-house-3-catalogo-20261019-v2`. Los datos de las pruebas anteriores quedan recuperables en su fila histórica y no se mezclan con el catálogo vigente. Cambiar el seed no sobrescribe las ediciones de una base ya inicializada.

## Acceso de administración

El comprador usa la tienda sin crear una cuenta. Para administrar, el panel redirige a una página de acceso del backend en `workers.dev`. La contraseña se envía únicamente a ese backend mediante HTTPS. Una sesión firmada dura ocho horas, se conserva en `sessionStorage` y el token se retira de la dirección al regresar al panel.

La clave inicial de la administradora está en `.env.admin.local`, sólo en la computadora que hizo la instalación. Los secretos del backend están en `.env.backend-secrets.local.json` y en Cloudflare; ambos archivos locales están ignorados por Git. No se deben copiar en mensajes, capturas ni código. El backend almacena el hash de una contraseña aleatoria de alta entropía y limita los intentos de acceso. El botón Cerrar sesión elimina la sesión de la pestaña.

## Caja y finanzas

El panel incorpora un libro de caja inspirado en las garantías implementadas en Gestudio: cobros integrados, registros históricos conservados, reversos vinculados e idempotencia. Se amplía para el comercio con cuentas, turnos, vencimientos y conciliación.

- **Vista general:** ingresos y egresos netos por período, fondos disponibles por cuenta, evolución diaria, gastos por categoría, vencimientos y devoluciones pendientes. El flujo neto no representa ganancia contable: no incluye costeo, amortización ni devengamiento.
- **Libro:** filtros combinados por fecha argentina, cuenta, tipo, categoría y texto; detalle con fecha efectiva y de registro, responsable, proveedor/cliente, comprobante, notas, pedido y turno. Paginación y exportación CSV de todas las coincidencias, incluyendo ambas patas de transferencias.
- **Cuentas:** efectivo, banco y billetera; altas con saldo inicial declarado, edición y archivo sin borrar historia. Una cuenta sólo se archiva con saldo cero y sin turno abierto. Las categorías de ingreso/egreso son editables y archivables.
- **Ventas:** al verificar el pago se registra el cobro y se descuenta stock en la misma escritura. Se admite dividir el total exacto entre hasta diez cuentas, sin repetirlas. Efectivo requiere turno abierto. Un pedido bonificado se verifica sin mover fondos y conserva el consumo de stock y su registro.
- **Devoluciones:** cancelar un pedido no supone haber devuelto dinero. El panel muestra los reintegros pendientes; cada devolución, total o parcial, indica cuenta, importe, motivo y comprobante. También se pueden devolver ventas activas o entregadas desde el detalle del cobro. El importe nunca supera el neto cobrado. Un reintegro erróneo se corrige con un reverso vinculado al pedido.
- **Turnos:** apertura con fondo contado y comparación con el saldo del libro; cierre por total o por denominaciones, saldo esperado, contado, sobrante/faltante y motivo. La diferencia genera un ajuste interno. Los cierres no se editan ni reabren; un movimiento posterior pertenece al turno actual. Exportación de turnos a CSV.
- **A pagar y cobrar:** compromisos con categoría, contraparte, comprobante y vencimiento; pagos/cobros parciales, saldos pendientes, vencidos e historial. Agendar no mueve dinero. Cancelar un saldo conserva los pagos previos; revertir uno de esos pagos mantiene el compromiso cancelado.
- **Conciliación:** comparación manual con extractos de banco/billetera a una fecha argentina ya finalizada, con saldo del libro, saldo del extracto, diferencia, observaciones y movimientos alcanzados. No conecta con bancos ni modifica saldos automáticamente. Después del corte se bloquean nuevas cargas retroactivas en la cuenta; las correcciones se registran en el período actual.
- **Auditoría:** movimientos inmutables; los errores de ingresos, egresos, transferencias y reintegros se corrigen con un reverso único y motivo. Se conserva el registro original. Las ventas se corrigen mediante devolución, y los fondos iniciales/diferencias mediante una nueva apertura o cierre documentado.

### Primer uso y datos existentes

1. Ingresar al panel y abrir **Caja y finanzas → Turnos y arqueos**.
2. Contar el efectivo real y abrir el turno, explicando cualquier diferencia respecto del saldo del libro. Los fondos de banco/billetera existentes se pueden declarar creando una cuenta con saldo inicial o registrando un ingreso identificado como aporte.
3. Verificar cobros desde Pedidos, registrar gastos y transferencias en Caja, y contar/cerrar el efectivo al terminar el servicio.

La actualización conserva el dataset, catálogo, pedidos y stock existentes. Inicializa el libro dentro del mismo documento mediante CAS. Los pedidos que ya tenían pago verificado se importan una sola vez como cobros históricos: como el modelo anterior no guardaba fecha de cobro, se señala expresamente que se usa la fecha del pedido como estimación. Un pedido previamente cancelado con pago permanece cobrado hasta registrar su reintegro, porque no existe evidencia de devolución monetaria en el modelo anterior. No se generan gastos ni saldos iniciales ficticios.

### Integridad y alcance

Los importes de caja se transmiten y persisten como **centavos enteros**, con dos decimales en pantalla. El servidor valida importes, fondos disponibles, total exacto de cobros, topes de devoluciones, fechas y estados. No admite descubiertos actuales ni históricos generados por cargas retroactivas. Cada comando manual lleva una clave de operación: repetirlo conserva el resultado y reutilizarla con otros datos se rechaza. Una escritura CAS confirma en conjunto pedidos, stock, libro y claves, y revalida ante concurrencia.

La API financiera permanece protegida por el acceso administrativo. El catálogo y seguimiento público no exponen cuentas, saldos, movimientos ni comprobantes. Sigue siendo una demo con pagos simulados; los registros no ejecutan transferencias ni cobros externos. La conciliación es manual y los comprobantes son referencias de texto. El almacenamiento conserva el agregado D1 de la demo: para un volumen sostenido de una cadena deberá normalizarse el libro y paginarse en servidor, manteniendo estas reglas y pruebas.

Pruebas: `npm test` incluye movimientos, centavos, pagos mixtos, cierres, reembolsos, reversos, compromisos, conciliación, migración y operaciones simultáneas. `npm run typecheck` y `npm run build` verifican los contratos y la publicación en GitHub Pages.

El catálogo no expone cantidades numéricas de stock ni un listado de pedidos. El seguimiento exige el token aleatorio del pedido; la API privada exige una sesión válida. CORS está limitado al origen del frontend configurado. Los archivos `.env*`, `.dev.vars`, bases locales, dependencias y compilaciones quedan fuera de Git.

## Código anterior

Los archivos de servidor bajo `app/api`, la integración de Vinext y `.openai/hosting.json` se conservan como referencia del prototipo anterior. No forman parte de la compilación de Pages ni del backend independiente. `build:legacy` permite compilar ese prototipo si hiciera falta; el despliegue actual no usa Sites.

GitHub Pages se utiliza para esta demo sin cobros reales. Antes de convertirla en un comercio operativo hay que elegir un alojamiento frontend apropiado para uso comercial y completar pagos reales, permisos, auditoría y límites de producción; ver https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits.
