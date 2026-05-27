# Zeus FV — Web App

Aplicación web interna de Zeus Energía / Optimus Grupo para diseño y dimensionado de instalaciones fotovoltaicas. Ver `../../docs/ARQUITECTURA.md` para la visión completa y `../../docs/ESTADO.md` para el último corte de estado.

## Estado actual: MVP funcional (M0 → M7) + scaffolding M9

Flujo end-to-end operativo:

1. El comercial busca una dirección o hace **click sobre la cubierta**.
2. La app consulta **Catastro** (OVCCoordenadas → ref. catastral, INSPIRE WFS → polígono y superficie + huella de edificio).
3. Computa el **empaquetado de paneles** sobre el polígono útil (auto-rotación + auto-offset).
4. Llama a **PVGIS v5.3** con la potencia pico resultante y muestra producción anual y específica.
5. Permite editar el polígono, dibujar zonas de exclusión, subir factura PDF para deducir consumo y kWp recomendado, calcular ahorro / payback, definir miembros de Comunidad Energética y generar la **oferta PDF**.

## Cómo arrancar en local

```bash
cd apps/zeus-fv-web
cp .env.example .env.local   # opcional: rellenar las variables necesarias
npm install
npm run dev
```

La app queda en http://localhost:3000.

## Persistencia (Neon)

Los proyectos se guardan en **localStorage** del navegador por defecto.
Para persistencia real (multi-equipo) usa **Neon** (Postgres serverless):

1. Crea un proyecto gratis en https://neon.tech
2. Copia la cadena de conexión (`postgresql://...?sslmode=require`)
3. Ponla en `.env.local` como `DATABASE_URL=...`
4. Reinicia `npm run dev`

Las tablas se crean automáticamente en la primera petición (`projects`, `solaredge_sites`, `solaredge_energy_daily`). Sin `DATABASE_URL`, los endpoints `/api/projects` responden 501 y el cliente cae a localStorage de forma transparente.

## Acceso interno (Auth.js)

Cuando se quiera blindar producción:

1. Genera un secreto: `openssl rand -base64 32` → `AUTH_SECRET=...`
2. Genera hashes bcrypt de cada contraseña:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('miClave', 10))"
   ```
3. Pega la lista en `.env.local`:
   ```bash
   AUTH_USERS=[{"email":"pablo@zeus.es","name":"Pablo","passwordHash":"$2b$10$..."}]
   AUTH_ENFORCE=1
   ```
4. Reinicia. Cualquier ruta exige sesión; el login está en `/login`.

Sin `AUTH_ENFORCE=1` el middleware no exige sesión (útil para demos y previews internos). En desarrollo, `AUTH_DEV_PASSWORD` permite saltarse la lista de usuarios.

## SolarEdge — post-venta (M9)

Cliente de la Monitoring API para comparar producción real vs estimada.

```bash
SOLAREDGE_API_KEY=...          # API key de cuenta del portal SolarEdge
CRON_SECRET=...                # secreto compartido con Vercel Cron
```

Endpoints:

| Endpoint | Método | Notas |
|----------|--------|-------|
| `/api/solaredge/sites?refresh=1` | GET | Lista sitios locales; con `?refresh=1` sincroniza desde SolarEdge. |
| `/api/solaredge/sites` | POST | `{seSiteId, projectId?}` — vincula un sitio a un proyecto del CRM. |
| `/api/solaredge/sync` | GET | Sincroniza energía diaria desde el último sync. Pensado para cron. |
| `/api/solaredge/kpi/{projectId}` | GET | Devuelve real anualizado vs estimado PVGIS y `kpiPct`. |

El cron diario está configurado en `vercel.json` a las 03:00 UTC. Con `CRON_SECRET` definido, sólo Vercel (o quien envíe `Authorization: Bearer ...`) puede ejecutarlo.

## Despliegue (Vercel)

`vercel.json` ya incluye:

- `framework: nextjs`
- `regions: ["fra1"]` (Madrid no existe; Frankfurt es la opción europea con menos latencia desde España)
- `crons` con la sincronización diaria de SolarEdge
- Cabeceras de seguridad (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)

Para desplegar:

```bash
npx vercel link        # primera vez: vincula el repo al proyecto
npx vercel env pull    # baja las vars desde Vercel a .env.local
npx vercel --prod      # publica a producción
```

Las variables de entorno se configuran en el dashboard de Vercel (Settings → Environment Variables). Como mínimo en producción: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_USERS`, `AUTH_ENFORCE=1`, `CRON_SECRET`, y `SOLAREDGE_API_KEY` cuando proceda.

## Branding del PDF

La oferta PDF usa la paleta y nombre comercial de `src/lib/branding.ts`.

Para incrustar el logo:

1. Coloca `public/branding/logo.png` (PNG con fondo transparente, 512×512).
2. `NEXT_PUBLIC_BRAND_LOGO=1` en `.env.local`.
3. Sin esa variable el header del PDF cae al monograma "Z" placeholder.

Cuando llegue el manual de marca oficial, ajustar los HEX y `companyName` en `BRAND` directamente.

## Tests

```bash
npm test           # vitest run
npm run test:watch
```

Cubren los heurísticos de `billParser.ts` (CUPS, tarifa, potencia contratada, periodo, total, agregación por periodo). Añadir más fixtures conforme aparezcan facturas de comercializadoras nuevas.

## Estructura

```
src/
├── app/
│   ├── layout.tsx                          # raíz Next.js
│   ├── page.tsx                            # pantalla principal
│   ├── login/page.tsx                      # login Auth.js
│   ├── globals.css
│   └── api/
│       ├── auth/[...nextauth]/route.ts     # handlers Auth.js
│       ├── catastro/by-point/route.ts      # GET ?lat&lon → parcela
│       ├── catastro/by-ref/route.ts        # GET ?ref → parcela
│       ├── catastro/building/route.ts      # GET ?ref → huella edificio
│       ├── pvgis/route.ts                  # GET ?lat&lon&kwp&tilt&azimuth
│       ├── bill/parse/route.ts             # POST PDF factura
│       ├── projects/                       # CRUD proyectos
│       └── solaredge/                      # sites / sync / kpi
├── components/
│   ├── MapWorkspace.tsx                    # MapLibre + render parcela y paneles
│   ├── AddressSearch.tsx                   # autocompletado Nominatim
│   ├── ProjectPanel.tsx                    # panel lateral reactivo
│   ├── PolygonEditor.ts                    # vértices arrastrables
│   └── HoleDrawer.ts                       # dibujo de zonas de exclusión
├── auth.ts                                 # config Auth.js v5
└── lib/
    ├── branding.ts                         # paleta + companyName del PDF
    ├── billParser.ts                       # heurísticos de facturas
    ├── billParser.test.ts                  # tests unitarios
    ├── catastro.ts                         # WFS Catastro + GML parser
    ├── community.ts                        # reparto Comunidad Energética
    ├── db.ts                               # cliente Neon + ensureSchema
    ├── economics.ts                        # coste / ahorro / payback
    ├── geocoding.ts                        # Nominatim
    ├── offerPdf.tsx                        # PDF de oferta react-pdf
    ├── panelLayout.ts                      # empaquetado UTM + reproyección
    ├── pipeline.ts                         # orquestación cliente
    ├── projects.ts                         # persistencia híbrida Neon/local
    ├── pvgis.ts                            # cliente PVGIS v5.3
    ├── solaredge.ts                        # cliente Monitoring API
    └── store.ts                            # state con useSyncExternalStore
middleware.ts                               # protección global Auth.js
vercel.json                                 # cron + headers + región
vitest.config.ts                            # alias @/ + entorno node
```

## Notas

- Las llamadas a Catastro, PVGIS y SolarEdge pasan por Route Handlers para añadir User-Agent, evitar CORS y permitir caché.
- `tsconfig.json` activa `strict`. `npm run typecheck` valida el árbol completo.
- El polígono catastral cubre la parcela íntegra (edificios, patios). El botón "Recortar al edificio" usa la huella WFS BU.
```
