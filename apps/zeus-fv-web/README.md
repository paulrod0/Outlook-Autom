# Zeus FV — Web App

Aplicación web interna de Zeus Energía / Optimus Grupo para diseño y dimensionado de instalaciones fotovoltaicas. Ver `../../docs/ARQUITECTURA.md` para la visión completa.

## Estado actual: M0 — Scaffold

Lo que funciona hoy:

- Scaffold de Next.js 15 (App Router) + TypeScript + Tailwind.
- Mapa satélite a pantalla completa con MapLibre GL + Esri World Imagery.
- Buscador de direcciones (Nominatim, restringido a España).
- Cliente de Supabase listo (faltan credenciales).
- Stubs tipados para PVGIS, Catastro y algoritmo de empaquetado, listos para los siguientes hitos.

## Siguientes hitos

| Hito | Contenido |
|------|-----------|
| M1   | Integración Catastro (polígono de parcela a partir de ref. o click) |
| M2   | Algoritmo de empaquetado + render de paneles |
| M3   | PVGIS + caché en Supabase |
| M4   | Persistencia de proyectos y edición de polígono |

## Cómo arrancar en local

```bash
cd apps/zeus-fv-web
cp .env.example .env.local   # rellenar cuando exista proyecto Supabase
npm install
npm run dev
```

La app queda en http://localhost:3000.

## Estructura

```
src/
├── app/
│   ├── layout.tsx        # raíz Next.js
│   ├── page.tsx          # pantalla principal
│   └── globals.css
├── components/
│   ├── MapWorkspace.tsx  # mapa MapLibre + Esri satélite
│   ├── AddressSearch.tsx # autocompletado Nominatim
│   └── ProjectPanel.tsx  # panel lateral derecho
└── lib/
    ├── geocoding.ts      # cliente Nominatim
    ├── supabase.ts       # cliente Supabase browser
    ├── pvgis.ts          # cliente PVGIS v5.3 (listo para M3)
    ├── catastro.ts       # cliente Catastro (stub, M1)
    └── panelLayout.ts    # algoritmo de empaquetado (stub, M2)
```

## Notas

- En M1 las llamadas a Catastro y la geocodificación se moverán a Route Handlers para añadir caché y rate-limit.
- `tsconfig.json` activa `strict`. `npm run typecheck` valida el árbol completo.
