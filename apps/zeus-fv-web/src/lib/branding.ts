/**
 * Identidad visual de Grupo Optimus — app Eficiencia.
 *
 * Paleta aproximada del manual de marca (sustituir HEX exactos cuando
 * marketing entregue el libro). Logo se carga desde public/branding/logo.png
 * si NEXT_PUBLIC_BRAND_LOGO=1; si no se usa el monograma "G".
 */

export const BRAND = {
  appName: "Eficiencia",
  companyName: "Grupo Optimus",
  tagline: "Adaptamos tu mundo a un futuro sostenible",
  website: "www.grupo-optimus.com",
  email: "info@grupo-optimus.com",
  phone: "900 525 750",

  colors: {
    cyan: "#1FBFE8",
    cyanDark: "#1290B5",
    cyanLight: "#BCE5F2",
    cyanFaded: "#E8F6FB",
    navy: "#0F2A4D",
    navyDeep: "#081A33",
    ink: "#1B2747",
    paper: "#F4FBFE",
    white: "#FFFFFF",
    mute: "#8AA0BD",
    success: "#22C38B",
    warning: "#F59E0B",
  },

  logoUrl: "/branding/logo.png",
} as const;

export function hasBrandLogo(): boolean {
  return process.env.NEXT_PUBLIC_BRAND_LOGO === "1";
}

/**
 * Catálogo de productos de la suite Eficiencia.
 * Los marcados como `available: false` se muestran como "Próximamente"
 * en el selector de la home pero no son seleccionables aún.
 */
export type ProductKey =
  | "fv"
  | "ce"
  | "ppa"
  | "telemedida"
  | "power"
  | "aerotermia"
  | "amianto"
  | "cae";

export const PRODUCTS: Record<
  ProductKey,
  {
    key: ProductKey;
    name: string;
    tagline: string;
    available: boolean;
  }
> = {
  fv: {
    key: "fv",
    name: "Fotovoltaica",
    tagline: "Diseño de instalación + oferta llave en mano",
    available: true,
  },
  ce: {
    key: "ce",
    name: "Comunidad Energética",
    tagline: "Cesión de cubierta · contratos 20/25/30 años",
    available: true,
  },
  ppa: {
    key: "ppa",
    name: "PPA",
    tagline: "Autoconsumo sin inversión · tarifa €/kWh fija",
    available: true,
  },
  telemedida: {
    key: "telemedida",
    name: "Telemedida",
    tagline: "Monitorización avanzada de consumos",
    available: false,
  },
  power: {
    key: "power",
    name: "Power",
    tagline: "Ahorro energético complementario",
    available: false,
  },
  aerotermia: {
    key: "aerotermia",
    name: "Aerotermia",
    tagline: "Climatización eficiente",
    available: false,
  },
  amianto: {
    key: "amianto",
    name: "Amianto",
    tagline: "Retirada de fibrocemento",
    available: false,
  },
  cae: {
    key: "cae",
    name: "CAE",
    tagline: "Certificados de Ahorro Energético",
    available: false,
  },
};
