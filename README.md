# Burger House 3

Catálogo, editor y gestión se ejecutan en el VPS Hostinger, con Node.js, SQLite y Docker Compose. Cloudflare conserva el proxy del dominio y la compatibilidad de las direcciones anteriores. La base D1 original permanece como respaldo histórico; la base operativa está en el VPS.

| Acceso | Dirección |
| --- | --- |
| Catálogo | https://scalaris.com.ar/burger-house-3/ |
| Editor | https://scalaris.com.ar/burger-house-3/editar/ |
| Administración | https://scalaris.com.ar/burger-house-3/admin/ |
| API | https://scalaris.com.ar/burger-house-3-api/ |
| Servicio del editor | https://scalaris.com.ar/burger-house-3-editor/ |

El catálogo público permite elegir productos, variantes y adicionales, conservar el carrito y preparar el pedido por WhatsApp. No registra ventas, descuenta inventario ni procesa pagos. La gestión opcional administra pedidos internos, stock y caja; ambos catálogos mantienen datos separados.

El editor permite cargar fotos, modificar precios y disponibilidad, importar/exportar copias y conservar un borrador en IndexedDB del dispositivo. Publicar exige su sesión propia, compara la revisión vigente y reemplaza el catálogo de forma atómica en el VPS. No necesita conectar un token de publicación de Cloudflare. Una publicación de código conserva el catálogo persistente y las claves existentes.

## Código común y configuración propia

Las funcionalidades y correcciones comunes con Tu Comida se verifican mediante `shared-code.json` y `npm run parity:check`. Las identidades, teléfonos, imágenes, catálogos, claves, bases y adaptadores de alojamiento permanecen por proyecto. `frontend.config.json` declara las direcciones públicas canónicas; el navegador nunca recibe secretos de servidor.

## Verificar y desarrollar

Usar Node.js 24 y npm. Ejecutar `npm ci`, `npm run parity:check`, `npm run typecheck` y `npm test`; las pruebas incluyen el adaptador y el editor del VPS. `npm run dev` sirve el catálogo/editor con su prefijo público. `npm run catalog:sync` recupera exclusivamente el catálogo publicado de Burger House antes de compilar.

`npm run build` genera el catálogo en dist-pages; `npm run build:management` genera la gestión; `npm run build:native` valida la aplicación Android. Android consulta el JSON público y usa las direcciones canónicas de la API y del editor. El workflow Android entrega su APK debug cuando se ejecuta manualmente.

## Publicar en el VPS

1. Ejecutar las verificaciones y guardar las fuentes revisadas en un commit.
2. Desde el puesto Windows autorizado, ejecutar `npm run deploy:vps` o `deployment/vps/Deploy-Vps.ps1`.
3. El script empaqueta exactamente HEAD, rechaza un checkout con cambios y excluye rutas privadas. Usa el acceso SSH scalaris-vps, ejecuta el respaldo existente y conserva el paquete por commit.
4. Construye y reemplaza únicamente el contenedor de Burger House, conserva el volumen data y espera su comprobación de salud. Ante un error restaura el identificador de la imagen anterior e intenta recuperarla.
5. Verificar catálogo, editor, login, datos operativos y rechazo de sesiones de otro comercio. `scripts/check-project-deployment.mjs` permite comparar una línea base privada previa con el resultado sin escribir datos operativos ni mostrar credenciales.

Alternativa cuando SSH no responde: desde una consola autorizada de Hostinger, preparar el archivo Git del commit publicado en `releases/<commit>/source.tar.gz`, extraer allí `deployment/vps/Deploy-Commit.sh` y ejecutar ese script con el SHA completo y `--archive-ready`. Usa la misma transacción de respaldo, construcción, salud y recuperación que el comando de Windows. El archivo se prepara con `git archive`; no contiene datos ni credenciales.

Los comandos normales frontend:deploy, frontend:publish, management:deploy, management:publish, backend:deploy y editor:deploy dirigen a deploy:vps. Los comandos legacy:cloudflare:* se conservan para mantenimiento explícito de la instalación antigua y no se usan para producción. La CI valida y compila; no publica el catálogo de Burger House en Workers ni reemplaza las redirecciones existentes.

Datos persistentes: /srv/apps/burger-house/data/burger.sqlite, catalog.json y secrets.json. No incorporarlos a Git ni a la imagen. Los secretos locales .env* y los registros .private/ también permanecen ignorados. Consultar deployment/vps/LEEME.txt para recuperación y operación.

## Gestión opcional y datos existentes

La adaptación al VPS conserva en SQLite el dataset `burger-house-3-catalogo-20261019-v2`, los pedidos históricos, clientes asociados, cobros, movimientos, inventario y libro de caja. La D1 anterior queda como respaldo histórico. Publicar fotos o precios del catálogo estático no cambia esos datos ni sus recetas operativas. El catálogo interno de gestión se conserva por separado: una edición pública no reescribe automáticamente precios, recetas o ventas internas.

Si el local decide usar gestión, puede cargar manualmente un pedido recibido por WhatsApp o una venta de mostrador. La carga interna conserva una copia de precios y recetas. Crear el pedido no confirma una venta ni descuenta stock; verificar el pago registra el cobro y descuenta los ingredientes una sola vez, incluidos acompañamientos. Un faltante impide confirmar toda la operación.

Los estados internos son pendiente → aceptado → preparando → listo → entregado. Preparar requiere pago verificado. Si corresponde delivery a cotizar, debe cargarse el costo antes de verificar el cobro. Cancelar antes de preparar devuelve los insumos descontados; una cancelación posterior registra merma sin reponerlos. Un reembolso se registra aparte.

El acceso web de gestión usa el formulario HTTPS del backend. La sesión firmada dura ocho horas y se mantiene en `sessionStorage`; el token se retira de la dirección al volver al panel. La clave inicial está en `.env.admin.local` y los secretos del backend en `.env.backend-secrets.local.json` y Cloudflare. Esos archivos locales están ignorados por Git y no deben copiarse en mensajes, capturas ni código. Cerrar sesión elimina la sesión de la pestaña.

El almacenamiento operativo usa un agregado por comercio con control optimista de versión (CAS). Pedido, stock, cobro, movimientos e idempotencia se guardan juntos y se vuelven a validar ante concurrencia. Para una cadena con volumen sostenido será necesario normalizar tablas, paginar en servidor y definir aislamiento de comercios, sucursales, miembros, respaldos y límites. No hay integración de cobro bancario ni de tarjetas.

## Origen de los datos iniciales

Las **17 imágenes JPEG de WhatsApp del 19/10/2026** de `referencias/` sustituyen a los primeros folletos PNG como evidencia de la carga inicial. `referencias/indice.json` distingue fuentes vigentes y archivo histórico.

- `lib/catalog-burgers.ts`: hamburguesas, combos relacionados y transcripción con archivo de origen.
- `lib/seed.ts`: resto del catálogo, ingredientes y configuración inicial.
- `public/images/references/current-sources.json`: procedencia de referencias y recortes.
- `scripts/prepare-assets.py`: reproduce los recortes; requiere Python y Pillow. Ejecutar `python scripts/prepare-assets.py --clean`.

Los precios base, tamaños, cantidades publicadas y el adicional de medallón a $3.500 provienen del material inicial. Gramajes no publicados, stock, umbrales, límites y otros adicionales son configuración que el comercio debe revisar. Después de la migración, la versión publicada de `catalog.json` y las ediciones del comercio definen lo que ven los clientes; los folletos y el seed no la sobrescriben.

PVC, la promo de dos Bomba Chesse House, la promo de pizzas N.º 2 y la cajita para cuatro mantienen consulta por WhatsApp mientras falte confirmar su composición. Se conserva la denominación comercial “Chesse Burger Triple” y el usuario de Instagram `burgerhousee3` de la ficha de contacto y envíos.

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

La actualización conserva el dataset, catálogo interno, pedidos y stock existentes. Inicializa el libro dentro del mismo documento mediante CAS. Los pedidos que ya tenían pago verificado se importan una sola vez como cobros históricos: como el modelo anterior no guardaba fecha de cobro, se señala expresamente que se usa la fecha del pedido como estimación. Un pedido previamente cancelado con pago permanece cobrado hasta registrar su reintegro, porque no existe evidencia de devolución monetaria en el modelo anterior. Los gastos y fondos iniciales se registran a partir de las operaciones y declaraciones de la administradora.

### Integridad y alcance

Los importes de caja se transmiten y persisten como **centavos enteros**, con dos decimales en pantalla. El servidor valida importes, fondos disponibles, total exacto de cobros, topes de devoluciones, fechas y estados. No admite descubiertos actuales ni históricos generados por cargas retroactivas. Cada comando manual lleva una clave de operación: repetirlo conserva el resultado y reutilizarla con otros datos se rechaza. Una escritura CAS confirma en conjunto pedidos, stock, libro y claves, y revalida ante concurrencia.

La API financiera permanece protegida por el acceso administrativo. El catálogo público estático no consulta esta API ni contiene cuentas, saldos, movimientos o comprobantes. Los registros reflejan cobros y egresos que la administradora declara como realizados: no ejecutan transferencias ni cobran al comprador. La conciliación es manual y los comprobantes son referencias de texto. El libro se conserva en D1 junto con los pedidos y el inventario; para una cadena con volumen sostenido deberá normalizarse y paginarse en servidor, manteniendo sus reglas de integridad.

Pruebas: `npm test` incluye movimientos, centavos, pagos mixtos, cierres, reembolsos, reversos, compromisos, conciliación, migración y operaciones simultáneas. `npm run typecheck`, `npm run build:cloudflare` y `npm run build:management` verifican los contratos y las dos compilaciones web.

El catálogo público no expone cantidades numéricas de stock ni pedidos. La API privada exige una sesión válida; los accesos de seguimiento con token se conservan para registros históricos, sin participar del nuevo catálogo. CORS está limitado al origen web configurado y al origen Android exacto `https://localhost` habilitado explícitamente mediante `NATIVE_ORIGINS`. Los archivos `.env*`, `.dev.vars`, bases locales, dependencias y compilaciones quedan fuera de Git.

## Android con Ionic React y Capacitor

La aplicación Android se conserva. Capacitor empaqueta los archivos de `dist-native/` en `android/`; no carga una página remota dentro de la aplicación. El catálogo y su carrito usan el documento estático con la copia incluida en la compilación; la gestión interna mantiene su conexión con la API HTTPS de Cloudflare. El editor móvil se utiliza desde `/editar/` en el navegador.

`capacitor.config.ts` define `com.scalaris.burgerhouse3`, el nombre **Burger House 3** y el origen seguro `https://localhost`. El frontend usa Ionic React 9, React Router 6 e `IonApp`, `IonPage`, `IonContent` e `IonModal`. El botón Atrás cierra los diálogos, recorre la navegación y en la raíz minimiza la app.

El carrito usa Capacitor Preferences en Android y almacenamiento local en web, con escrituras serializadas. El comprador abre WhatsApp mediante Capacitor Browser, sin registrar pedidos ni depender de la API de gestión. Conserva el carrito y debe enviar el mensaje. Consultar la última versión publicada y abrir WhatsApp requiere conexión; la copia empaquetada del catálogo no ejecuta ventas offline ni cambia caja o inventario.

El acceso administrativo Android usa un formulario Ionic y `/api/admin/session`, habilitado sólo para el origen nativo configurado. Mantiene el límite de cinco intentos por cinco minutos y sesiones de ocho horas. La clave no se guarda; el token permanece en `sessionStorage`, fuera de Preferences. Los informes CSV internos se preparan en la caché privada para compartirlos con la aplicación elegida. No se incluyen claves de servidor en el paquete.

```powershell
npm ci
npm run android:sync
npm run android:open
```

`android:sync` compila y sincroniza los recursos; repetirlo después de cambiar frontend o plugins. `android:open` abre Android Studio. Los archivos generados en `android/app/src/main/assets/` no deben editarse manualmente.

`npm run android:apk` genera un APK debug y `npm run android:bundle` un AAB release sin firma de publicación configurada. Compilar requiere Node.js 22 o superior —el proyecto usa 24—, JDK 21, Android Studio 2025.2.1 o superior y Android SDK 36; `minSdkVersion=24`. Comprobar el JDK de Android Studio/Gradle si `java` del PATH apunta a otra versión. No se instalan SDK ni se aceptan licencias automáticamente.

También puede ejecutarse **Actions → Build Android app → Run workflow**. El flujo usa Java 21 y el SDK del runner, y entrega el artefacto **burger-house-3-android-debug** cuando la compilación termina correctamente. Es una versión debug para instalación manual.

Publicar en Google Play requiere preparar el AAB release, custodiar la clave de firma, completar la ficha y declaraciones, y probar en dispositivos reales. Esta separación no crea cuentas de Play Console ni publica la app. Revisar `appId` antes de la primera publicación porque identifica la aplicación.

Referencias oficiales: [instalación de Capacitor](https://capacitorjs.com/docs/getting-started), [entorno Android](https://capacitorjs.com/docs/getting-started/environment-setup) y [configuración](https://capacitorjs.com/docs/config).

## Interfaz y verificación

Se mantienen el diseño del catálogo, la personalización, el carrito y las interfaces internas. Las distribuciones se adaptan desde 320 px; los diálogos respetan áreas seguras y altura visible, y los formularios móviles permiten texto de 16 px. Las tablas anchas se desplazan en su propio contenedor y no se bloquea el zoom. Android declara `adjustResize` para el teclado.

Para verificar esta separación, comprobar ambas compilaciones, editar y publicar desde un celular, abrir el catálogo con la API de gestión bloqueada, preparar un carrito y revisar el mensaje de WhatsApp. Confirmar también que una edición pública no cambia un pedido histórico ni un movimiento de caja, y que una compilación de código recupera la última versión publicada. La prueba en navegador no reemplaza la verificación en dispositivos reales y Safari móvil.

## Código anterior

`app/api`, la integración de Vinext y `.openai/hosting.json` permanecen como referencia de la implementación anterior. No forman parte del catálogo estático ni del Worker de API independiente. `build:legacy` permite compilar esa implementación. El despliegue descrito aquí no usa Sites.
