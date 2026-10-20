# Burger House 3

Demo funcional de tienda y administración para Burger House 3. Catálogo móvil, personalización de ingredientes, pedidos por web/WhatsApp, pagos simulados, ventas e inventario con movimientos trazables.

## Ejecutar

Requisitos: Node.js >=22.13 y npm. Desde esta carpeta:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_faulty_viper.sql
npm run dev
```

Aplicar la migración sólo una vez por base local nueva. La tienda se abre en la URL que imprime el servidor (por defecto http://127.0.0.1:5173). El panel está en `/admin`. En desarrollo, `/signin-with-chatgpt?return_to=/admin` usa una identidad local simulada; en el sitio alojado la autenticación pertenece a Sites.

```sh
npm run typecheck
npm test
npm run build
```

En Windows, si el lanzador `npm` de nvm presenta errores de ruta, se puede invocar directamente `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run dev` (ajustar a la instalación propia).

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

React + TypeScript sobre Vinext; API de servidor TypeScript en Cloudflare Workers, sin VPS. SQL alojado con Cloudflare D1/SQLite y migraciones Drizzle. Las capas de dominio (`commerce.ts`), contrato (`domain.ts`) y persistencia (`repository.ts`) están separadas para permitir otros comercios y reemplazar el almacenamiento.

La demo usa un agregado por comercio con control de versión optimista (CAS). Pedido, stock, pago, movimientos e idempotencia se guardan juntos; las pruebas incluyen verificaciones concurrentes para evitar sobreventa. Es una base de demostración, no una plataforma multiempresa terminada. Para una operación con volumen: normalizar las tablas, añadir aislamiento por negocio/sucursal, membresías explícitas, auditoría persistente, backups, límites de tráfico, pagos reales con webhooks y las reglas concretas de cada comercio.

El catálogo nuevo utiliza la clave de dataset `burger-house-3-catalogo-20261019-v2`. Los datos de las pruebas anteriores quedan recuperables en su fila histórica y no se mezclan con el catálogo vigente. Cambiar el seed no sobrescribe las ediciones de una base ya inicializada.

## Acceso y publicación

El sitio se crea privado. La primera cuenta autenticada que abre `/admin` queda vinculada como administradora; debe hacerse con la cuenta propietaria antes de ampliar la audiencia. El catálogo no publica stock numérico ni un listado de pedidos. El seguimiento de un pedido exige un token aleatorio y las respuestas privadas no se cachean. Los secretos y datos locales (`.env*`, `.wrangler`, `.sites-runtime`, dependencias y compilaciones) no se suben a Git.

GitHub: https://github.com/JerePrograma/burger-house-3

La configuración de alojamiento está en `.openai/hosting.json`. El entorno local y la base alojada son independientes. Las publicaciones se realizan con el flujo Sites y sus credenciales temporales; el repositorio no contiene credenciales de publicación.
