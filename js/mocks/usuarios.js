/**
 * Datos de prueba del login. Solo se usan con DATOS_PRUEBA.auth = true (js/config.js).
 * Son ficticios: las contraseñas de prueba están en README.md, no son de nadie.
 * La forma de cada objeto es la del DTO acordado en docs/contrato-api.md.
 * `nueva` tiene contraseña temporal: al entrar la manda a cambiarla.
 */
export const USUARIOS_PRUEBA = [
  { idUsuario: 1, nombreUsuario: 'ligia.manzano', nombreCompleto: 'Ligia Manzano', rol: 'ADMINISTRADOR', debeCambiarContrasena: false, contrasena: 'demo1234' },
  { idUsuario: 2, nombreUsuario: 'recepcion',     nombreCompleto: 'Andrea López',  rol: 'RECEPCIONISTA', debeCambiarContrasena: false, contrasena: 'demo1234' },
  { idUsuario: 3, nombreUsuario: 'contador',      nombreCompleto: 'Mario Pérez',   rol: 'CONTADOR',      debeCambiarContrasena: false, contrasena: 'demo1234' },
  { idUsuario: 4, nombreUsuario: 'auditor',       nombreCompleto: 'Sara Ramos',    rol: 'AUDITOR',       debeCambiarContrasena: false, contrasena: 'demo1234' },
  { idUsuario: 5, nombreUsuario: 'nueva',         nombreCompleto: 'Paola Gómez',   rol: 'RECEPCIONISTA', debeCambiarContrasena: true,  contrasena: 'temporal1234' },
];

/** Intentos antes de bloquear la cuenta (el bloqueo real lo hace el backend; DISENO.md: al quinto fallo). */
export const INTENTOS_MAXIMOS = 5;
