/** All user-facing copy (Spanish, es-DO). Keep strings here, not inline in components. */
export const messages = {
  app: {
    name: 'Heriberto',
    title: 'Heriberto Santana · Higüey',
    description: 'Plataforma de organización de la campaña de Heriberto Santana en Higüey.',
    logoAlt: 'Heriberto Santana · Higüey',
  },
  nav: {
    home: 'Inicio',
    main: 'Navegación principal',
    openMenu: 'Abrir menú',
    menuTitle: 'Menú',
  },
  shell: {
    userMenu: 'Menú de usuario',
    profile: 'Mi perfil',
    // Placeholder until sessions exist (plan 3.4 replaces it with the logged-in user).
    guestName: 'Usuario',
  },
  auth: {
    loginTitle: 'Iniciar sesión',
    loginSubtitle: 'Plataforma de organización de la campaña',
    loginComingSoon: 'El acceso con cédula y contraseña estará disponible próximamente.',
  },
  home: {
    title: 'Inicio',
    welcome: 'Bienvenido(a) a la plataforma de la campaña.',
    status: {
      title: 'Estado del sistema',
      checking: 'Verificando la conexión…',
      ok: 'Conectado al servidor.',
      degraded:
        'El servidor responde, pero la base de datos o el almacenamiento de archivos no está disponible.',
      offline: 'No hay conexión con el servidor.',
    },
  },
  errors: {
    generic: 'Ocurrió un error inesperado. Intente nuevamente.',
    retry: 'Reintentar',
    notFoundTitle: 'Página no encontrada',
    notFoundBody: 'La página que busca no existe o fue movida.',
    backHome: 'Volver al inicio',
  },
} as const;
