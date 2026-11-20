# Contrato entre el frontend y el backend

Acuerdo entre Julio (frontend) y Katherine (backend, Spring Boot). Si algo cambia, se cambia aquí primero.

## Reglas generales

- Base: `/api` (local `http://localhost:8080/api`; producción, la URL de Render).
- **JSON en camelCase**, que es lo que Jackson hace por defecto: `idCliente`, `nombreCliente`, `fechaHoraInicio`. Los nombres salen de las columnas de `modelo_completo.sql` pasadas a camelCase (`nombre_cliente` → `nombreCliente`).
- Fechas: `"2026-12-15"`; fecha y hora: ISO 8601 con zona, `"2026-12-15T16:00:00-06:00"`.
- Dinero: número con 2 decimales (`56.50`), nunca texto.
- Autenticación: cabecera `Authorization: Bearer <token>` en todo, excepto el login.
- CORS: el backend permite el dominio de Vercel y `http://localhost:5500` / `http://127.0.0.1:5500` (Live Server).

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
| 401 | Sin sesión o token vencido → el frontend vuelve al login |
| 403 | Con sesión, pero su rol no tiene permiso |
| 404 | No existe |
| 409 | Conflicto (duplicado, horario ocupado, stock insuficiente) |
| 423 | Cuenta bloqueada |

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
  "usuario": { "idUsuario": 1, "nombreUsuario": "ligia.manzano", "nombreCompleto": "Ligia Manzano", "rol": "ADMINISTRADOR" }
}
```

- `rol`: `ADMINISTRADOR`, `RECEPCIONISTA`, `CONTADOR` o `AUDITOR` (los 4 roles fijos).
- 401: `{ "mensaje": "Usuario o contraseña incorrectos", "intentosRestantes": 4 }`
- 423: `{ "mensaje": "La cuenta se bloqueó por 15 minutos.", "minutosBloqueo": 15 }`. Se bloquea al quinto intento fallido seguido (`tb_usuarios.intentos_fallidos`, `bloqueado_hasta`); un inicio de sesión correcto pone `intentos_fallidos` en 0.
- El token dura lo mismo que la inactividad permitida (30 minutos) o más; el frontend cierra la sesión a los 30 minutos sin uso.

## Clientes (`tb_clientes`)

### `GET /api/clientes?buscar=&filtro=&pagina=0&tamano=50`

- `buscar` (opcional): busca en nombre + apellido (sin importar tildes ni mayúsculas), teléfono y DUI. Desde 3 dígitos busca también en teléfono y DUI.
- `filtro`: `todos` · `este-mes` (última visita en el mes actual) · `sin-venir-60` (última visita hace más de 60 días) · `cumple-mes` (`mes_cumple` = mes actual).
- Solo clientes con `activo = true`. Orden: última visita más reciente primero.

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
  "quienes": [ { "idEmpleado": 1, "nombreCompleto": "Karla Méndez", "cargo": "Estilista", "vecesEsteMes": 5 } ]
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
    "empleados": [ { "idEmpleado": 1, "nombreCompleto": "Karla Méndez", "cargo": "Estilista" } ] } ]
```

Solo empleados activos. La usan Servicios (y después Agenda y Empleados).

## Catálogos de Hacienda

- `GET /api/catalogos/actividades` → `[{ "codActividad": "96020", "descripcion": "Peluquería y otros tratamientos de belleza" }]` (CAT-019 completo).
- `GET /api/catalogos/distritos` → `[{ "idDistrito": 1, "distrito": "San Salvador", "municipio": "San Salvador Centro", "departamento": "San Salvador" }]` (CAT-008 unido a municipios y departamentos).

## Siguientes endpoints

Se agregan aquí a medida que se programan las pantallas (servicios, agenda…). Para cada uno: método, ruta, cuerpo, respuesta y errores.
