/**
 * El login de Clerk, en castellano y con el nombre del sistema.
 *
 * Por defecto la pantalla dice *"Sign in to My Application — Welcome back!
 * Please sign in to continue"*: en inglés y con el nombre de ejemplo que trae
 * la instancia. Para un back-office que usan Franco, Martín y Ramiro, eso se
 * lee como una pantalla ajena.
 *
 * **Se traduce acá y no con `@clerk/localizations`** para no sumar una
 * dependencia por seis frases: sólo se usan estas pantallas —ingreso y
 * recuperación de clave—, no hay registro público. Si algún día hacen falta
 * los flujos completos, conviene traer el paquete y dejar esto sólo como
 * override de los textos propios.
 *
 * `applicationName` sale igual del panel de Clerk para todo lo que no esté
 * acá; lo que se ve en la pantalla de ingreso lo fija este archivo.
 */
export const CLERK_ES = {
  locale: 'es-AR',

  socialButtonsBlockButton: 'Continuar con {{provider|titleize}}',
  dividerText: 'o',
  formFieldLabel__emailAddress: 'Correo electrónico',
  formFieldLabel__password: 'Contraseña',
  formFieldInputPlaceholder__emailAddress: 'tunombre@ubicar-rent.com.ar',
  formFieldInputPlaceholder__password: 'Tu contraseña',
  formButtonPrimary: 'Ingresar',
  footerActionLink__useAnotherMethod: 'Probar de otra forma',
  backButton: 'Volver',

  signIn: {
    start: {
      title: 'Ingresá al sistema',
      subtitle: 'Gestión de flota, reservas y contratos de Ubicar Rent',
      actionText: '',
      actionLink: '',
    },
    password: {
      title: 'Ingresá tu contraseña',
      subtitle: 'Para entrar a Ubicar Rent',
      actionLink: 'Usar otro método',
    },
    forgotPasswordAlternativeMethods: {
      title: '¿Olvidaste la contraseña?',
      label__alternativeMethods: 'O ingresá de otra forma',
      blockButton__resetPassword: 'Restablecer la contraseña',
    },
    forgotPassword: {
      title: 'Restablecer la contraseña',
      subtitle_email: 'Te mandamos un código a tu correo',
      formTitle: 'Código de recuperación',
      resendButton: 'No me llegó, reenviar',
    },
    emailCode: {
      title: 'Revisá tu correo',
      subtitle: 'Te mandamos un código para entrar',
      formTitle: 'Código de verificación',
      resendButton: 'No me llegó, reenviar',
    },
    alternativeMethods: {
      title: 'Otra forma de ingresar',
      actionLink: 'Pedir ayuda',
      blockButton__emailCode: 'Mandarme un código a {{identifier}}',
      blockButton__password: 'Ingresar con contraseña',
      getHelp: {
        title: '¿Problemas para entrar?',
        content:
          'Si no podés ingresar, escribile a quien administra el sistema para que revise tu usuario.',
        blockButton__emailSupport: 'Pedir ayuda',
      },
    },
    noAvailableMethods: {
      title: 'No se puede ingresar',
      subtitle: 'Falta configurar un método de ingreso para esta cuenta.',
      message: 'Escribile a quien administra el sistema.',
    },
  },

  // El sistema **no tiene registro público**: las cuentas las crea un
  // administrador. Estos textos existen sólo para que, si alguien llega a la
  // pantalla, no lea una invitación a registrarse que no va a funcionar.
  signUp: {
    start: {
      title: 'Las cuentas las crea un administrador',
      subtitle: 'Pedile acceso a quien administra el sistema.',
      actionText: '¿Ya tenés cuenta?',
      actionLink: 'Ingresar',
    },
  },

  userButton: {
    action__signOut: 'Cerrar sesión',
    action__manageAccount: 'Mi cuenta',
  },

  unstable__errors: {
    form_identifier_not_found: 'No encontramos una cuenta con ese correo.',
    form_password_incorrect: 'La contraseña no es correcta.',
    form_param_format_invalid__email_address: 'Revisá el correo, no parece válido.',
    not_allowed_access: 'Esta cuenta no tiene acceso al sistema.',
  },
} as const;
