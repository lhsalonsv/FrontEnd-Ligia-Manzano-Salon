/**
 * Datos de prueba del login. Solo se usan con DATOS_PRUEBA.auth = true (js/config.js).
 * Son ficticios: la contraseña de prueba está en README.md, no es de nadie.
 * La forma de cada objeto es la del DTO acordado en docs/contrato-api.md.
 */
export const USUARIOS_PRUEBA = [
  { idUsuario: 1, nombreUsuario: 'ligia.manzano', nombreCompleto: 'Ligia Manzano', rol: 'ADMINISTRADOR', contrasena: 'demo1234' },
  { idUsuario: 2, nombreUsuario: 'recepcion',     nombreCompleto: 'Andrea López',  rol: 'RECEPCIONISTA', contrasena: 'demo1234' },
  { idUsuario: 3, nombreUsuario: 'contador',      nombreCompleto: 'Mario Pérez',   rol: 'CONTADOR',      contrasena: 'demo1234' },
  { idUsuario: 4, nombreUsuario: 'auditor',       nombreCompleto: 'Sara Ramos',    rol: 'AUDITOR',       contrasena: 'demo1234' },
];

/** Intentos antes de bloquear la cuenta (el bloqueo real lo hace el backend; DISENO.md: al quinto fallo). */
export const INTENTOS_MAXIMOS = 5;
