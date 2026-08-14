"use client";

/**
 * Compatibilidad hacia atrás: el generador de oferta FV vive ahora en
 * `offerPdfFV.tsx`. Mantenemos este re-export para no romper imports
 * antiguos (`@/lib/offerPdf` → `generateOfferBlob`).
 */

export { OfferFVDocument as OfferDocument, generateFVOfferBlob as generateOfferBlob } from "./offerPdfFV";
