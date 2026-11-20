# Frontend · Ligia Manzano Salón

Sistema administrativo del salón: HTML + Tailwind CSS 4 + JavaScript (módulos ES), sin framework. Se publica en Vercel. El backend (Spring Boot) va aparte, en Render.

## Cómo correrlo

1. Instalar dependencias (una vez): `npm install`
2. Compilar el CSS mientras se programa: `npm run dev` (se queda vigilando `css/input.css` y los HTML/JS).
3. Abrir con **Live Server** de VS Code (o cualquier servidor local). Con doble clic (`file://`) no funciona, porque los módulos ES necesitan un servidor.

Antes de publicar: `npm run build` (CSS minificado). En Vercel: Build Command `npm run build`, Output Directory `.`.

`vercel.json` pone las cabeceras de seguridad (Content-Security-Policy y otras). Por eso no se usan scripts ni estilos en línea (`<script>…</script>`, `onclick="…"`, `style="…"`), y todo texto que viene de la API pasa por `escapar()` antes de un `innerHTML`. Cuando exista la URL real de Render, se cambia en `vercel.json` (`connect-src`) y en `js/config.js`. Si se agrega una librería (Chart.js, FullCalendar), se descarga al proyecto en vez de cargarla de un CDN.

## Datos de prueba

Mientras el backend no existe, los servicios responden con datos de `js/mocks/`. Se controla por servicio en `js/config.js` → `DATOS_PRUEBA`. Cuando un endpoint esté listo, se pone en `false` ese servicio.

Los datos de prueba viven en memoria: lo que se guarda se pierde al recargar la página.

Usuarios de prueba (ficticios): `ligia.manzano`, `recepcion`, `contador`, `auditor`, todos con la contraseña `demo1234`. Se entra con el **usuario**, no con un correo.

- `nueva` / `temporal1234` tiene contraseña temporal: al entrar la manda a cambiarla. La contraseña cambiada sirve hasta cerrar la pestaña.
- Compras e Inventario comparten los productos de prueba: una compra registrada sube la existencia en Inventario (hasta recargar).
- Tras cinco intentos fallidos seguidos la cuenta queda bloqueada: el mensaje es el mismo que el de una contraseña mala (así lo hace la API, para no revelar qué usuarios existen), y ni la contraseña correcta entra. Para volver a probar, basta con recargar la página.

## Estructura

```
index.html                 Login (es la página de entrada en Vercel)
cambiar-contrasena.html    Cambiar contraseña (obligado si es temporal; también desde el candado de la barra)
inicio.html                Inicio; plantilla para las demás páginas internas
clientes.html              Clientes: lista, ficha y formulario (nuevo / editar)
servicios.html             Servicios: catálogo por especialidad, detalle y formulario
empleados.html             Empleados: equipo, ficha, formulario con especialidades y horario, dar de baja
inventario.html            Inventario: productos, lotes PEPS, últimos movimientos, ajuste de existencia y formulario
compras.html               Compras: historial, registrar compra (un lote por producto) y proveedores
css/input.css              Tema (tokens del diseño) y componentes → se compila a css/styles.css
js/config.js               URL de la API, interruptores de datos de prueba, tiempos
js/controllersWeb/         Un controlador por página: DOM y eventos
js/services/               Un servicio por recurso del backend: llamadas a la API (o a los mocks)
js/mocks/                  Datos de prueba con la forma de los DTO
js/utils/authFetch.js      fetch con token, URL base y manejo de errores (lo usan todos los servicios)
js/utils/session.js        Sesión en sessionStorage y cierre por inactividad (30 min)
js/utils/layout.js         Menú lateral y barra superior de las páginas internas
js/utils/icons.js          Iconos Lucide
js/utils/formato.js        Dinero, fechas, duraciones, iniciales y escapar texto
js/utils/calculos.js       Precio sin IVA, comisión y totales de una compra (probado en tests/: npm test)
js/utils/horario.js        Horario semanal de una empleada dentro del horario del salón (probado en tests/)
js/utils/peps.js           Lotes PEPS: existencia, valor al costo y de qué lotes sale una salida (probado en tests/)
js/utils/panel.js          Panel derecho de las pantallas de catálogo (ficha / formulario)
js/utils/formulario.js     Campo con etiqueta y error; mostrar errores del frontend y del backend
docs/contrato-api.md       Acuerdo de endpoints y JSON con el backend
vercel.json                Cabeceras de seguridad al publicar en Vercel
```

## Convenciones

- Colores, tamaños y radios **solo** desde el tema (`bg-fondo-superficie`, `text-texto-secundario`, `rounded-chico`…). Nada de colores sueltos (`#…`, `bg-red-500`).
- Componentes repetidos (`btn`, `campo-caja`, `tarjeta`, `aviso`, `nav-enlace`) están en `css/input.css`.
- Los campos llevan `data-campo="<columna>"` con el nombre de la columna del SQL, igual que en los mockups.
- Los servicios nunca usan `fetch` directo: siempre `authFetch`.
- La referencia visual son los mockups de `../diseno/pantallas/`.

## Páginas nuevas

1. Copiar `inicio.html`, cambiar `data-pagina`, `data-titulo` y el `<main>`.
2. Crear `js/controllersWeb/<pagina>Controller.js` que llame a `montarLayout()`.
3. Crear o reutilizar el servicio en `js/services/` y sus datos en `js/mocks/`.
4. En `js/utils/layout.js`, marcar la página como `listo: true` en el menú.
