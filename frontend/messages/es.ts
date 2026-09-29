const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

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
    padron: 'Consulta de padrón',
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
  padron: {
    title: 'Consulta de padrón',
    intro: 'Busque a un votante de Higüey por su cédula.',
    cedulaLabel: 'Cédula',
    cedulaPlaceholder: '000-0000000-0',
    submit: 'Consultar',
    searching: 'Consultando…',
    checkDigitWarning:
      'Verifique la cédula: el último dígito no coincide. Puede consultarla de todos modos.',
    quotaNote: 'Cada consulta queda registrada y hay un límite diario por usuario.',
    fields: {
      cedula: 'Cédula',
      age: 'Edad',
      birthday: 'Cumpleaños',
      sector: 'Sector',
      recinto: 'Recinto',
      colegio: 'Colegio',
      leader: 'Líder',
    },
    years: (age: number) => `${age} años`,
    /** "15 de junio"; `month` is 1–12. */
    birthday: (day: number, month: number) => `${day} de ${MONTHS[month - 1] ?? ''}`,
    colegio: (id: number) => `Colegio ${id}`,
    membership: {
      none: 'Aún no es miembro',
      out_of_scope: 'Ya está registrado(a) como miembro',
      member: 'Ya es miembro',
    },
  },
  levels: {
    member: 'Miembro',
    aspiring_leader: 'Aspirante a líder',
    team_leader: 'Líder de equipo',
    coordinator: 'Coordinador(a)',
  },
  errors: {
    generic: 'Ocurrió un error inesperado. Intente nuevamente.',
    retry: 'Reintentar',
    notFoundTitle: 'Página no encontrada',
    notFoundBody: 'La página que busca no existe o fue movida.',
    backHome: 'Volver al inicio',
  },
} as const;
