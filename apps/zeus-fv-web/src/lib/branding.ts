/**
 * Identidad visual de Zeus Energía / Optimus Grupo.
 *
 * Mientras no llegue el manual de marca oficial (TODO §10.4 del documento
 * de arquitectura), usamos placeholders coherentes con la app: tonos de
 * azul oscuro + verde tipo "zeus-green".
 *
 * Para personalizar:
 *   1. Colocar logo en `public/branding/logo.png` (PNG con fondo
 *      transparente, 512x512 recomendado). Activar con `NEXT_PUBLIC_BRAND_LOGO=1`.
 *      React-PDF soporta PNG/JPEG fiables; SVG da problemas.
 *   2. Ajustar la paleta `BRAND.colors` con los HEX corporativos cuando
 *      los entregue marketing.
 *   3. Si se entrega `companyName`/`tagline` distintos, sobreescribir aquí.
 */

export const BRAND = {
  companyName: "Zeus Energía",
  tagline: "Powered by Optimus Grupo",
  // TODO: sustituir por los HEX oficiales cuando los entregue marketing.
  colors: {
    bg: "#0b1220",
    panel: "#0f172a",
    accent: "#22c55e", // verde Zeus (placeholder)
    accentDim: "#16a34a",
    textLight: "#f1f5f9",
    textDim: "#94a3b8",
    border: "#1e293b",
  },
  // URL pública del logo. Se renderiza sólo si NEXT_PUBLIC_BRAND_LOGO=1.
  logoUrl: "/branding/logo.png",
} as const;

export function hasBrandLogo(): boolean {
  return process.env.NEXT_PUBLIC_BRAND_LOGO === "1";
}
