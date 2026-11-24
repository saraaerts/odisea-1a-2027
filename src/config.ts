// Datos del juego clásico. En los controles, b = botón, t = interruptor y d = dial 0–3.
// Las listas de etapas usan números del 1 al 8. Si no hay lista, el control aparece siempre.
export const CONFIG = {
  naves: 40,
  permanenciaBase: 34,
  mejoraObjetivo: 9,
  areas: [
    { id: "tut", nombre: "Tutores", hace: "Acompañamiento académico en la cursada y los finales",
      controles: [
        ["b", "Invitación a clase", [1, 2, 3, 4, 5, 6]],
        ["t", "Clase de consulta"],
        ["d", "Nivel de seguimiento"],
        ["b", "Recordatorio de API", [2, 3, 4, 5, 6]],
        ["b", "Anuncio motivacional"],
        ["b", "Repaso para finales", [6, 7, 8]],
      ] },
    { id: "coa", nombre: "Coaches", hace: "Motivación, onboarding y hábitos de estudio",
      controles: [
        ["b", "Llamada motivacional"],
        ["t", "Onboarding", [1, 2, 3]],
        ["t", "Campaña de WhatsApp"],
        ["b", "Plan de estudio", [1, 2, 3, 4, 5]],
        ["t", "Alerta de seguro de adaptación", [2, 3, 4, 5, 6]],
        ["b", "Festejo de logros", [3, 4, 5, 6, 7, 8]],
      ] },
    { id: "azu", nombre: "Azu", hace: "La plataforma Canvas",
      controles: [
        ["b", "Cargar materias en Canvas", [1, 8]],
        ["t", "Módulos publicados", [1, 2, 3, 4, 5, 6]],
        ["b", "Cambio de agendas"],
        ["b", "Restaurar contraseña"],
        ["t", "Bancos de preguntas sincronizados", [2, 3, 4, 5, 6, 7]],
        ["b", "Cerrar ticket"],
      ] },
    { id: "sec", nombre: "Secretaría", hace: "Validaciones, trámites de título y otros servicios",
      controles: [
        ["b", "Validar DNI", [1, 2, 3, 4]],
        ["b", "Validar título secundario", [1, 2, 3, 4, 5]],
        ["b", "Validar Talento Tech", [1, 2, 3, 4, 5]],
        ["b", "Trámite de título intermedio", [4, 5, 6, 7, 8]],
        ["b", "Trámite de título", [5, 6, 7, 8]],
        ["b", "Otros servicios"],
      ] },
    { id: "ef", nombre: "Exámenes finales", hace: "Proctoring de los exámenes",
      controles: [
        ["b", "Activar proctoring"],
        ["b", "Problema con cámara web"],
        ["d", "Turno de mesa"],
        ["b", "Validar identidad"],
        ["t", "Habilitar mesas", [5, 6, 7, 8]],
        ["b", "Campaña para inscripciones a final", [5, 6, 7, 8]],
      ] },
    { id: "ri", nombre: "RI", hace: "Reinscripción y pagos",
      controles: [
        ["t", "Reinscripciones activas", [1, 7, 8]],
        ["t", "Suscripción"],
        ["d", "Fase de descuento", [5, 6, 7, 8]],
        ["b", "Métodos de pago"],
        ["b", "Pedido de excepción"],
      ] },
    { id: "pp", nombre: "PP", hace: "Prácticas profesionalizantes, en paralelo al bimestre",
      controles: [
        ["b", "Convenios", [1, 2, 3, 4]],
        ["d", "Selección de modalidad", [1, 2, 3]],
        ["b", "Validar firmas"],
        ["t", "Activar PEL"],
        ["b", "Validar informes finales", [5, 6, 7, 8]],
      ] },
    { id: "tra", nombre: "Training", hace: "Capacitación y acompañamiento de los expertos",
      controles: [
        ["b", "Capacitar expertos", [1, 2, 3, 4]],
        ["t", "Revisión de grabaciones"],
        ["d", "Nivel de acompañamiento"],
        ["b", "Contacto con expertos"],
        ["t", "Aula virtual", [1, 2, 3, 4, 5]],
        ["b", "Revisión de votaciones", [5, 6, 7, 8]],
      ] },
  ],
  etapas: [
    { nombre: "Despegue", texto: "Arranca el bimestre: primer ingreso al campus, materias nuevas, convenios y firmas de prácticas, y muchas dudas.", foco: ["azu", "tut", "coa", "pp"], scene: "station" },
    { nombre: "Cinturón de las autoevaluaciones", texto: "Las primeras autoevaluaciones, de las materias y de las prácticas, ponen a prueba el rumbo.", foco: ["tut", "coa", "azu", "pp"], scene: "belt" },
    { nombre: "Agujero negro de las API", texto: "Las entregas de API tienen fecha y una gravedad enorme: se tragan a los que vienen atrasados.", foco: ["tut", "coa", "azu"], scene: "hole" },
    { nombre: "Tormenta de trámites", texto: "Validaciones, documentación y trámites de título se acumulan en la ruta.", foco: ["sec", "coa", "tut"], scene: "storm" },
    { nombre: "Campo de asteroides", texto: "Trabajo, familia, cansancio y temas económicos chocan contra la cursada.", foco: ["coa", "ri", "tut"], scene: "rocks" },
    { nombre: "Nebulosa de los informes", texto: "Las prácticas profesionalizantes, que corren a la par del bimestre, piden la entrega de informes.", foco: ["pp", "tut"], scene: "nebula" },
    { nombre: "Órbita de los finales", texto: "Mesas de examen con proctoring a la vista.", foco: ["ef", "tut"], scene: "ringed" },
    { nombre: "Estación de reinscripción", texto: "Cierre del bimestre: para seguir viaje hay que reinscribirse y tener los pagos al día.", foco: ["ri", "sec"], scene: "gate" },
  ],
} as const;

export type AreaId = (typeof CONFIG.areas)[number]["id"];
export type SceneId = (typeof CONFIG.etapas)[number]["scene"];
export type ControlKind = "b" | "t" | "d";

export const AVATAR_OPTIONS = {
  pelo: ["Corto", "Flequillo", "Largo", "Rulos", "Rodete", "Rapado", "Afro", "Coleta", "Melena", "Cresta"],
  colorPelo: ["#1E1A18", "#5A3A22", "#A0662E", "#E4C27A", "#B5482E", "#9AA3AE", "#49E3E7", "#FF7FB0", "#8E6CF0"],
  piel: ["#F5D7C0", "#E8B896", "#C98E66", "#A0673F", "#6E4529"],
  cara: ["Sonrisa", "Risa", "Tranqui", "Guiño", "Sorpresa", "Pícara", "Concentrada"],
  detalle: ["Nada", "Pecas", "Bigote", "Barba", "Barba corta", "Lunar", "Curita"],
  ropa: ["Remera", "Buzo", "Camisa", "Remera Teclab", "Campera", "Traje espacial"],
  colorRopa: ["#0056F3", "#49E3E7", "#79FFBA", "#062149", "#F2B33D", "#E4572E", "#FF7FB0", "#8E6CF0", "#FFFFFF", "#1E1A18"],
  gorro: ["Sin gorro", "Vincha", "Gorra", "Gorro de lana", "Boina", "Galera", "Casco espacial", "Corona"],
  colorGorro: ["#0056F3", "#49E3E7", "#79FFBA", "#062149", "#F2B33D", "#E4572E", "#FF7FB0", "#8E6CF0", "#FFFFFF", "#1E1A18"],
  acc: ["Nada", "Aros", "Auriculares", "Moño", "Bufanda", "Medalla Teclab", "Antenas", "Estrella de comando"],
  colorAcc: ["#0056F3", "#49E3E7", "#79FFBA", "#062149", "#F2B33D", "#E4572E", "#FF7FB0", "#8E6CF0", "#FFFFFF", "#1E1A18"],
  lentes: ["Sin lentes", "Redondos", "Rectangulares", "Grandes", "Ojo de gato", "Media montura", "Aviador", "Hexagonales", "De lectura", "De sol", "Visor espacial"],
  colorLentes: ["#1E1A18", "#7A4A2A", "#9AA3AE", "#D4A94A", "#0056F3", "#E4572E", "#FF7FB0", "#79FFBA", "#8E6CF0", "#FFFFFF"],
} as const;

export const AVATAR_COLOR_NAMES = {
  colorPelo: ["Negro", "Castaño", "Castaño claro", "Rubio", "Colorado", "Canoso", "Cian", "Rosa", "Violeta"],
  piel: ["Muy clara", "Clara", "Media", "Morena", "Oscura"],
  colorRopa: ["Azul Teclab", "Cian", "Menta", "Azul marino", "Amarillo", "Naranja", "Rosa", "Violeta", "Blanco", "Negro"],
  colorGorro: ["Azul Teclab", "Cian", "Menta", "Azul marino", "Amarillo", "Naranja", "Rosa", "Violeta", "Blanco", "Negro"],
  colorAcc: ["Azul Teclab", "Cian", "Menta", "Azul marino", "Amarillo", "Naranja", "Rosa", "Violeta", "Blanco", "Negro"],
  colorLentes: ["Negro", "Carey", "Plateado", "Dorado", "Azul", "Naranja", "Rosa", "Menta", "Violeta", "Blanco"],
} as const;

export const AVATAR_PRICES = {
  ropa: [0, 0, 0, 0, 0, 80],
  gorro: [0, 0, 50, 50, 80, 120, 150, 300],
  acc: [0, 30, 50, 40, 60, 100, 150, 200],
  lentes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 60],
} as const;

export const POINTS = {
  meta: 100,
  aprobado: 50,
  participar: 10,
  nave_rota: 5,
} as const;

export const AVATAR_FACE_KEYS = ["jaw", "cheek", "eyes", "brows", "nose", "lips"] as const;
export const AVATAR_COLOR_KEYS = ["skin", "hair", "suit", "hat", "accessory", "glasses"] as const;

export type AvatarFaceKey = typeof AVATAR_FACE_KEYS[number];
export type AvatarColorKey = typeof AVATAR_COLOR_KEYS[number];
export type AvatarOptionKey = keyof typeof AVATAR_OPTIONS;
export type AvatarCustom = Partial<Record<AvatarFaceKey, number> & Record<AvatarColorKey, string>>;
export type Avatar = { [Key in AvatarOptionKey]: number } & { custom?: AvatarCustom; style?: 'retro' };

export interface Control {
  id: string;
  area: AreaId;
  kind: ControlKind;
  label: string;
  etapas?: readonly number[];
}

export const CONTROLS: Readonly<Record<string, Control>> = Object.freeze(
  Object.fromEntries(CONFIG.areas.flatMap(area =>
    area.controles.map(([kind, label, etapas], index) => {
      const id = area.id + index;
      return [id, { id, area: area.id, kind, label, etapas }];
    }),
  )),
);

export const MAX_PLAYERS = 4;
export const PASS_SHIPS = Math.ceil(CONFIG.naves * (CONFIG.permanenciaBase + CONFIG.mejoraObjetivo) / 100);

export function isAreaId(value: unknown): value is AreaId {
  return CONFIG.areas.some(area => area.id === value);
}

export function areaName(id: AreaId): string {
  return CONFIG.areas.find(area => area.id === id)!.nombre;
}

export function cleanAvatarCustom(raw: unknown): AvatarCustom | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, unknown>;
  const custom: AvatarCustom = {};
  for (const key of AVATAR_FACE_KEYS) {
    const value = Object.hasOwn(data, key) ? data[key] : undefined;
    if (typeof value === "number" && Number.isInteger(value) && value >= -2 && value <= 2 && value !== 0) {
      custom[key] = value;
    }
  }
  for (const key of AVATAR_COLOR_KEYS) {
    const value = Object.hasOwn(data, key) ? data[key] : undefined;
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) custom[key] = value.toUpperCase();
  }
  return Object.keys(custom).length ? custom : undefined;
}

export function cleanAvatar(raw: unknown): Avatar {
  const entries = Object.keys(AVATAR_OPTIONS) as AvatarOptionKey[];
  const data = raw && typeof raw === "object" ? { ...raw as Partial<Avatar> } : {};

  // Migración del primer catálogo 2D, que tenía lentes como expresión.
  if (data.lentes === undefined && typeof data.cara === "number") {
    if (data.cara === 5) { data.cara = 0; data.lentes = 1; }
    else if (data.cara > 5) data.cara -= 1;
  }

  const avatar = Object.fromEntries(entries.map(key => {
    const value = data[key];
    const valid = typeof value === "number" && Number.isInteger(value) && value >= 0 &&
      value < AVATAR_OPTIONS[key].length;
    return [key, valid ? value : 0];
  })) as Record<AvatarOptionKey, number>;
  const custom = cleanAvatarCustom(data.custom);
  return {
    ...avatar,
    ...(custom ? { custom } : {}),
    ...(data.style === 'retro' ? { style: 'retro' as const } : {}),
  };
}
