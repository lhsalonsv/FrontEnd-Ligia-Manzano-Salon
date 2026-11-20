# Contrato entre el frontend y el backend

Acuerdo entre Julio (frontend) y Katherine (backend, Spring Boot). Si algo cambia, se cambia aquí primero.

## Reglas generales

- Base: `/api` (local `http://localhost:8080/api`; producción, la URL de Render).
- **JSON en camelCase**, que es lo que Jackson hace por defecto: `idCliente`, `numDocumento`, `fechaHoraInicio`. Los nombres salen de las columnas de `modelo_completo.sql` pasadas a camelCase (`num_documento` → `numDocumento`).
- Fechas: `"2026-12-15"`; fecha y hora: ISO 8601 con zona, `"2026-12-15T16:00:00-06:00"`.
- Dinero: número con 2 decimales (`56.50`), nunca texto.
- Autenticación: cabecera `Authorization: Bearer <token>` en todo, excepto el login.
- CORS: el backend permite el dominio de Vercel y `http://localhost:5500` / `http://127.0.0.1:5500` (Live Server).
- El usuario que hace la acción sale del token; ninguna petición manda `idUsuario`.
- Los cálculos de dinero (comisiones, IVA, totales) los hace el backend. El frontend puede mostrarlos antes de guardar, pero vale el de la API.

### Paginación

Todos los listados largos (clientes, productos, ventas, bitácora…) usan la misma forma:

- Petición: `?pagina=0&tamano=50`. `pagina` empieza en 0.
- `tamano` máximo **100**: si se pide más, la API devuelve 100.
- Respuesta: `{ "contenido": [ … ], "totalElementos": 1248 }`, más `conteos` solo donde la pantalla tiene pestañas con números.
- Una página fuera de rango responde **200** con `contenido` vacío (no 404).

## Errores

Toda respuesta de error usa la misma forma, para que el frontend muestre el mensaje tal cual:

```json
{ "mensaje": "Texto para la persona usuaria", "codigo": "CLIENTE_DUPLICADO", "campos": { "dui": "Ya existe un cliente con ese DUI" } }
```

- `mensaje`: siempre. Es lo que se muestra en pantalla.
- `codigo` y `campos`: opcionales. `campos` sirve para marcar los campos de un formulario.

| Estado | Cuándo |
|---|---|
| 400 | Datos inválidos (con `campos`) |
| 401 | Sin sesión, token vencido o sesión cerrada (`codigo: "NO_AUTENTICADO"`) → el frontend vuelve al login |
| 403 | Con sesión, pero su rol no tiene permiso. Con `codigo: "CAMBIO_CONTRASENA_REQUERIDO"`: la contraseña es temporal → el frontend manda a cambiarla |
| 404 | No existe |
| 409 | Conflicto (duplicado, horario ocupado, stock insuficiente) |

## Autenticación

### `POST /api/auth/login`

Petición:

```json
{ "nombreUsuario": "ligia.manzano", "contrasena": "••••••••" }
```

200:

```json
{
  "token": "eyJhbGciOi…",
  "usuario": { "idUsuario": 1, "nombreUsuario": "ligia.manzano", "nombreCompleto": "Ligia Manzano", "rol": "ADMINISTRADOR", "debeCambiarContrasena": false }
}
```

- `rol`: `ADMINISTRADOR`, `RECEPCIONISTA`, `CONTADOR` o `AUDITOR` (los 4 roles fijos).
- `debeCambiarContrasena`: `true` mientras la contraseña sea temporal (la puso la administradora). El frontend va directo a cambiarla.
- 401, **igual para cualquier fallo** (usuario que no existe, contraseña mala, cuenta bloqueada o desactivada), para no revelar qué usuarios existen:
  `{ "mensaje": "Usuario o contraseña incorrectos. Después de 5 intentos seguidos la cuenta se bloquea 15 minutos.", "codigo": "CREDENCIALES_INVALIDAS" }`
- Se bloquea al quinto intento fallido seguido (`tb_usuarios.intentos_fallidos`, `bloqueado_hasta`); un inicio de sesión correcto pone `intentos_fallidos` en 0.
- Cada inicio de sesión crea una fila en `tb_sesiones` y el token lleva su id. Cerrar sesión, cambiar la contraseña o desactivar al usuario revoca la sesión: el token deja de servir en la siguiente petición (401).
- La API también cierra la sesión a los 30 minutos sin uso, igual que el frontend.

### `POST /api/auth/logout`

Con el token. Sin cuerpo. 204. El frontend lo llama al tocar "Salir" y después borra la sesión local, aunque la llamada falle.

### `GET /api/auth/me`

Con el token. 200 con el mismo objeto `usuario` del login. Sirve para refrescar los datos del usuario (por ahora el frontend no lo usa).

### `POST /api/auth/cambiar-contrasena`

Con el token. Se permite aunque la contraseña sea temporal.

```json
{ "contrasenaActual": "••••••••", "contrasenaNueva": "••••••••••••" }
```

- 204: contraseña cambiada. La API pone `debe_cambiar_contrasena` en `false` y **revoca todas las sesiones del usuario, incluida la actual**. El frontend vuelve al login para entrar con la nueva.
- 400 con `campos`: `contrasenaActual` ("La contraseña actual no es correcta.") o `contrasenaNueva` (muy corta, igual a la actual o que contiene el usuario).
- Largo mínimo: **12 caracteres** (propuesta; falta que el salón lo confirme). Se aceptan espacios, para poder usar frases.

## Clientes (`tb_clientes`)

### `GET /api/clientes?buscar=&filtro=&pagina=0&tamano=50`

- `buscar` (opcional): busca en nombre + apellido (sin importar tildes ni mayúsculas), teléfono y DUI. Desde 3 dígitos busca también en teléfono y DUI.
- `filtro`: `todos` · `este-mes` (última visita en el mes actual) · `sin-venir-60` (última visita hace más de 60 días) · `cumple-mes` (`mes_cumple` = mes actual).
- Solo clientes con `activo = true`. Orden: última visita más reciente primero.
- Paginación como en Reglas generales: `contenido`, `totalElementos` y `conteos`.

200:

```json
{
  "contenido": [
    {
      "idCliente": 1, "nombre": "Carmen", "apellido": "Aguilar", "telefono": "7000-0012",
      "tieneAlergia": true, "ultimaVisita": "2026-12-12", "visitas12m": 14, "gastado12m": 684.00,
      "proximaCita": { "fechaHoraInicio": "2026-12-19T10:00:00-06:00", "servicio": "Tratamiento", "empleado": "Sofía" }
    }
  ],
  "totalElementos": 1248,
  "conteos": { "todos": 1248, "este-mes": 312, "sin-venir-60": 186, "cumple-mes": 41 }
}
```

- `conteos` respeta `buscar` pero no `filtro` (son los números de las pestañas).
- `ultimaVisita`, `visitas12m` y `gastado12m` salen de las ventas pagadas de los últimos 12 meses; `proximaCita` es la próxima cita no cancelada (o `null`). `empleado` es el primer nombre.

### `GET /api/clientes/{id}`

Todas las columnas de `tb_clientes` en camelCase, más lo calculado para la ficha:

```json
{
  "idCliente": 1, "nombre": "Carmen", "apellido": "Aguilar", "telefono": "7000-0012", "correo": "carmen@ejemplo.com",
  "diaCumple": 23, "mesCumple": 1, "alergias": "Sensible al amoníaco.", "tipoDocumento": "13", "numDocumento": "00000001-1",
  "razonSocial": null, "nit": null, "nrc": null, "nombreComercial": null, "codActividad": null, "idDistrito": null, "complemento": null,
  "activo": true, "creadoEn": "2025-03-08T10:00:00-06:00",
  "ultimaVisita": "2026-12-12", "visitas12m": 14, "gastado12m": 684.00, "empleadoFrecuente": "Karla Méndez",
  "ultimaFormula": { "fecha": "2026-11-14", "empleado": "Karla", "formula": "6.1 + 6.0 (1:1) · 20 vol · 35 min", "observaciones": "Sin amoníaco." },
  "ultimasVisitas": [ { "fecha": "2026-12-12", "descripcion": "Keratina + 2 productos", "empleado": "Karla Méndez", "total": 91.00 } ],
  "proximaCita": null
}
```

- `empleadoFrecuente`: el empleado que más la atendió en 12 meses (o `null`). `ultimaFormula`: la más reciente de `tb_formulas_color`. `ultimasVisitas`: las 3 últimas ventas.
- 404 si no existe.

### `POST /api/clientes` y `PUT /api/clientes/{id}`

Cuerpo: las columnas editables de `tb_clientes` (todas, con `null` en las vacías):

```json
{
  "nombre": "Valeria", "apellido": "Campos", "telefono": "7000-0058", "correo": null,
  "diaCumple": null, "mesCumple": null, "alergias": null, "tipoDocumento": "13", "numDocumento": "00000000-0",
  "razonSocial": "Empresa, S.A. de C.V.", "nombreComercial": null, "nit": "00000000000001", "nrc": "0000010",
  "codActividad": "82300", "idDistrito": 1, "complemento": "Colonia, calle, número"
}
```

Respuesta: 201 (POST) o 200 (PUT) con la ficha completa, igual que el GET.

Validaciones (el frontend las hace y el backend las repite; error 400 con `campos`):

| Campo | Regla |
|---|---|
| `nombre` | obligatorio, hasta 80 |
| `telefono` | obligatorio; 8 dígitos (`7000-0000`) o de 8 a 15 con `+` si es extranjero |
| `correo` | correo válido, en minúsculas |
| `diaCumple`, `mesCumple` | los dos o ninguno; día válido para el mes (29 de febrero sí) |
| `numDocumento` | DUI `00000000-0`; si viene, `tipoDocumento` = `"13"` (CAT-022) |
| crédito fiscal | si viene uno de `razonSocial`, `nit`, `nrc`, `codActividad`, `idDistrito`, `complemento`, vienen todos (`nombreComercial` siempre opcional) |
| `nit` | solo dígitos: 14, o 9 si es el DUI homologado |
| `nrc` | solo dígitos, de 2 a 8 (como lo pide el DTE) |
| `codActividad` | existe en `tb_cat_actividades` |

No se puede exigir DUI ni correo para facturarle a un consumidor final.

## Servicios (`tb_servicios`)

### `GET /api/servicios`

Todos los servicios, activos e inactivos (el catálogo es corto; el frontend filtra y busca). Incluye los parámetros que la pantalla necesita para calcular la comisión (`tb_parametros`):

```json
{
  "comisionServicioPct": 10,
  "ivaPct": 13,
  "servicios": [
    { "idServicio": 10, "nombreServicio": "Keratina", "descripcion": "Alisado con keratina y sellado.", "idEspecialidad": 3,
      "duracionMin": 120, "precio": 60.00, "precioDesde": false, "activo": true }
  ]
}
```

### `GET /api/servicios/{id}`

El servicio, más:

```json
{
  "vecesEsteMes": 9,
  "tieneVentas": true,
  "quienes": [ { "idEmpleado": 1, "nombreCompleto": "Karla Méndez", "puesto": "Estilista", "vecesEsteMes": 5 } ]
}
```

- `vecesEsteMes`: líneas de venta pagadas de este servicio en el mes actual. `tieneVentas`: si aparece en alguna venta.
- `quienes`: empleados activos con la especialidad del servicio (`tb_empleado_especialidad`), con cuántas veces lo hicieron este mes.

### `POST /api/servicios` y `PUT /api/servicios/{id}`

```json
{ "nombreServicio": "Alisado express", "idEspecialidad": 3, "descripcion": null, "duracionMin": 90, "precio": 35.00, "precioDesde": true }
```

Respuesta: 201 / 200 con el servicio como en el GET por id. Cambiar el precio no toca ventas pasadas (cada línea de venta guarda su precio).

| Campo | Regla |
|---|---|
| `nombreServicio` | obligatorio, hasta 80; **no se repite** (sin importar mayúsculas) → 409 con `campos.nombreServicio` |
| `idEspecialidad` | obligatorio, existe en `tb_especialidades` |
| `descripcion` | hasta 300 |
| `duracionMin` | opcional; entero de 5 a 600 (es la sugerida; la cita guarda la real) |
| `precio` | obligatorio, con IVA, de 0 a 9999.99, 2 decimales |

### `PATCH /api/servicios/{id}/activo`

`{ "activo": false }` → 200 con el servicio. Los servicios no se borran (tienen ventas); inactivo = no sale en la agenda ni en el POS.

### Comisión por servicio

`round(round(precio / (1 + ivaPct/100), 2) × comisionServicioPct / 100, 2)`: primero el precio sin IVA a 2 decimales (`tb_comisiones.base_sin_iva`) y luego el porcentaje. Ejemplos: $60.00 → $53.10 → $5.31; $35.00 → $30.97 → $3.10. En precios "desde" se calcula con el precio cobrado en la venta. El frontend usa la misma fórmula (`js/utils/calculos.js`, probada con `npm test`).

### `GET /api/especialidades`

```json
[ { "idEspecialidad": 3, "nombreEspecialidad": "Tratamientos",
    "empleados": [ { "idEmpleado": 1, "nombreCompleto": "Karla Méndez", "puesto": "Estilista" } ] } ]
```

Solo empleados activos. La usan Servicios (y después Agenda y Empleados).

## Empleados (`tb_empleados`, `tb_empleado_especialidad`, `tb_horarios_empleado`)

### `GET /api/empleados`

Todos, activos y de baja (la lista es corta; el frontend filtra y busca).

```json
{
  "quincena": { "inicio": "2026-12-01", "fin": "2026-12-15" },
  "horarioSalon": [ { "diaSemana": 1, "abierto": true, "horaAbre": "08:00", "horaCierra": "18:00" } ],
  "empleados": [
    { "idEmpleado": 1, "nombreEmpleado": "Karla", "apellido": "Méndez", "puesto": "Estilista", "dui": "00000000-4",
      "rol": null, "sueldoBaseMensual": 408.80, "recibeComision": true, "comisionesQuincena": 178.00,
      "activo": true, "fechaBaja": null }
  ]
}
```

- `horarioSalon`: las 7 filas de `tb_horarios` (1 = lunes). `rol`: el del usuario ligado (`id_usuario`) o `null` si no tiene.
- `comisionesQuincena`: suma de `tb_comisiones.monto` de la quincena en curso (con las devoluciones restando).

### `GET /api/empleados/{id}`

Todas las columnas de `tb_empleados` en camelCase, más:

```json
{
  "especialidades": [1, 2, 3],
  "horarios": [ { "diaSemana": 1, "horaInicio": "08:00", "horaFin": "12:00" }, { "diaSemana": 1, "horaInicio": "13:00", "horaFin": "17:00" } ],
  "usuario": { "nombreUsuario": "ligia.manzano", "rol": "ADMINISTRADOR" }
}
```

`usuario` es `null` si no entra al sistema. Horas en `"HH:MM"`.

### `POST /api/empleados` y `PUT /api/empleados/{id}`

```json
{
  "nombreEmpleado": "Paola Andrea", "apellido": "Guzmán Flores", "dui": "00000000-7", "telefono": "7000-0063",
  "correoEmpleado": null, "fechaIngreso": "2026-12-15", "puesto": "Estilista", "sueldoBaseMensual": 408.80,
  "recibeComision": true, "afpAdministradora": "CONFIA", "nupAfp": "000000003390", "numeroIsss": "000000472",
  "especialidades": [1, 3],
  "horarios": [ { "diaSemana": 1, "horaInicio": "08:00", "horaFin": "17:00" } ]
}
```

`especialidades` y `horarios` reemplazan los que tenía (borrar e insertar en la misma transacción). El usuario no se toca aquí: se crea en Configuración → Usuarios y roles.

| Campo | Regla |
|---|---|
| `nombreEmpleado`, `apellido` | obligatorios, hasta 80 |
| `dui` | obligatorio, `00000000-0`, **único** → 409 con `campos.dui` |
| `telefono` | obligatorio, 8 dígitos (`7000-0000`) o de 8 a 15 con `+` |
| `fechaIngreso`, `puesto` | obligatorios; puesto hasta 40 (texto libre: Estilista, Manicurista, Recepcionista, Dueña) |
| `sueldoBaseMensual` | obligatorio, ≥ 0, 2 decimales; 0 = no está en planilla (la dueña) |
| `afpAdministradora`, `nupAfp` | los dos o ninguno; `CRECER` o `CONFIA`; NUP de 12 dígitos |
| `numeroIsss` | opcional, 9 dígitos |
| `horarios` | por día, 1 o 2 bloques; `horaFin > horaInicio`; dentro de `tb_horarios` de ese día; el salón abierto; los bloques no se cruzan (pueden tocarse: 12:00–12:00) |

### `PATCH /api/empleados/{id}/baja`

`{ "fechaBaja": "2026-12-20" }` → 200 con la ficha. Pone `fecha_baja` y `activo = false`, y borra su horario (deja de aparecer en la agenda). No se borra nada más: ventas y comisiones quedan. 400 si `fechaBaja` es antes de `fechaIngreso` o después de hoy (no se programan bajas a futuro).

## Inventario (`tb_productos`, `tb_lotes`, `tb_movimientos_inventario`, `tb_marcas`, `tb_categorias`)

Existencia y costo no se guardan en `tb_productos`: salen de los lotes (PEPS). La API los calcula en cada respuesta.

### `GET /api/productos?buscar=&filtro=todos&idCategoria=&pagina=0&tamano=50`

- `buscar` (opcional): en `nombre_producto` (sin importar tildes ni mayúsculas) y en `codigo`.
- `filtro`: `todos` (activos) · `bajo-minimo` (activos con existencia < `stock_minimo`; incluye los agotados) · `agotados` (activos con existencia 0) · `inactivos`.
- `idCategoria` (opcional). Orden: nombre. Paginación como en Reglas generales.

200:

```json
{
  "contenido": [
    { "idProducto": 1, "codigo": "7410000000123", "nombreProducto": "Shampoo hidratante 400 ml", "nombreCategoria": "Cabello",
      "existencia": 2, "stockMinimo": 6, "costoPeps": 6.50, "precioVenta": 13.00, "valorCosto": 13.30, "activo": true }
  ],
  "totalElementos": 14,
  "conteos": { "todos": 14, "bajo-minimo": 3, "agotados": 1, "inactivos": 1 },
  "valorTotal": 667.50,
  "comisionProducto": 2.00,
  "ivaPct": 13
}
```

- `existencia`: suma de `cantidad_disponible` de sus lotes.
- `costoPeps`: `costo_unitario` del lote que sale primero (el más antiguo con existencia). Si está agotado, el de la última compra; `null` si nunca se compró. Costo **sin IVA**, 2 decimales al mostrarlo (en la base son 4).
- `valorCosto`: Σ `cantidad_disponible × costo_unitario` de sus lotes.
- `conteos` respeta `buscar` e `idCategoria` pero no `filtro`. `valorTotal`: valor al costo de todo el inventario (sin filtros).
- `comisionProducto` (`COMISION_PRODUCTO`) e `ivaPct` (`IVA_PCT`) de `tb_parametros`: el formulario propone la comisión y muestra el precio sin IVA.

### `GET /api/productos/{id}`

Todas las columnas de `tb_productos` en camelCase, más lo calculado para el detalle:

```json
{
  "idProducto": 1, "codigo": "7410000000123", "nombreProducto": "Shampoo hidratante 400 ml", "descripcion": "Para cabello seco o maltratado.",
  "idMarca": 1, "idCategoria": 1, "codUnidadMedida": 59, "precioVenta": 13.00, "comisionFija": 2.00, "stockMinimo": 6, "activo": true,
  "nombreMarca": "Aurora Pro", "nombreCategoria": "Cabello",
  "existencia": 2, "costoPeps": 6.50, "ultimoCosto": 6.80, "vendidos30d": 15,
  "lotes": [
    { "idLote": 1, "fechaIngreso": "2026-09-18T10:00:00-06:00", "costoUnitario": 6.50, "cantidadInicial": 12, "cantidadDisponible": 1, "numeroCompra": "C-0142" },
    { "idLote": 2, "fechaIngreso": "2026-10-21T10:00:00-06:00", "costoUnitario": 6.80, "cantidadInicial": 12, "cantidadDisponible": 1, "numeroCompra": "C-0157" }
  ],
  "ultimosMovimientos": [
    { "fechaHora": "2026-12-12T15:20:00-06:00", "tipo": "SALIDA_VENTA", "cantidad": -1, "referencia": "DTE-01-…0412", "motivo": null },
    { "fechaHora": "2026-12-05T09:10:00-06:00", "tipo": "SALIDA_AJUSTE", "cantidad": -1, "referencia": null, "motivo": "Producto dañado: frasco roto" }
  ]
}
```

- `lotes`: solo los que tienen existencia, en orden PEPS (`fecha_ingreso`, `id_lote`). `numeroCompra` es `null` si el lote nació de un ajuste.
- `ultimoCosto`: costo del lote más nuevo, tenga o no existencia (`null` si nunca se compró). Es el costo de un ajuste de entrada.
- `vendidos30d`: unidades vendidas (ventas pagadas, menos devoluciones) en los últimos 30 días. El frontend calcula "alcanza para unos N días".
- `ultimosMovimientos`: los 5 más recientes del kardex. `tipo` es el de `tb_movimientos_inventario`; `referencia` es el número de compra o de DTE.

### `POST /api/productos` y `PUT /api/productos/{id}`

```json
{ "nombreProducto": "Shampoo matizador 400 ml", "codigo": "7410000000451", "descripcion": null, "idMarca": 1, "idCategoria": 1,
  "codUnidadMedida": 59, "precioVenta": 14.00, "comisionFija": 2.00, "stockMinimo": 6, "activo": true }
```

| Campo | Regla |
|---|---|
| `nombreProducto` | obligatorio, hasta 100 |
| `codigo` | obligatorio, hasta 25, letras, números y guiones; **único** |
| `idMarca`, `idCategoria`, `codUnidadMedida` | obligatorios; que existan |
| `precioVenta` | obligatorio, con IVA, ≥ 0, 2 decimales |
| `comisionFija` | obligatoria, ≥ 0, 2 decimales, no mayor que el precio sin IVA |
| `stockMinimo` | entero ≥ 0 (0 = nunca avisa) |

- 201 / 200 con el mismo objeto de `GET /api/productos/{id}`. Un producto nuevo empieza sin lotes: existencia 0.
- 409 si el código ya existe: `{ "mensaje": "Ese código ya es de “Shampoo hidratante 400 ml”.", "codigo": "PRODUCTO_DUPLICADO", "campos": { "codigo": "Ya hay un producto con este código." }, "idProductoExistente": 1 }`. El frontend ofrece ir a ese producto.
- Los productos no se borran (tienen kardex): `activo = false` los saca del punto de venta.
- Cambiar el precio no toca ventas pasadas. Va a la bitácora.

### `POST /api/productos/{id}/ajustes`

```json
{ "tipo": "DANADO", "cantidad": 1, "motivo": "Frasco roto al acomodar el estante." }
```

| `tipo` | `cantidad` | Kardex |
|---|---|---|
| `DANADO` (dañado o vencido) | cuántos salen (1 a la existencia) | `SALIDA_AJUSTE`, por PEPS |
| `USO_SALON` (se usó en un servicio) | cuántos salen | `USO_SALON`, por PEPS |
| `CONTEO` (conteo físico) | **cuántos hay** en el estante | si hay menos: `SALIDA_AJUSTE` por PEPS; si hay más: `ENTRADA_AJUSTE` con un lote nuevo al `ultimoCosto` |

- `motivo`: obligatorio, hasta 150. Va a `tb_movimientos_inventario.motivo` y a la bitácora con el usuario del token.
- La salida toca los lotes en orden PEPS: una fila del kardex por lote (bloqueados con `SELECT … FOR UPDATE`).
- 200 con el producto actualizado (igual que `GET /api/productos/{id}`).
- 409 `STOCK_INSUFICIENTE` si se pide sacar más de lo que hay. 400 con `campos.cantidad` si el conteo es igual a la existencia, o si es mayor y el producto nunca se compró (no hay costo para la entrada).

### `GET /api/categorias` · `GET /api/marcas` · `POST /api/marcas`

- `GET /api/categorias` → `[{ "idCategoria": 1, "nombreCategoria": "Cabello" }]`
- `GET /api/marcas` → `[{ "idMarca": 1, "nombreMarca": "Aurora Pro" }]`, por nombre.
- `POST /api/marcas` `{ "nombreMarca": "Aurora Pro" }` → 201 `{ "idMarca": 5, "nombreMarca": "Aurora Pro" }`. Se agrega desde el formulario de producto. 409 con `campos.nombreMarca` si ya existe (sin importar mayúsculas ni tildes).

## Catálogos de Hacienda

- `GET /api/catalogos/actividades` → `[{ "codActividad": "96020", "descripcion": "Peluquería y otros tratamientos de belleza" }]` (CAT-019 completo).
- `GET /api/catalogos/distritos` → `[{ "idDistrito": 1, "distrito": "San Salvador", "municipio": "San Salvador Centro", "departamento": "San Salvador" }]` (CAT-008 unido a municipios y departamentos).
- `GET /api/catalogos/unidades-medida` → `[{ "codUnidadMedida": 59, "nombre": "Unidad" }]` (CAT-014). Para productos; los servicios usan siempre 99.

## Siguientes endpoints

Se agregan aquí a medida que se programan las pantallas (compras, agenda…). Para cada uno: método, ruta, cuerpo, respuesta y errores.
