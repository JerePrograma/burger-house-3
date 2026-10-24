# Evaluación del estándar de Scalaris

Fecha: 23/10/2026. Alcance autorizado: homologar funcionalidades y correcciones con Tu Comida, conservar identidad, credenciales y datos, guardar en Git y desplegar en el alojamiento existente.

Hechos verificados: React 19, TypeScript, Ionic React 9 y Capacitor 8 en `package.json`; reglas de pedidos, inventario, caja y autenticación equivalentes a Tu Comida; adaptación Node.js 24/SQLite y Docker Compose en `deployment/vps/`; frontend, editor y API con direcciones propias. El VPS conserva su catálogo y base operativa fuera de la imagen. Hay cambios de esta adaptación todavía sin commit, que forman parte de la consolidación autorizada.

Brechas respecto del estándar: backend distinto de Spring Boot y PostgreSQL, migraciones propias en lugar de Flyway, y configuración/documentación con comandos heredados de Cloudflare. Migrar backend y persistencia requiere esfuerzo y riesgo altos para este alcance; aportaría otro modelo operativo y consultas relacionales más amplias, pero no está autorizado ni es necesario para homologar las funciones. La necesidad Android justifica Ionic. El producto administra un comercio; ampliar a SaaS multiempresa requiere diseñar roles, pertenencia y aislamiento en servidor.

Recomendación: mantener VPS, SQLite y Docker Compose; sincronizar las reglas y correcciones comunes, hacer explícitas las diferencias de publicación y evitar que los comandos normales desplieguen accidentalmente la instalación antigua de Cloudflare. No modificar migraciones históricas, credenciales ni datos operativos. El editor del VPS conserva escritura atómica y control de revisión; la publicación de código conserva el volumen de datos y ejecuta el respaldo existente.

Aceptación: pruebas comunes y específicas del VPS, tipos y compilaciones web/nativa aprobados; rechazo de sesiones ajenas; catálogos independientes conservados; commits subidos a ambos repositorios; versiones desplegadas identificables por commit y comprobaciones remotas posteriores. Cualquier limitación de conexión o verificación visual se registra como pendiente, sin declararla aprobada.
