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

## Proveedores (`tb_proveedores`)

### `GET /api/proveedores`

Todos (activos e inactivos), por `nombre_comercial`. Son pocos: el frontend busca y filtra sin volver a pedir.

```json
[
  { "idProveedor": 1, "nombreComercial": "Distribuidora Aurora", "razonSocial": "Aurora Distribuciones, S.A. de C.V.",
    "nit": "00000000000011", "nrc": "0000011", "nacionalidad": "El Salvador", "contactoNombre": "Andrea López", "telefono": "7000-0031",
    "diasCredito": 30, "activo": true,
    "ultimaCompra": { "fechaCompra": "2026-11-20", "total": 318.40 } }
]
```

- `nit` y `nrc` van sin guiones (el frontend los muestra con guiones). `ultimaCompra` es `null` si nunca se le compró; no cuenta las anuladas.

### `GET /api/proveedores/{id}`

Todas las columnas en camelCase, más:

```json
{
  "ultimasCompras": [
    { "idCompra": 160, "numeroCompra": "C-0160", "fechaCompra": "2026-11-20", "productos": 5, "total": 318.40, "fechaVencimientoPago": "2026-12-20" }
  ],
  "comprasAnio": { "cantidad": 9, "total": 1684.20 }
}
```

- `ultimasCompras`: las 3 más recientes, sin anuladas. `comprasAnio`: las de este año.

### `POST /api/proveedores` y `PUT /api/proveedores/{id}`

```json
{ "nombreComercial": "Belleza Pro Distribuidora", "razonSocial": "Belleza Profesional, S.A. de C.V.", "nit": "00000000000051",
  "nrc": "0000051", "nacionalidad": "El Salvador", "contactoNombre": null, "telefono": null, "correo": null, "direccion": null, "diasCredito": 30, "notas": null }
```

| Campo | Regla |
|---|---|
| `nombreComercial` | obligatorio, hasta 150 |
| `razonSocial` | obligatoria, hasta 250 |
| `nit` | obligatorio: 14 dígitos (o 9 si es un DUI homologado); **único** |
| `nrc` | obligatorio: 2 a 8 dígitos; **único**. Sin NRC no se acredita el IVA de las compras |
| `nacionalidad` | obligatoria, hasta 40; país del proveedor, por defecto `El Salvador`. Sale en el registro de control de inventarios (art. 81 del Reglamento). Columna `tb_proveedores.nacionalidad` (modelo v1.4) |
| `contactoNombre` (100), `telefono` (30), `correo` (100, formato de correo), `direccion` (200), `notas` (300) | opcionales |
| `diasCredito` | entero de 0 a 120; 0 = contado |

- 201 / 200 con el mismo objeto de `GET /api/proveedores/{id}`. Un proveedor nuevo queda activo.
- 409 `PROVEEDOR_DUPLICADO` si el NIT o el NRC ya son de otro: `campos.nit` o `campos.nrc`, e `idProveedorExistente`. El frontend ofrece ir a ese proveedor.
- Va a la bitácora.

### `PATCH /api/proveedores/{id}/activo`

`{ "activo": false }` → 200 con la ficha. Un proveedor inactivo no sale al registrar compras; sus compras quedan. Los proveedores no se borran.

## Compras (`tb_compras`, `tb_detalle_compras`, `tb_lotes`)

Una línea es un **producto** (crea un lote PEPS y una entrada en el kardex `ENTRADA_COMPRA`) o un **gasto** del local sin producto (alquiler, luz, agua: no toca el inventario). Las compras no se editan: si algo llegó mal, se corrige con un ajuste en Inventario o con la nota de crédito del proveedor. Una **nota de crédito (`NC`)** puede llevar líneas de producto: son las unidades que se devuelven al proveedor (migración 1.5, ver abajo). Desde la migración 1.3 llevan los datos del libro de compras de IVA (ver "Libros de IVA").

### `GET /api/compras?buscar=&filtro=todas&idProveedor=&pagina=0&tamano=50`

- `buscar` (opcional): `numero_compra` o nombre del proveedor (sin importar tildes ni mayúsculas).
- `filtro`: `todas` · `este-mes` (`fecha_compra` en el mes actual). `idProveedor` opcional. Orden: la más nueva primero (`fecha_compra`, `id_compra`).

```json
{
  "contenido": [
    { "idCompra": 157, "numeroCompra": "C-0157", "fechaCompra": "2026-10-21", "idProveedor": 1, "nombreProveedor": "Distribuidora Aurora",
      "tipoDocumentoProveedor": "CCF", "numeroDocumentoProveedor": "DTE-03-M001P001-000000000002291",
      "productos": 3, "unidades": 30, "gastos": 0, "primerGasto": null, "total": 248.83, "estado": "REGISTRADA" }
  ],
  "totalElementos": 24,
  "conteos": { "todas": 24, "este-mes": 1 },
  "mes": { "cantidad": 1, "total": 256.48 }
}
```

- `conteos` respeta `buscar` e `idProveedor`. `mes`: las compras del mes actual, sin filtros (sin anuladas); **una nota de crédito resta** del total.
- `productos` y `unidades` cuentan solo las líneas de producto; `gastos` las líneas sin producto y `primerGasto` es la descripción de la primera (la lista la muestra cuando no hay productos).

### `GET /api/compras/{id}`

```json
{
  "idCompra": 157, "numeroCompra": "C-0157", "idProveedor": 1, "nombreProveedor": "Distribuidora Aurora",
  "fechaCompra": "2026-10-21", "tipoDocumentoProveedor": "CCF", "numeroDocumentoProveedor": "DTE-03-M001P001-000000000002291",
  "claseDocumento": 4, "codigoGeneracionProveedor": "0A1B2C3D-0000-4000-8000-000000000157",
  "idCompraRelacionada": null, "numeroCompraRelacionada": null, "periodoIva": "2026-10-01",
  "subtotalSinIva": 220.20, "comprasExentas": 0, "iva": 28.63, "ivaPercibido": 0, "total": 248.83,
  "tipoOperacionRenta": 1, "clasificacionRenta": 1, "sectorRenta": 4, "tipoCostoGasto": 5,
  "fechaVencimientoPago": "2026-11-20", "estado": "REGISTRADA",
  "nombreUsuario": "Ligia Manzano", "creadoEn": "2026-10-21T10:42:00-06:00",
  "detalle": [
    { "idProducto": 1, "nombreProducto": "Shampoo hidratante 400 ml", "cantidad": 12, "costoUnitario": 6.80, "subtotal": 81.60, "cantidadDisponible": 1 },
    { "idProducto": null, "descripcion": "Bolsas para clientas", "cantidad": 1, "costoUnitario": 12.00, "subtotal": 12.00 }
  ]
}
```

- `cantidadDisponible`: lo que queda del lote que creó esa línea ("quedan 1 de 12"). Una línea de gasto trae `descripcion` y no tiene lote.
- `numeroCompraRelacionada`: en una NC o ND, el número de la compra que corrige (el panel lo muestra como enlace).

### `POST /api/compras`

```json
{
  "idProveedor": 1, "fechaCompra": "2026-12-12", "tipoDocumentoProveedor": "CCF", "numeroDocumentoProveedor": "DTE-03-M001P001-000000000003105",
  "claseDocumento": 4, "codigoGeneracionProveedor": "5E1C9B2A-7D4F-4A3B-9C2E-1F0A6B8D3E21", "idCompraRelacionada": null,
  "periodoIva": "2026-12-01", "comprasExentas": 0, "percepcion": false,
  "tipoOperacionRenta": 1, "clasificacionRenta": 1, "sectorRenta": 4, "tipoCostoGasto": 5,
  "detalle": [
    { "idProducto": 1, "cantidad": 12, "costoUnitario": 7.00 },
    { "descripcion": "Bolsas para clientas", "cantidad": 1, "costoUnitario": 12.00 }
  ]
}
```

| Campo | Columna | Regla |
|---|---|---|
| `idProveedor` | `id_proveedor` | obligatorio, activo |
| `fechaCompra` | `fecha_compra` | obligatoria, no en el futuro. Es la fecha del documento del proveedor |
| `tipoDocumentoProveedor` | `tipo_documento_proveedor` | `CCF` · `FACTURA` · `NC` · `ND` · `OTRO` |
| `numeroDocumentoProveedor` | `numero_documento_proveedor` | número de control del DTE (o número impreso); obligatorio salvo en `OTRO`; hasta 40 |
| `claseDocumento` | `clase_documento` | `4` DTE (normal) · `1` impreso |
| `codigoGeneracionProveedor` | `codigo_generacion_proveedor` | UUID de 36 caracteres; **obligatorio en `CCF`, `NC` y `ND` electrónicos** (lo pide el anexo de compras). Único entre las compras no anuladas |
| `idCompraRelacionada` | `id_compra_relacionada` | obligatorio en `NC` y `ND` (el CCF que corrigen); nulo en los demás |
| `periodoIva` | `periodo_iva` | primer día del mes en que se declara el crédito fiscal: el de `fechaCompra` o hasta 3 meses después (art. 63 Ley de IVA). Sin IVA aparte, el mes de `fechaCompra` |
| `comprasExentas` | `compras_exentas` | exento o no sujeto, ≥ 0, 2 decimales; normalmente 0 |
| `percepcion` | → `iva_percibido` | `true` si el proveedor (gran contribuyente) cobró la percepción de 1 % |
| `tipoOperacionRenta` · `clasificacionRenta` · `sectorRenta` · `tipoCostoGasto` | columnas `*_renta` y `tipo_costo_gasto` | códigos del anexo (MODELO_DATOS.md → "Códigos de renta"). La pantalla propone: productos = `1/1/4/5`; gastos = `1/2/4/2`; una nota, los de la compra que corrige |
| `detalle` | | al menos 1 línea. Producto: `idProducto` activo, no se repite. Gasto: `descripcion` (hasta 200) sin `idProducto`. **`ND`: solo líneas sin producto.** **`NC`: puede llevar líneas con producto = unidades devueltas** (ver "Nota de crédito con devolución"); una `NC` sin líneas de producto es una rebaja de precio y no mueve unidades |
| `cantidad` | | entero de 1 a 9999 (un gasto lleva 1). En una línea de producto de una `NC`, además `≤` lo que trajo la compra relacionada y `≤` lo que queda de su lote |
| `costoUnitario` | | sin IVA, ≥ 0, hasta 4 decimales (en una `FACTURA` u `OTRO`, el costo que se pagó) |

Lo calcula la API (igual que `totalesCompra` en `js/utils/calculos.js`):

- `subtotal` de cada línea = `cantidad × costoUnitario` a 2 decimales; `subtotalSinIva` (compras gravadas) = suma de las líneas.
- `iva` = `subtotalSinIva × IVA_PCT` a 2 decimales, **solo con `CCF`, `NC` y `ND`** (crédito fiscal); con `FACTURA` u `OTRO` es 0.
- `ivaPercibido` = `subtotalSinIva × 1 %` si `percepcion`, solo con IVA aparte.
- `total` = `subtotalSinIva + comprasExentas + iva + ivaPercibido` (un check de la base lo exige). `fechaVencimientoPago` = `fechaCompra + diasCredito` del proveedor (`null` si es de contado). `numeroCompra` = el siguiente (`C-0163`).
- Cada línea **de producto** → un `tb_lotes` con `fecha_ingreso = now()` (se vende después de los lotes que ya hay) y su `tb_movimientos_inventario` `ENTRADA_COMPRA`. Las de gasto no tocan el inventario. Todo en una transacción, con la bitácora.

Respuestas:

- 201 con el mismo objeto de `GET /api/compras/{id}`.
- 400 con `campos` (`idProveedor`, `fechaCompra`, `numeroDocumentoProveedor`, `codigoGeneracionProveedor`, `idCompraRelacionada`, `periodoIva`, `comprasExentas`, `detalle`). Un error de una línea: `campos.detalle` con el texto ("La línea 2: la cantidad tiene que ser mayor que 0.").
- 409 `STOCK_INSUFICIENTE` si una `NC` devuelve más unidades de las que le quedan al lote de la compra relacionada (ya se vendieron): `mensaje` con el texto de la base ("Del lote 12 solo quedan 1 unidades: no se pueden devolver 3"). Nada se guarda.
- 409 `COMPRA_DUPLICADA` si ya hay una compra no anulada con ese `numeroDocumentoProveedor` del mismo proveedor o con ese `codigoGeneracionProveedor`: `campos.numeroDocumentoProveedor`, e `idCompraExistente`.

### Nota de crédito con devolución (migración 1.5)

En una `NC` las líneas **con producto** son las unidades que se devuelven al proveedor; las líneas **sin producto** son rebajas de precio y no mueven unidades. Una `ND` solo lleva líneas sin producto.

- `idProducto` tiene que ser uno de los productos de la compra relacionada (`idCompraRelacionada`), y `cantidad` no puede pasar de lo que esa compra trajo ni de lo que queda de su lote (`cantidadDisponible`). Si no, 400 con `campos.detalle`.
- No crean lote. La API guarda la `NC` y sus líneas y, **en la misma transacción**, llama `fn_registrar_devolucion_proveedor(idCompra, idUsuario)`: cada línea con producto saca sus unidades del lote que creó la compra relacionada, **al costo de ese lote**, y deja un movimiento `DEVOLUCION_PROVEEDOR` (negativo, con `id_detalle_compra` de la línea de la `NC`) en el kardex.
- Si el lote ya no tiene las unidades (se vendieron), la función se detiene, la transacción se revierte y la API responde 409 `STOCK_INSUFICIENTE`.
- La `NC` sigue restando del total del mes y del libro de compras; el kardex trae la `NC` como documento (ver "Registro de control de inventarios").

## Libros de IVA (vistas `v_anexo_*`, migración 1.3)

Solo lectura, para administradora, contador y auditor (403 a recepción). Fuente: *Manual de usuario para carga de archivo de los anexos de la declaración del IVA* (Hacienda). Las reglas están en `modelo/MODELO_DATOS.md` → "Libros de IVA y anexos del F-07".

### `GET /api/libros-iva?periodo=2026-11`

Cada lista son las filas de su vista, con las columnas en camelCase y en el orden de `correlativo`:

| Lista | Vista | Filtro |
|---|---|---|
| `ventasContribuyentes` | `v_anexo_ventas_contribuyentes` | `periodo = '2026-11-01'` |
| `consumidorFinal` | `v_anexo_ventas_consumidor_final` | igual |
| `compras` | `v_anexo_compras` | igual (`periodo` es `periodo_iva`) |
| `anulados` | `v_anexo_anulados` | igual (mes de la invalidación) |

```json
{
  "periodo": "2026-11",
  "emisor": { "nombre": "Ligia Manzano", "nit": "00000000000017", "nrc": "0000017" },
  "ventasContribuyentes": [
    { "correlativo": 1, "idDte": 529, "fecha": "2026-11-05", "claseDocumento": 4, "tipoDocumento": "03",
      "numeroResolucion": "DTE03M001P001000000000000529", "serie": "<sello de 40>", "numeroDocumento": "A1B2C3D4…",
      "nitNrc": "00000000000081", "nrc": "0000081", "dui": "", "nombre": "Eventos Lumière, S.A. de C.V.",
      "ventasExentas": 0, "ventasNoSujetas": 0, "ventasGravadas": 200.00, "debitoFiscal": 26.00, "totalVentas": 226.00,
      "tipoOperacionRenta": 1, "tipoIngresoRenta": 2, "ivaRetenido": 0, "ivaPercibido": 0, "signo": 1,
      "lineaCsv": "05/11/2026;4;03;DTE03M001P001000000000000529;…;1;2;1" }
  ],
  "consumidorFinal": [
    { "correlativo": 1, "fecha": "2026-11-02", "establecimiento": "M001P001", "esAnulacion": false, "documentos": 5,
      "delDocumento": "…", "alDocumento": "…", "numeroControlDel": "DTE-01-M001P001-000000000000501", "numeroControlAl": "DTE-01-M001P001-000000000000505",
      "ventasExentas": 0, "ventasNoSujetas": 0, "ventasGravadas": 167.00, "ivaIncluido": 19.22, "totalVentas": 167.00,
      "tipoOperacionRenta": 1, "tipoIngresoRenta": 2, "lineaCsv": "…" },
    { "correlativo": 2, "fecha": "2026-11-02", "establecimiento": "M001P001", "esAnulacion": true, "documentos": 1,
      "delDocumento": "…", "alDocumento": "…", "numeroControlDel": "DTE-01-M001P001-000000000000511", "numeroControlAl": "DTE-01-M001P001-000000000000511",
      "fechaDocumento": "2026-10-31", "ventasExentas": 0, "ventasNoSujetas": 0, "ventasGravadas": -3.39, "ivaIncluido": -0.39, "totalVentas": -3.39,
      "tipoOperacionRenta": 1, "tipoIngresoRenta": 2, "lineaCsv": null } ],
  "compras": [ { "correlativo": 1, "idCompra": 158, "fecha": "2026-11-05", "tipoDocumento": "03", "numeroDocumento": "…", "nitNrc": "…", "nrc": "…", "dui": "",
      "nombre": "…", "comprasExentas": 0, "comprasGravadas": 85.40, "creditoFiscal": 11.10, "totalCompras": 85.40, "ivaPercibido": 0,
      "totalDocumento": 96.50, "tipoOperacionRenta": 1, "clasificacionRenta": 2, "sectorRenta": 4, "tipoCostoGasto": 2, "signo": 1, "lineaCsv": "…" } ],
  "anulados": [ { "correlativo": 1, "idDte": 511, "fecha": "2026-11-02", "fechaDocumento": "2026-10-31", "numeroResolucion": "DTE-01-M001P001-000000000000511",
      "tipoDocumento": "01", "serie": "…", "codigoGeneracion": "A1B2C3D4-0000-4000-8000-0000000001FF", "lineaCsv": "…" } ],
  "pendientes": { "sinSello": 1 }
}
```

- **`lineaCsv` la arma la base** (funciones `fn_anexo_*`): la API la pasa tal cual. La pantalla une las líneas con `\r\n` y descarga el archivo para "Subir detalle de ventas y compras" del F-07.
- `pendientes.sinSello`: DTE de producción del mes en contingencia (`estado = 'CONTINGENCIA'`). **Sí van en el libro** aunque no tengan sello (art. 141 del Código Tributario); la columna `serie` queda vacía y la pantalla avisa que hay que transmitirlos a Hacienda antes de declarar.
- Filas con `esAnulacion: true` (consumidor final, art. 87 del Reglamento): factura invalidada en un mes posterior al de su emisión; se resta en el mes de la invalidación (`fecha`), con montos en negativo, `fechaDocumento` = su emisión y `lineaCsv: null`. La pantalla las omite del CSV (el anexo no admite negativos) y las muestra en la lista y el Excel.
- `nrc` (solo dígitos) es para el libro en Excel; el anexo usa `nitNrc`. Las filas de consumidor final se agrupan por `fecha` + `establecimiento` (`numeroControl.slice(7, 15)`) + renta; `numeroControlDel`/`numeroControlAl` son el primero y el último número de control.
- `emisor` (`tb_emisores`: nombre, NIT y NRC, solo dígitos) va en el encabezado de cada hoja del libro impreso (`libro-iva-imprimir.html`, art. 82 del Reglamento).
- `periodo` inválido o en el futuro → 400 `campos.periodo`.

## Registro de control de inventarios (vista `v_registro_inventario`, modelo v1.4)

Registro de control de inventarios del art. 142-A del Código Tributario (contenido del art. 81 del Reglamento): por producto, cada movimiento del kardex con unidades y costos PEPS. Solo lectura. Roles `ADMINISTRADOR`, `CONTADOR` y `AUDITOR` (los demás reciben 403).

### `GET /api/inventario/registro?periodo=2026-11[&idProducto=3]`

Los datos salen de la vista SQL `v_registro_inventario` (modelo v1.4): una fila por lote tocado, igual que `tb_movimientos_inventario`. Si no se manda `idProducto` vienen todos los productos con movimientos en el mes o con saldo inicial distinto de 0, por nombre.

```json
{
  "emisor": { "nombre": "Ligia Manzano", "nit": "00000000000017", "nrc": "0000017" },
  "periodo": "2026-11",
  "productos": [
    { "idProducto": 1, "codigo": "7410000000123", "nombreProducto": "Shampoo hidratante 400 ml", "marca": "Aurora Pro", "unidadMedida": "Unidad",
      "saldoInicial": { "unidades": 12, "valor": 78.00 },
      "movimientos": [
        { "idMovimiento": 1001, "correlativo": 1, "fecha": "2026-11-05", "tipo": "ENTRADA_COMPRA", "descripcionOperacion": "Compra a proveedor",
          "tipoDocumento": "CCF", "numeroDocumento": "DTE-03-M001P001-000000000000157", "proveedor": "Aurora Distribuciones, S.A. de C.V.",
          "nacionalidadProveedor": "El Salvador", "referenciaCosto": "Libro de compras 11/2026, compra C-0157", "idLote": 2, "costoUnitario": 6.80,
          "entradaUnidades": 12, "salidaUnidades": 0, "entradaValor": 81.60, "salidaValor": 0, "saldoUnidades": 24, "saldoValor": 159.60 },
        { "idMovimiento": 1002, "correlativo": 2, "fecha": "2026-11-09", "tipo": "SALIDA_VENTA", "descripcionOperacion": "Venta a cliente",
          "tipoDocumento": "FACTURA", "numeroDocumento": "DTE-01-M001P001-000000000000412", "proveedor": null, "nacionalidadProveedor": null,
          "referenciaCosto": "Lote 1 (compra C-0142)", "idLote": 1, "costoUnitario": 6.50,
          "entradaUnidades": 0, "salidaUnidades": 1, "entradaValor": 0, "salidaValor": 6.50, "saldoUnidades": 23, "saldoValor": 153.10 }
      ] }
  ]
}
```

- `saldoInicial` = el saldo (`saldoUnidades`, `saldoValor`) de la última fila del producto **antes** del mes; `0` y `0` si no hay ninguna.
- `movimientos`: solo las filas del mes, por fecha y luego por `idMovimiento`. `correlativo` es por producto y vuelve a 1 cada año (no cada mes). Cada salida trae una fila por lote que toca (PEPS), con el `costoUnitario` de ese lote.
- Entradas: `proveedor`, `nacionalidadProveedor` (de `tb_proveedores.nacionalidad`), `tipoDocumento` y `numeroDocumento` son los de la compra; en ventas, el documento es el DTE y no hay proveedor; en ajustes son `null`, salvo la devolución al proveedor, que trae la nota de crédito del proveedor. `descripcionOperacion` lleva el motivo del ajuste después de dos puntos (`Ajuste: producto dañado`, `Ajuste por inventario físico: …`). `referenciaCosto`: en compras, el libro de compras del mes en que se declaró (`Libro de compras MM/AAAA, compra C-0157`); en las demás filas, el lote PEPS y su compra (`Lote 1 (compra C-0142)`, o solo `Lote 7` si nació de un ajuste).
- `tipo`: los del kardex (`ENTRADA_COMPRA` · `ENTRADA_AJUSTE` · `SALIDA_VENTA` · `SALIDA_AJUSTE` · `USO_SALON` · `DEVOLUCION_ANULACION` · `DEVOLUCION_NC` · `DEVOLUCION_FACTURA` · `DEVOLUCION_PROVEEDOR`). `DEVOLUCION_PROVEEDOR` ("Devolución a proveedor", migración 1.5) es una salida al costo del lote de la compra que corrige la nota: trae como documento la `NC` del proveedor (`tipoDocumento` `NC`, su `numeroDocumento` y `proveedor`). `tipoDocumento`: `CCF`, `FACTURA`, `NC`, `ND` u `OTRO`. Las unidades y los valores van siempre como número (0 donde no aplica); valores en dólares con 2 decimales. Los saldos son acumulados: la última fila coincide con la suma de `cantidadDisponible` de los lotes (y su valor al costo) al cierre del mes.
- `emisor` (`tb_emisores`, NIT y NRC solo dígitos) va en el encabezado de cada folio impreso (`registro-inventario-imprimir.html`).
- `periodo` inválido o en el futuro → 400 `campos.periodo`. `idProducto` que no existe → 404.

## Inventario físico (`tb_inventarios_fisicos`, `tb_inventario_fisico_conteo`, vistas `v_acta_inventario_fisico` y `v_existencia_al_corte`, modelo v1.5)

Conteo físico del inventario al inicio del negocio y al cierre de cada ejercicio (31 de diciembre) con su acta firmada (art. 142 del Código Tributario); el comparativo contra el registro de control es el del art. 81 del Reglamento. Roles: `ADMINISTRADOR` y `CONTADOR` crean, editan y cierran; `AUDITOR` solo lee (los `POST`/`PUT` le dan 403); los demás roles, 403 en todo.

### `GET /api/inventario-fisico`

```json
[ { "idInventarioFisico": 1, "fechaCorte": "2025-12-31", "estado": "CERRADO", "productosContados": 14, "creadoEn": "2025-12-31T18:05:00-06:00", "cerradoEn": "2025-12-31T20:40:00-06:00" } ]
```

Por `fechaCorte`, del más nuevo al más viejo. `estado`: `BORRADOR` o `CERRADO`. `cerradoEn` es `null` mientras sea borrador. `productosContados` = productos con `cantidadContada` guardada.

### `POST /api/inventario-fisico`

Body `{ "fechaCorte": "2026-12-31" }`. 201 con el conteo nuevo (`BORRADOR`, forma del `GET /{id}`).

- 409 si ya existe un conteo con esa `fechaCorte` (es `unique`).
- 400 `campos.fechaCorte` si la fecha es futura o inválida, o si ya hay otro conteo en `BORRADOR` (se cierra o se deja uno solo abierto).

### `GET /api/inventario-fisico/{id}`

```json
{
  "idInventarioFisico": 1, "fechaCorte": "2025-12-31", "estado": "CERRADO", "cerradoEn": "2025-12-31T20:30:00-06:00", "observaciones": "Conteo con la contadora; sin faltantes graves.",
  "emisor": { "nombre": "Ligia Manzano", "nit": "00000000000017", "nrc": "0000017" },
  "conteo": [
    { "idProducto": 1, "codigo": "7410000000123", "nombreProducto": "Shampoo hidratante 400 ml", "marca": "Aurora Pro", "categoria": "Cabello", "unidadMedida": "Unidad",
      "existenciaSistema": 2, "valorSistema": 13.60, "cantidadContada": 3, "nota": "Un frasco estaba en bodega" }
  ],
  "acta": [
    { "categoria": "Cabello", "codigo": "7410000000123", "nombreProducto": "Shampoo hidratante 400 ml", "nombreMarca": "Aurora Pro", "unidadMedida": "Unidad",
      "idLote": 2, "cantidad": 3, "costoUnitario": 6.80, "valor": 20.40, "referenciaCosto": "Libro de compras 12/2026, compra C-0157" }
  ],
  "ajustes": [ { "idProducto": 1, "cantidad": 1, "valor": 6.80 } ]
}
```

- `conteo`: un elemento por producto activo, por categoría y nombre. `existenciaSistema` y `valorSistema` (valor al costo de esa existencia, sin IVA) son la **existencia al final del día de `fechaCorte`** (`v_existencia_al_corte`, calculada desde el kardex sin contar los ajustes del propio conteo), **no la de hoy**, tanto en `BORRADOR` como `CERRADO`; al cerrar quedan **congelados** (`tb_inventario_fisico_conteo.existencia_sistema`) y un conteo `CERRADO` no vuelve a cambiar. `cantidadContada` es `null` si aún no se cuenta; `nota` puede ser `null`.
- `acta` (solo `CERRADO`): filas de `v_acta_inventario_fisico` en camelCase, una por lote vivo al final del día de `fechaCorte`, por categoría y producto. `costoUnitario` sin IVA; `valor` = `cantidad × costoUnitario`; `referenciaCosto`: `Libro de compras 12/2026, compra C-0157` o `Lote 7 (ajuste)`.
- `ajustes` (solo `CERRADO`): por cada producto con diferencia, `cantidad` firmada (`cantidadContada − existenciaSistema`) y `valor` firmado (PEPS: lo que sale se toma de los lotes más viejos; lo que entra, al último costo).
- 404 si no existe.

### `PUT /api/inventario-fisico/{id}/conteo`

Body: `[ { "idProducto": 1, "cantidadContada": 3, "nota": "Un frasco estaba en bodega" } ]` (puede traer solo los productos que cambiaron; `cantidadContada` entero ≥ 0, `nota` opcional hasta 150). Responde 200 con el `GET /{id}`. 409 si el conteo ya está `CERRADO`; 400 `campos` si una cantidad es inválida o un `idProducto` no existe.

### `POST /api/inventario-fisico/{id}/cerrar`

Body `{ "observaciones": "..." }` (opcional). Una sola llamada a `fn_cerrar_inventario_fisico(id, idUsuario, observaciones)`, en **una transacción**: guarda `existencia_sistema`, inserta un ajuste PEPS en el kardex por cada diferencia (fechado `fechaCorte` 23:59:59, hora de El Salvador, con `id_inventario_fisico`) y pasa a `CERRADO` (`cerradoEn`, `id_usuario_cierra`). Responde 200 con el `GET /{id}`.

- 400 `campos.conteo` con la lista de productos activos sin contar (`[{ "idProducto": 4, "nombreProducto": "..." }]`) si falta alguno.
- 409 si ya está `CERRADO`.
- 409 si lo que hay que sacar ya se vendió o ajustó después del corte ("Producto 3: faltan 2 unidades que ya se vendieron o ajustaron después del corte; revise esos movimientos antes de cerrar"). No cambia nada.

**Cerrar después de la fecha de corte está permitido** (p. ej. contar el 31 de diciembre y cerrar en enero, con ventas en medio): la diferencia se calcula contra la existencia del día de corte y los ajustes quedan fechados ese día a las 23:59:59, así que el kardex y el acta cuadran con lo contado. Un faltante sale por PEPS de los lotes que tenían existencia al corte, sin pasar de lo que les queda hoy; un sobrante entra como lote nuevo al costo del último lote anterior al corte (si nunca se compró antes del corte, 409 por falta de costo).

## Contabilidad: parámetros (`tb_cuentas_contables`, `tb_ejercicios`, `tb_periodos_contables`, `tb_tipos_partida`, `tb_config_contable`, migración 1.6)

Todo `/api/contabilidad/*`: **Administrador y Contador** leen y escriben; **Auditor** solo lee (GET); los demás roles, 403. El plan de cuentas del salón (718 cuentas) se carga con `modelo/catalogo_cuentas_salon.sql`. Los errores de los triggers y funciones de la base llegan como 400 (con `campos` si se sabe cuál) o 409 (con el mensaje de la función).

### `GET /api/contabilidad/cuentas`
Lista plana ordenada por `codigo` (el árbol lo arma el frontend con `codigoPadre`; la hija va después de su padre).
```json
[{ "codigo": "110101", "nombre": "Caja general", "tipo": "ACTIVO", "naturaleza": "D", "nivel": 2, "codigoPadre": "1101", "aceptaMovimiento": true, "activa": true }]
```
`tipo`: `ACTIVO`, `PASIVO`, `CAPITAL`, `INGRESO`, `COSTO_GASTO`, `LIQUIDADORA`, `ORDEN_DEUDORA`, `ORDEN_ACREEDORA`. `naturaleza`: `D` o `A`.

### `POST /api/contabilidad/cuentas`
Body: `{ codigo, nombre, tipo, naturaleza, nivel, codigoPadre, aceptaMovimiento }` (`codigoPadre` null para nivel 0). Responde 201 con la cuenta (`activa: true`). 400 con `campos` si: el código no son 1 a 12 dígitos o ya existe; la hija no empieza con el código del padre o no es más larga; el padre acepta movimiento (`La cuenta X acepta movimiento: no puede tener subcuentas`); nivel fuera de 0 a 9 o no coincide con el padre (nivel 0 solo sin padre). El frontend sugiere tipo, naturaleza y nivel (padre + 1) desde el padre.

### `PUT /api/contabilidad/cuentas/{codigo}`
Body: `{ nombre, aceptaMovimiento, activa }`. **El código, el padre, el tipo y la naturaleza no cambian** (`El código de una cuenta no se cambia`). 400 si una cuenta con subcuentas pasa a aceptar movimiento (`La cuenta X tiene subcuentas: no puede aceptar movimiento`) o si el nombre va vacío. Responde la cuenta.

### `DELETE /api/contabilidad/cuentas/{codigo}`
Solo si no tiene subcuentas ni líneas de partida; si no, 409 ("tiene subcuentas / partidas: desactívela"). Lo normal es desactivar con el PUT; la pantalla de esta fase no borra.

### `GET /api/contabilidad/ejercicios`
```json
[{ "anio": 2026, "fechaInicio": "2026-01-01", "fechaFin": "2026-12-31", "estado": "ABIERTO",
   "periodos": [{ "mes": 1, "estado": "CERRADO", "cerradoEn": "2026-02-05T09:00:00-06:00" }, { "mes": 11, "estado": "ABIERTO", "cerradoEn": null }] }]
```
Por año, `periodos` trae los 12 meses ordenados.

### `POST /api/contabilidad/ejercicios`
Body: `{ "anio": 2027 }`. Llama a `fn_crear_ejercicio`: crea el ejercicio con sus 12 meses abiertos. 409 si el año ya existe; 400 si no está entre 2000 y 2100. Responde 201 con el ejercicio.

### `POST /api/contabilidad/periodos/{anio}/{mes}/cerrar` y `/reabrir`
Sin body. `cerrar` llama a `fn_cerrar_periodo` (con el usuario del token); `reabrir`, a `fn_reabrir_periodo` y **queda en la bitácora**. Responde el ejercicio actualizado. 409 con el mensaje de la función:
- `Solo se puede cerrar el mes abierto más antiguo (11/2026)`
- `El mes 11/2026 tiene partidas en borrador: aplíquelas o bórrelas antes de cerrarlo`
- `Solo se puede reabrir el último mes cerrado (10/2026)`
- `El ejercicio 2026 está cerrado`

### `GET /api/contabilidad/tipos-partida` · `POST` · `PUT /api/contabilidad/tipos-partida/{codigo}`
`[{ "codigo": "PDA", "nombre": "Partida de diario", "predeterminado": true, "activo": true }]`. `POST` y `PUT` reciben ese mismo objeto (el `codigo` del PUT no cambia). `codigo`: 3 letras mayúsculas. Hay **exactamente un** predeterminado: marcar uno quita la marca al anterior en la misma transacción; quitarle la marca al único predeterminado o desactivarlo es 400. 409 si el código ya existe.

### `GET /api/contabilidad/configuracion` · `PUT /api/contabilidad/configuracion`
Un solo registro (`tb_config_contable`):
```json
{ "ctaUtilidadEjercicio": null, "ctaUtilidadesAnteriores": null, "ctaPerdidaEjercicio": null, "ctaPerdidasAnteriores": null,
  "ctaPerdidasGanancias": null, "ctaReservaLegal": null, "ctaClientes": null, "ctaProveedores": null,
  "tipoPartidaVentas": "ING", "tipoPartidaCompras": "COM", "modoVentas": "DETALLE", "modoCompras": "DETALLE" }
```
Las cuentas arrancan en `null` hasta que la contadora las confirme. En el PUT, cada cuenta debe existir y aceptar movimiento; los tipos de partida deben estar activos; `modo*` es `DETALLE` o `RESUMEN` (400 con `campos` si no).

### Contabilidad: cierre del ejercicio (migración 1.8)
Roles: **Administrador y Contador**; el Auditor no (403). Orden: 1) la contadora aplica sus ajustes de diciembre (depreciación, provisiones, impuesto sobre la renta, reserva legal; el sistema no los calcula); 2) `partida-cierre`; 3) se cierran los 12 meses; 4) `cerrar`. Fuentes: Código de Comercio arts. 435-446, 123 y 295.

#### `POST /api/contabilidad/ejercicios/{anio}/partida-cierre`
Sin body. Llama a `fn_generar_partida_cierre(anio, usuario)`: crea en **BORRADOR**, al 31 de diciembre, tipo `PDA`, origen `CIERRE`, la partida que deja en cero cada cuenta de resultado (ingresos, costos y gastos) contra Pérdidas y Ganancias y lleva el resultado a la utilidad (haber) o pérdida (debe) del ejercicio. Responde 201 con la partida (formato de `GET /partidas/{id}`); la contadora la revisa y la aplica con `POST /partidas/{id}/aplicar`. 409 con el mensaje de la función:
- `Configure en Contabilidad > Parámetros las cuentas de Pérdidas y Ganancias, utilidad del ejercicio y pérdida del ejercicio`
- `El ejercicio 2026 ya tiene su partida de cierre (bórrela si está en borrador, o anúlela)`
- `El ejercicio 2026 tiene partidas en borrador: aplíquelas o bórrelas antes del cierre`
- `El ejercicio 2026 no tiene saldos en cuentas de resultado`

#### `POST /api/contabilidad/ejercicios/{anio}/cerrar`
Sin body. Llama a `fn_cerrar_ejercicio(anio, usuario)`: marca el ejercicio `CERRADO` (ya no se reabre ningún mes) y, si enero del año siguiente existe y está abierto y la cuenta de utilidades (o pérdidas) anteriores está configurada, deja en BORRADOR (origen `APERTURA`, 1 de enero) el traslado de la utilidad del ejercicio a utilidades anteriores (o de pérdidas anteriores contra pérdida del ejercicio). Responde `{ "idPartidaTraslado": 123 }`, o `null` en ese campo si no se pudo crear. 409 con el mensaje de la función:
- `El ejercicio 2026 no existe o ya está cerrado`
- `Cierre primero los 12 meses del ejercicio 2026`
- `Falta aplicar la partida de cierre del ejercicio 2026`
- `Quedan cuentas de resultado con saldo en el ejercicio 2026: revise la partida de cierre`

## Contabilidad: partidas (`tb_partidas`, `tb_partida_detalle`, vista `v_libro_diario`, migración 1.6)

Mismos roles que "Contabilidad: parámetros": **Administrador y Contador** leen y escriben; **Auditor** solo lee (GET); los demás, 403. **Todo cambio va en una sola transacción** (encabezado + líneas) y la API **nunca hace UPDATE ni DELETE sobre una partida APLICADA**: la base lo impide con `fn_partida_valida` y `fn_partida_detalle_valida` (art. 139 del Código Tributario); se corrige anulándola con su inversa. Los errores de esos triggers y de las funciones llegan como 409 con el mensaje (o 400 con `campos` si es de un campo). Los montos van en dólares con 2 decimales.

Reglas de la base que el frontend repite para avisar antes: el mes de la `fecha` debe estar ABIERTO (`El mes 10/2026 está cerrado o no existe`); las líneas solo usan cuentas activas que aceptan movimiento (`La cuenta 1101 no acepta movimiento o está inactiva`); cada línea lleva el monto en el `debe` o en el `haber`, no en los dos ni en cero; aplicar exige 2 o más líneas y `debe = haber` al centavo (`La partida no cuadra: debe 10.00, haber 9.00 (2 líneas)`). El `numero` (`char(6)`) es **MM + correlativo de 4 dígitos por tipo y mes** (`110001`: la primera de noviembre de ese tipo) y se asigna al aplicar, no al crear: un borrador tiene `numero: null`.

### `GET /api/contabilidad/partidas?anio=2026&mes=&tipo=&estado=&buscar=&pagina=0&tamano=50`
Todos los filtros son opcionales. `estado`: `BORRADOR` o `APLICADA`; `buscar`: parte del `numero` o del `concepto` (sin distinguir mayúsculas ni tildes). Orden: `fecha` descendente, luego `idPartida` descendente. Paginación estándar (`{ contenido, totalElementos }`), sin las líneas:
```json
{ "contenido": [{ "idPartida": 5, "anio": 2026, "mes": 11, "numero": "110002", "fecha": "2026-11-13", "codigoTipo": "PDA", "concepto": "Anulación de la partida PDA 110001: …",
    "estado": "APLICADA", "origen": "ANULACION", "totalDebe": 25.00, "totalHaber": 25.00,
    "idPartidaAnula": 4, "numeroAnula": "110001", "idPartidaAnuladaPor": null, "numeroAnuladaPor": null,
    "creadoPor": "Mario Pérez", "creadoEn": "2026-11-13T18:00:00-06:00", "aplicadaPor": "Mario Pérez", "aplicadaEn": "2026-11-13T18:00:00-06:00" }],
  "totalElementos": 6 }
```
`origen`: `MANUAL` (las de esta pantalla) o `ANULACION`; los demás orígenes de la base (`VENTAS`, `PLANILLA`…) los usarán las partidas automáticas de una fase posterior. `idPartidaAnula`/`numeroAnula`: en una anulación, la partida que revierte. `idPartidaAnuladaPor`/`numeroAnuladaPor`: en la original, su anulación (`a.id_partida` de `v_libro_diario`). La pantalla muestra **Borrador**, **Aplicada**, **Anulada por XXXXXX** (tiene `numeroAnuladaPor`) o **Anulación de XXXXXX** (tiene `numeroAnula`).

### `GET /api/contabilidad/partidas/{id}`
Lo mismo y además `nombreTipo`, `lineas` y `emisor` (para imprimir; los mismos datos del emisor de Configuración). 404 si no existe.
```json
{ "idPartida": 1, "numero": "110001", "fecha": "2026-11-03", "codigoTipo": "ING", "nombreTipo": "Partida de ingresos", "concepto": "Ventas del día 03/11/2026", "estado": "APLICADA",
  "totalDebe": 113.00, "totalHaber": 113.00, "idPartidaAnula": null, "idPartidaAnuladaPor": null,
  "lineas": [{ "linea": 1, "codigoCuenta": "110101", "nombreCuenta": "Caja General", "concepto": null, "debe": 113.00, "haber": 0 },
             { "linea": 2, "codigoCuenta": "61010107", "nombreCuenta": "Servicios de Salón", "concepto": "Servicios de salón sin IVA", "debe": 0, "haber": 100.00 },
             { "linea": 3, "codigoCuenta": "210702", "nombreCuenta": "IVA Por Ventas Facturas Consumidor Final", "concepto": "IVA 13 % de las ventas", "debe": 0, "haber": 13.00 }],
  "emisor": { "nombre": "Ligia Manzano", "nit": "00000000000017", "nrc": "0000017" } }
```
`concepto` de una línea es opcional (`null`); `v_libro_diario` usa entonces el de la partida.

### `POST /api/contabilidad/partidas`
Crea un **borrador** (`estado: BORRADOR`, `origen: MANUAL`, `numero: null`, `id_usuario_crea` del token). Body:
```json
{ "fecha": "2026-11-05", "codigoTipo": "PDA", "concepto": "Provisión de planilla",
  "lineas": [{ "codigoCuenta": "51010101", "concepto": "Sueldos de noviembre", "debe": 800.00, "haber": 0 }, { "codigoCuenta": "210301", "concepto": null, "debe": 0, "haber": 800.00 }] }
```
`anio` y `mes` salen de `fecha`; `linea` se numera desde 1 en el orden recibido. **Se guarda aunque no cuadre** (solo `aplicar` lo exige). Responde 201 con la partida completa. 400 con `campos` (`fecha`, `codigoTipo` —activo—, `concepto` —obligatorio, hasta 300—, `lineas` con `Línea 2: …`); 409 con el mensaje del trigger si el mes está cerrado o una cuenta no acepta movimiento.

### `PUT /api/contabilidad/partidas/{id}`
**Solo BORRADOR**: mismo body que el POST; **reemplaza las líneas** (borra las anteriores e inserta las nuevas, en la misma transacción). Responde la partida. Si está aplicada, 409 `La partida 110001 está aplicada: no se modifica (art. 139 del Código Tributario)`.

### `DELETE /api/contabilidad/partidas/{id}`
**Solo BORRADOR** (las líneas se borran en cascada). 204. Si está aplicada, 409 `La partida 110001 está aplicada: no se borra (art. 139 del Código Tributario). Anúlela con una partida inversa`.

### `POST /api/contabilidad/partidas/{id}/aplicar`
Sin body. Llama a `fn_aplicar_partida(id, idUsuario)`: pasa el borrador a APLICADA, le asigna el número y guarda quién y cuándo. Responde `{ "numero": "110001" }`. 409 con el mensaje: `La partida no cuadra: debe …, haber … (n líneas)`, `El mes 10/2026 está cerrado o no existe`, `La partida 7 no existe o ya está aplicada`.

### `POST /api/contabilidad/partidas/{id}/anular`
Body `{ "motivo": "Registrada por error", "fecha": "2026-11-13" }`. Llama a `fn_anular_partida(id, idUsuario, motivo, fecha)`: crea la partida inversa (mismas cuentas, `debe` y `haber` cambiados, mismo tipo, `origen: ANULACION`, `idPartidaAnula` = la original, `concepto` = `Anulación de la partida PDA 110001: <motivo>`), **ya aplicada** y fechada `fecha`, que debe caer en un mes abierto (puede ser distinto al de la original). La original no cambia. Responde 201 con la partida inversa completa. 409 con el mensaje de la función: `Solo se anulan partidas aplicadas; un borrador se borra`, `La partida 110001 ya es una anulación`, `La partida 110001 ya fue anulada`, `Escriba el motivo de la anulación`, `El mes 10/2026 está cerrado o no existe`. **Una partida se anula una sola vez** y una anulación no se anula (si fue un error, se registra otra partida).

Cerrar un mes (`POST /periodos/{anio}/{mes}/cerrar`) cuenta ahora las partidas en BORRADOR reales del mes: `El mes 11/2026 tiene partidas en borrador: aplíquelas o bórrelas antes de cerrarlo`.

## Contabilidad: reportes (funciones `fn_saldos_cuentas` y `fn_mayor_cuenta`, vista `v_libro_diario`, migración 1.7)

Solo lectura: **Administrador, Contador y Auditor** leen (GET); los demás roles, 403. Todo sale de las partidas **APLICADAS** (las anulaciones cuentan: están aplicadas); un borrador no cuenta. Cada respuesta trae el `emisor` (los mismos datos del emisor de Configuración) para el encabezado de las hojas impresas. Montos en dólares con 2 decimales; las fechas, `AAAA-MM-DD`. Los errores de las funciones llegan como 409 con el mensaje (`La cuenta 999 no existe`, `La fecha final es anterior a la inicial`); un parámetro que falta o no tiene forma, 400.

### `GET /api/contabilidad/reportes/saldos?anio=2026&mes=11&nivel=6`
Llama a `fn_saldos_cuentas(anio, mes, nivel)`. `nivel` va de 0 a 6 (si falta, 6) y deja las cuentas de nivel menor o igual; `mes` de 1 a 12. Una fila por cuenta, ordenada por `codigo`:
```json
{ "emisor": { "nombre": "Ligia Manzano", "nit": "00000000000017", "nrc": "0000017" },
  "filas": [{ "codigo": "110101", "nombre": "Caja General", "tipo": "ACTIVO", "naturaleza": "D", "nivel": 3, "aceptaMovimiento": true,
              "saldoInicial": 1063.00, "debe": 113.00, "haber": 0.00, "saldoFinal": 1176.00 }] }
```
Reglas (están en la función, el frontend no las repite): cada cuenta **suma sus subcuentas** (las de detalle cuyo código empieza con el suyo); el saldo va según la naturaleza (`D`: debe − haber; `A`: haber − debe); `saldoInicial` es lo anterior al mes; activo, pasivo, capital y cuentas de orden acumulan **desde el primer movimiento**; ingresos, costos y gastos y la liquidadora acumulan **solo desde el 1 de enero del año** (vuelven a cero cada ejercicio aunque no se haya hecho la partida de cierre). Un saldo negativo es un saldo contrario a su naturaleza (por ejemplo, una depreciación acumulada de naturaleza deudora).

Con este endpoint el frontend arma, **sin otro endpoint**, el Balance de comprobación (las filas tal cual; cuadra Σ `debe` = Σ `haber` de las cuentas de nivel 0), el **Balance General** (cuentas de activo, pasivo y capital con `saldoFinal`, más la línea "Utilidad (pérdida) del ejercicio" = Σ ingresos − Σ costos y gastos de nivel 0, dentro del capital; cuadra activo = pasivo + capital), el **Estado de Resultados** (ingresos, costos y gastos de enero al mes) y el **Resumen** (con `nivel=0` de cada uno de los últimos 6 meses: ingresos y costos y gastos del mes = `haber − debe` y `debe − haber` de las cuentas de nivel 0, del año = `saldoFinal`).

### `GET /api/contabilidad/reportes/mayor?cuenta=1101&desde=2026-11-01&hasta=2026-11-30`
Llama a `fn_mayor_cuenta(cuenta, desde, hasta)`. Cualquier cuenta del plan: una **agrupadora incluye todas sus subcuentas** (como el "Libro Diario Mayor" de ERP Cloud por cuenta mayor). `cuenta` obligatoria; 409 si no existe o `hasta < desde`.
```json
{ "emisor": { "nombre": "Ligia Manzano", "nit": "00000000000017", "nrc": "0000017" },
  "cuenta": { "codigo": "1101", "nombre": "EFECTIVO Y EQUIVALENTE DE EFECTIVO", "naturaleza": "D", "aceptaMovimiento": false },
  "filas": [{ "fila": 0, "fecha": null, "idPartida": null, "numero": null, "codigoTipo": null, "codigoCuenta": null, "concepto": "Saldo anterior", "debe": null, "haber": null, "saldo": 10215.00 },
            { "fila": 1, "fecha": "2026-11-03", "idPartida": 1, "numero": "110001", "codigoTipo": "ING", "codigoCuenta": "110101", "concepto": "Ventas del día 03/11/2026", "debe": 113.00, "haber": 0.00, "saldo": 10328.00 }] }
```
**La fila 0 es el saldo anterior** (en las cuentas de resultado cuenta solo desde el 1 de enero del año de `desde`); las demás van por fecha, tipo, número y línea con el **saldo corrido** en la naturaleza de la cuenta pedida. `concepto` es el de la línea o, si no tiene, el de la partida. El formato "Por día" lo arma el frontend agrupando por `fecha`.

### `GET /api/contabilidad/reportes/diario?desde=2026-11-01&hasta=2026-11-30&tipo=ING`
Filas de `v_libro_diario` entre las fechas, **agrupadas por partida** y ordenadas por fecha, tipo y número. `desde` y `hasta` obligatorias; `tipo` opcional (código de tipo de partida; vacío = todos).
```json
{ "emisor": { "nombre": "Ligia Manzano", "nit": "00000000000017", "nrc": "0000017" },
  "partidas": [{ "idPartida": 1, "numero": "110001", "fecha": "2026-11-03", "codigoTipo": "ING", "tipo": "Partida de ingresos", "concepto": "Ventas del día 03/11/2026",
                 "lineas": [{ "linea": 1, "codigoCuenta": "110101", "nombreCuenta": "Caja General", "concepto": "Ventas del día 03/11/2026", "debe": 113.00, "haber": 0.00 }],
                 "totalDebe": 113.00, "totalHaber": 113.00 }],
  "totalDebe": 113.00, "totalHaber": 113.00 }
```
`totalDebe` y `totalHaber` de la respuesta son los del rango y deben ser iguales. En la pantalla y en Excel el debe se llama **Cargo** y el haber **Abono**.

El Libro diario y el Libro mayor son libros legales (art. 139 del Código Tributario): se imprimen foliados y con la firma del contador; el frontend recuerda el folio y el contador en el navegador. Las firmas de los estados financieros (Representante legal, Contador y Auditor) están por confirmar con el Código de Comercio.

## Configuración (`tb_emisores`, `tb_parametros`, `tb_horarios`, `tb_formas_pago`, `tb_usuarios`)

Todo `/api/configuracion/*` y `/api/usuarios/*` es **solo para el rol Administrador** (403 para los demás). Cada cambio va a la bitácora con el usuario del token.

`ultimoCambio` (en Negocio y en Reglas) sale de la bitácora: `{ "fechaHora": "2026-12-02T09:15:00-06:00", "nombreUsuario": "Ligia Manzano" }`, o `null` si nunca se cambió.

### `GET /api/configuracion/negocio`

La fila de `tb_emisores` (el salón como emisor de las facturas) y el estado de la conexión con Hacienda.

```json
{
  "nombreComercial": "Ligia Manzano Salón", "nombre": "Ligia Manzano", "nit": "00000000000017", "nrc": "0000017",
  "codActividad": "96020", "tipoEstablecimiento": "02", "idDistrito": 1, "complemento": "Calle Ficticia 200, San Salvador",
  "telefono": "7000-0140", "correo": "salon@ligiamanzano.example", "codEstable": "M001", "codPuntoVenta": "P001",
  "ambiente": "00", "certificadoVence": "2028-03-14",
  "ultimoEnvio": { "fechaHora": "2026-12-12T14:04:00-06:00", "estado": "PROCESADO", "numeroControl": "DTE-01-M001P001-000000000000412" },
  "ultimoCambio": { "fechaHora": "2026-12-02T09:15:00-06:00", "nombreUsuario": "Ligia Manzano" }
}
```

- `ambiente` (`00` pruebas, `01` producción) y `certificadoVence` **no se editan aquí**: los pone el equipo en el servidor junto con la contraseña de Hacienda y la llave del certificado (variables de entorno, nunca en la base ni en esta pantalla).
- `ultimoEnvio`: el DTE más reciente transmitido (`null` si todavía no hay).

### `PUT /api/configuracion/negocio`

Los mismos campos menos `ambiente`, `certificadoVence`, `ultimoEnvio` y `ultimoCambio`. Responde 200 con el `GET`.

| Campo | Regla |
|---|---|
| `nombreComercial` | hasta 150 (opcional en Hacienda; en la factura sale si está) |
| `nombre` | obligatorio, hasta 250: el nombre o razón social que tiene el NIT |
| `nit` | 14 dígitos (o 9 si es DUI homologado), sin guiones |
| `nrc` | 2 a 8 dígitos, sin guion |
| `codActividad` | obligatorio, de CAT-019 |
| `tipoEstablecimiento` | CAT-009: `01` sucursal, `02` casa matriz, `04` bodega, `07` predio o patio, `20` otro |
| `idDistrito` | obligatorio, de CAT-008 |
| `complemento` | obligatorio, hasta 200 (la dirección sin el distrito) |
| `telefono` | obligatorio, hasta 30. `correo` obligatorio, hasta 100 |
| `codEstable` | `M001`: una letra `M`, `B`, `S` o `P` y 3 dígitos. Va en el número de control |
| `codPuntoVenta` | `P001`: `P` y 3 dígitos |

Cambiar `nit`, `nrc` o `codEstable` solo afecta las facturas nuevas; las emitidas no se tocan.

### `GET /api/configuracion/reglas` y `PUT /api/configuracion/reglas`

Lo que el salón decide y cambia sin tocar el código. Se guarda **todo junto** en una transacción (una entrada de bitácora).

```json
{
  "horarios": [ { "diaSemana": 1, "abierto": true, "horaAbre": "08:00", "horaCierra": "18:00" }, { "diaSemana": 7, "abierto": false, "horaAbre": null, "horaCierra": null } ],
  "comisionServicioPct": 10, "comisionProducto": 2.00,
  "isssEmpleadoPct": 3, "isssTopeMensual": 1000.00, "afpEmpleadoPct": 7.25,
  "formasPago": [ { "idFormaPago": 1, "nombre": "Efectivo", "pideReferencia": false, "activo": true } ],
  "ultimoCambio": null
}
```

- Los números salen de `tb_parametros` (`COMISION_SERVICIO_PCT`, `COMISION_PRODUCTO`, `ISSS_EMPLEADO_PCT`, `ISSS_TOPE_MENSUAL`, `AFP_EMPLEADO_PCT`), convertidos a número. `IVA_PCT` no se cambia desde aquí.
- El `PUT` manda `horarios` (los 7 días), los 5 números y `formasPago` solo con `{ idFormaPago, activo }`.

| Campo | Regla |
|---|---|
| `horarios` | los 7 días; si `abierto`, `horaCierra > horaAbre`; al menos un día abierto |
| `comisionServicioPct`, `isssEmpleadoPct`, `afpEmpleadoPct` | de 0 a 100, hasta 2 decimales |
| `comisionProducto`, `isssTopeMensual` | ≥ 0, 2 decimales |
| `formasPago` | al menos una activa; **Efectivo** no se desactiva (abre y cierra la caja) |

- Las comisiones nuevas aplican desde la siguiente venta; lo ya cobrado no se recalcula. Cambiar `comisionProducto` no cambia la comisión de los productos que ya existen (cada uno tiene la suya).
- 409 `HORARIO_FUERA` si el horario nuevo deja fuera el turno de una empleada activa (`tb_horarios_empleado`): `{ "mensaje": "Karla Méndez trabaja el sábado hasta las 4:00 p. m. Cambie primero su horario.", "codigo": "HORARIO_FUERA" }`.

### `GET /api/usuarios`

```json
[
  { "idUsuario": 1, "nombreUsuario": "ligia.manzano", "nombreCompleto": "Ligia Manzano", "rol": "ADMINISTRADOR", "activo": true,
    "debeCambiarContrasena": false, "ultimoAcceso": "2026-12-12T07:43:00-06:00", "idEmpleado": 5 }
]
```

- `rol`: `ADMINISTRADOR` · `RECEPCIONISTA` · `CONTADOR` · `AUDITOR` (los 4 de `tb_roles`). `idEmpleado`: el empleado ligado (`tb_empleados.id_usuario`) o `null`.

### `POST /api/usuarios`

`{ "nombreUsuario": "paola.gomez", "nombreCompleto": "Paola Gómez", "rol": "RECEPCIONISTA", "idEmpleado": null }`

- `nombreUsuario`: obligatorio, 3 a 50, solo minúsculas, números, punto, guion y guion bajo; **único** (409 `USUARIO_DUPLICADO` con `campos.nombreUsuario`). No se cambia después.
- `nombreCompleto`: obligatorio, hasta 150. `idEmpleado`: opcional; un empleado activo que no tenga usuario.
- La API genera una **contraseña temporal** al azar (al menos `CONTRASENA_MINIMA` caracteres), guarda solo su hash y pone `debe_cambiar_contrasena = true`.
- 201: `{ "usuario": { …como en GET… }, "contrasenaTemporal": "k7Rm-2pQx-9Lwd" }`. **Es la única vez que la API devuelve la contraseña**; la administradora se la entrega a la persona en persona.

### `PUT /api/usuarios/{id}`

`{ "nombreCompleto": "Paola Gómez", "rol": "RECEPCIONISTA", "idEmpleado": null }` → 200 con el usuario.

- Si cambia el rol, se cierran sus sesiones (`tb_sesiones`, motivo `ADMIN`): vuelve a entrar con el rol nuevo.
- 400 si la administradora se quita a sí misma el rol de Administrador, o si deja al sistema sin ningún administrador activo.

### `POST /api/usuarios/{id}/restablecer-contrasena`

Sin cuerpo → 200 `{ "contrasenaTemporal": "…" }`. Pone `debe_cambiar_contrasena = true`, limpia `intentos_fallidos` y `bloqueado_hasta` (también sirve para desbloquear) y cierra sus sesiones (motivo `ADMIN`).

### `PATCH /api/usuarios/{id}/activo`

`{ "activo": false }` → 200 con el usuario. Desactivar cierra sus sesiones (motivo `DESACTIVADO`) y ya no puede entrar; no se borra (su nombre queda en la bitácora, ventas y compras). 400 si es el propio usuario o el último administrador activo.

## Bitácora (`tb_bitacora`)

Solo lectura: no hay endpoints para crear, editar ni borrar. Cada registro lo escribe el backend en la misma transacción de la acción (venta, ajuste, cambio de configuración…), con el usuario del token, o `id_usuario` nulo si lo hizo el sistema (respuesta de Hacienda, contingencia…). `salon_app` no tiene `update` ni `delete` sobre la tabla.

Quién la ve: por ahora **Administrador y Auditor** (borrador de la matriz de roles); 403 para los demás.

### `GET /api/bitacora?fecha=2026-12-12&modulo=&idUsuario=&buscar=&pagina=0&tamano=100`

- `fecha`: obligatoria, un día (hora de El Salvador). `modulo` (opcional): uno de la tabla de abajo. `idUsuario` (opcional): un usuario, o `sistema` para los registros sin usuario.
- `buscar` (opcional): en `descripcion` y `entidad_id`, sin importar tildes ni mayúsculas ("0406", "Carmen", "C-0158").
- Orden: el más reciente primero (`fecha_hora`, `id_bitacora`). Paginación como en Reglas generales (aquí `tamano` 100).

```json
{
  "contenido": [
    { "idBitacora": 9120, "fechaHora": "2026-12-12T13:15:00-06:00", "idUsuario": 1, "nombreUsuario": "Ligia Manzano",
      "modulo": "ANULACIONES", "accion": "ANULAR", "entidad": "DTE", "entidadId": "DTE-01-M001P001-000000000000406",
      "descripcion": "Anuló la factura DTE-01-…0406 de Lucía Pérez, $75.00" }
  ],
  "totalElementos": 10,
  "conteos": { "todo": 10, "VENTAS": 2, "ANULACIONES": 1, "HACIENDA": 2, "CLIENTES": 1, "SEGURIDAD": 1, "SESION": 1, "CAJA": 1, "AGENDA": 1 },
  "personas": [ { "idUsuario": 1, "nombreCompleto": "Ligia Manzano" } ]
}
```

- `conteos`: por módulo **del día**, con `buscar` e `idUsuario` aplicados pero sin `modulo`; solo los módulos que tienen registros. `personas`: quienes tienen registros ese día (para el filtro). `nombreUsuario` es `null` si lo hizo el sistema.
- `descripcion` la arma el backend al guardar, en pasado y con los datos que identifican (cliente, número, monto): es lo que se lee en la lista.

| `modulo` | Ejemplos de `accion` |
|---|---|
| `SESION` | `ENTRAR`, `SALIR`, `CAMBIAR_CONTRASENA` |
| `SEGURIDAD` | `CONTRASENA_INCORRECTA`, `CUENTA_BLOQUEADA` |
| `VENTAS` · `ANULACIONES` · `HACIENDA` · `CAJA` | `COBRAR` · `ANULAR`, `NOTA_CREDITO` · `ACEPTADO`, `RECHAZADO`, `CONTINGENCIA` · `ABRIR`, `CERRAR` |
| `AGENDA` · `CLIENTES` · `SERVICIOS` · `EMPLEADOS` | `CREAR`, `EDITAR`, `MOVER`, `CANCELAR`, `DAR_DE_BAJA` |
| `INVENTARIO` · `COMPRAS` | `CREAR`, `EDITAR`, `AJUSTAR`, `REGISTRAR` |
| `PLANILLA` · `CONFIGURACION` · `USUARIOS` | `CERRAR_QUINCENA`, `EDITAR`, `CREAR`, `RESTABLECER_CONTRASENA`, `DESACTIVAR` |

### `GET /api/bitacora/{id}`

El registro completo: lo de la lista más `datosAntes`, `datosDespues` (JSON de las columnas que cambiaron, en camelCase; `null` si la acción no cambia datos) y `equipo` ("Chrome en Windows", del `User-Agent`).

```json
{ "…": "…", "datosAntes": { "estado": "ACEPTADA" }, "datosDespues": { "estado": "ANULADA", "motivo": "La clienta no quedó conforme con el tono." }, "equipo": "Chrome en Windows" }
```

- Nunca se guardan contraseñas, tokens ni la llave del certificado en `datos_antes` / `datos_despues`.
- Exportar el día: el frontend pide todas las páginas y arma el Excel (.xlsx) él mismo (`js/utils/xlsx.js`); no hay endpoint aparte.

## Catálogos de Hacienda

- `GET /api/catalogos/actividades` → `[{ "codActividad": "96020", "descripcion": "Peluquería y otros tratamientos de belleza" }]` (CAT-019 completo).
- `GET /api/catalogos/distritos` → `[{ "idDistrito": 1, "distrito": "San Salvador", "municipio": "San Salvador Centro", "departamento": "San Salvador" }]` (CAT-008 unido a municipios y departamentos).
- `GET /api/catalogos/unidades-medida` → `[{ "codUnidadMedida": 59, "nombre": "Unidad" }]` (CAT-014). Para productos; los servicios usan siempre 99.

## Siguientes endpoints

Se agregan aquí a medida que se programan las pantallas (agenda, punto de venta…). Para cada uno: método, ruta, cuerpo, respuesta y errores.
