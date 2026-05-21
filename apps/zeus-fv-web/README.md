# Zeus FV — Web App

Aplicación web interna de Zeus Energía / Optimus Grupo para diseño y dimensionado de instalaciones fotovoltaicas. Ver `../../docs/ARQUITECTURA.md` para la visión completa.

## Estado actual: MVP funcional (M0+M1+M2+M3)

Flujo end-to-end operativo:

1. El comercial busca una dirección o hace **click sobre la cubierta**.
2. La app consulta **Catastro** (OVCCoordenadas → ref. catastral, INSPIRE WFS → polígono y superficie).
3. Computa el **empaquetado de paneles** sobre el polígono útil:
   - reproyecta a UTM ETRS89,
   - aplica buffer de seguridad,
   - separación entre filas según altura solar del solsticio de invierno,
   - rota el grid al azimut elegido,
   - filtra paneles cuyos 4 vértices estén dentro del polígono.
4. Llama a **PVGIS v5.3** con la potencia pico resultante y muestra
   producción anual y específica.
5. Cambiar modelo de panel, tilt, azimut o margen recalcula en vivo
   (debounce 300 ms).

Validado end-to-end con el ejemplo Barceló Montecastillo (ref `5163125QA6656S`, parcela 22.848 m², densidad 153 Wp/m² — dentro del rango típico 100-180).

## Siguientes hitos

| Hito | Contenido |
|------|-----------|
| M4   | Persistencia de proyectos en Supabase, edición de polígono y zonas de exclusión |
| M5   | Generador de oferta/infografía PDF en formato Zeus |
| M6   | Parser de factura de luz |
| M7   | Fase 1: Comunidad Energética + límite 130 kW catastral |
| M9   | Integración SolarEdge Monitoring (post-venta) |

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
│   ├── layout.tsx                       # raíz Next.js
│   ├── page.tsx                         # pantalla principal
│   ├── globals.css
│   └── api/
│       ├── catastro/by-point/route.ts   # GET ?lat&lon → parcela completa
│       ├── catastro/by-ref/route.ts     # GET ?ref → parcela por refcat
│       ├── pvgis/route.ts               # GET ?lat&lon&kwp&tilt&azimuth
│       └── debug-layout/route.ts        # validación interna del pipeline
├── components/
│   ├── MapWorkspace.tsx                 # MapLibre + render parcela y paneles
│   ├── AddressSearch.tsx                # autocompletado Nominatim
│   └── ProjectPanel.tsx                 # panel lateral reactivo
└── lib/
    ├── geocoding.ts                     # cliente Nominatim
    ├── supabase.ts                      # cliente Supabase browser
    ├── catastro.ts                      # OVCCoordenadas + INSPIRE WFS + GML parser
    ├── pvgis.ts                         # cliente PVGIS v5.3 con Zod
    ├── panelLayout.ts                   # empaquetado UTM + reproyección
    ├── pipeline.ts                      # orquestación cliente del flujo
    └── store.ts                         # state share con useSyncExternalStore
```

## Notas

- Las llamadas a Catastro y PVGIS pasan por Route Handlers para añadir
  User-Agent (Catastro lo exige), evitar CORS y permitir caché.
- `tsconfig.json` activa `strict`. `npm run typecheck` valida el árbol completo.
- El polígono catastral devuelto cubre la parcela íntegra (incluye edificios,
  patios, jardines). M4 permitirá recortar manualmente la zona útil.
