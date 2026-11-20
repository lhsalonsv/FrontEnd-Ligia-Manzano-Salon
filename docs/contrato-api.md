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
- 401: `{ "mensaje": "Usuario o contraseña incorrectos", "intentosRestantes": 2 }`
- 423: `{ "mensaje": "La cuenta se bloqueó por 15 minutos.", "minutosBloqueo": 15 }`. Se bloquea tras 3 intentos fallidos (`tb_usuarios.intentos_fallidos`, `bloqueado_hasta`).
- El token dura lo mismo que la inactividad permitida (30 minutos) o más; el frontend cierra la sesión a los 30 minutos sin uso.

## Siguientes endpoints

Se agregan aquí a medida que se programan las pantallas (clientes, servicios, agenda…). Para cada uno: método, ruta, cuerpo, respuesta y errores.
