# Aplicación Zeus FV — Documento de Arquitectura

> Documento de partida para el desarrollo de la aplicación de diseño y dimensionado de instalaciones fotovoltaicas y Comunidades Energéticas de **Zeus Energía / Optimus Grupo**.
>
> **Estado:** Borrador para validación con Pablo y Alfredo.
> **Ámbito de este documento:** Fase 2 (diseño FV automático) y la base técnica común sobre la que se construirá la Fase 1 (CE + límite catastral 130 kW).
> **Primer hito acordado:** MVP de **cálculo + dibujo** (ubicación → polígono de cubierta → paneles que caben → producción anual estimada).

---

## 1. Objetivo del producto

Construir una aplicación web interna que permita al comercial, introduciendo sólo unos pocos datos, obtener:

1. El **dibujo automático** de la instalación FV sobre la cubierta correspondiente.
2. El **número de paneles** y la **potencia pico instalable**.
3. La **producción anual estimada** en kWh (y producción específica kWh/kWp·año).
4. Una **oferta preliminar** en el formato gráfico de Zeus (igual al ejemplo Barceló Montecastillo).
5. En Fase 1: el **diseño de la Comunidad Energética** y la **limitación automática a 130 kW por referencia catastral**.

El producto sustituye buena parte del trabajo manual actual de levantamiento, simulación y propuesta visual.

---

## 2. Alcance del MVP (primer entregable)

El MVP cubre estrictamente:

| # | Funcionalidad | Detalle |
|---|---------------|---------|
| 1 | Entrada de ubicación | Dirección, coordenadas o referencia catastral |
| 2 | Carga de cubierta | Polígono desde Catastro / OpenStreetMap, con posibilidad de edición manual |
| 3 | Parámetros básicos | Orientación, inclinación, separación entre filas, modelo de panel |
| 4 | Algoritmo de empaquetado | Cálculo del nº máximo de paneles que caben sobre el polígono útil |
| 5 | Cálculo de producción | Llamada a **PVGIS** con la potencia pico resultante |
| 6 | Visualización | Render del polígono + paneles sobre imagen satélite |
| 7 | Resumen numérico | Superficie útil, nº paneles, kWp, kWh/año, kWh/kWp·año |

**Fuera del MVP** (para iteraciones siguientes): parser de factura, generación PDF, oferta económica, CE, integración CRM, integración lápiz digital, baterías, VE.

---

## 3. Stack tecnológico propuesto

### Frontend
- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** para componentes y consistencia visual
- **MapLibre GL JS** (open-source, sin coste por mapa) sobre tiles satélite de **Esri World Imagery** o **Mapbox Satellite** (según licencia)
- **Turf.js** para operaciones geométricas (buffer, intersect, área)

### Backend
- **Supabase** (ya hay MCP configurado en este entorno):
  - **Postgres + PostGIS** para almacenar proyectos, cubiertas y resultados
  - **Auth** (email + magic link para comerciales internos)
  - **Storage** para PDFs generados y capturas
  - **Edge Functions** (Deno) para orquestar llamadas a PVGIS y Catastro
- **Cache** en Postgres para respuestas de PVGIS por (lat, lon, kWp, tilt, azimuth) — PVGIS limita peticiones por IP.

### Servicios externos
| Servicio | Uso | Coste |
|----------|-----|-------|
| **PVGIS v5.3** (`re.jrc.ec.europa.eu/api/v5_3/PVcalc`) | Producción anual y mensual | Gratis, sin API key |
| **Sede Electrónica del Catastro** (OVCCoordenadas + ConsultaDNPRC) | Referencia catastral, polígono de parcela, superficie | Gratis |
| **Overpass API / OpenStreetMap** | Footprints de edificios cuando Catastro no es suficiente (p. ej. naves industriales) | Gratis |
| **Esri World Imagery** o **Mapbox Satellite** | Imagen aérea de fondo | Esri gratis con atribución / Mapbox plan free |

### Integraciones futuras (no MVP)
- CRM de Zeus (REST) — Fase 1 conexión
- Lápiz digital — Fase 1 conexión
- Pasarela de chips de consumo — Fase 2
- **SolarEdge Monitoring API** — Fase post-venta (ver §13)

---

## 4. Arquitectura lógica

```
┌──────────────────────────┐
│  Navegador (Next.js)     │
│  - Mapa MapLibre         │
│  - Editor de polígono    │
│  - Panel de resultados   │
└────────────┬─────────────┘
             │ HTTPS
┌────────────▼─────────────┐
│  Next.js API Routes      │
│  (server actions)        │
└────────────┬─────────────┘
             │
   ┌─────────┼─────────────┬─────────────────┐
   │         │             │                 │
┌──▼──┐  ┌───▼────┐   ┌────▼─────┐    ┌──────▼─────┐
│ DB  │  │ Catastro│   │  PVGIS   │    │   OSM      │
│PgSQL│  │  WFS    │   │  v5.3    │    │  Overpass  │
└─────┘  └─────────┘   └──────────┘    └────────────┘
```

Las llamadas a Catastro y PVGIS se hacen desde el servidor (Edge Functions o Next.js Route Handlers) para:
- ocultar la lógica de scraping/firma si la hubiera,
- cachear en Postgres,
- respetar rate-limits.

---

## 5. Modelo de datos (MVP)

```sql
-- Proyectos: cada estudio comercial
create table projects (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid references auth.users(id),
  client_name   text,
  address       text,
  cadastral_ref text,                       -- referencia catastral (14 char)
  centroid      geography(point, 4326),
  created_at    timestamptz default now()
);

-- Cubiertas dibujadas o importadas
create table roofs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  source        text check (source in ('catastro','osm','manual')),
  polygon       geography(polygon, 4326),
  area_m2       numeric,                    -- calculada con ST_Area
  tilt_deg      numeric default 15,
  azimuth_deg   numeric default 180,        -- 180 = Sur
  notes         text
);

-- Diseño FV resultante
create table pv_designs (
  id                  uuid primary key default gen_random_uuid(),
  roof_id             uuid references roofs(id) on delete cascade,
  panel_model         text,                 -- p. ej. "LONGi LR5-72HBD-580M"
  panel_wp            int,                  -- 580
  panel_width_m       numeric,              -- 1.134
  panel_height_m      numeric,              -- 2.278
  row_spacing_m       numeric,              -- separación entre filas
  edge_margin_m       numeric default 0.5,  -- margen de seguridad al borde
  panel_count         int,
  peak_power_kwp      numeric,
  layout_geojson      jsonb,                -- geometrías de cada panel para render
  created_at          timestamptz default now()
);

-- Resultado producción (cacheado por params)
create table pvgis_runs (
  id                    uuid primary key default gen_random_uuid(),
  design_id             uuid references pv_designs(id) on delete cascade,
  lat                   numeric,
  lon                   numeric,
  peak_power_kwp        numeric,
  tilt_deg              numeric,
  azimuth_deg           numeric,
  system_loss_pct       numeric default 14,
  yearly_kwh            numeric,
  specific_yield        numeric,            -- kWh/kWp·año
  monthly_kwh           jsonb,              -- array de 12
  raw_response          jsonb,
  fetched_at            timestamptz default now()
);

create index on pvgis_runs (lat, lon, peak_power_kwp, tilt_deg, azimuth_deg);
```

---

## 6. Algoritmo de empaquetado de paneles

Entrada: polígono de cubierta (lat/lon), orientación deseada, tilt, modelo de panel, márgenes.

```
1. Reproyectar el polígono a UTM local (metros) para operar con distancias reales.
2. Aplicar buffer interior de `edge_margin_m` (p. ej. 0.5 m).
3. Calcular separación entre filas:
     d = panel_height * (cos(tilt) + sin(tilt) / tan(altura_solar_invierno))
     - usar 21 dic a las 12h solares de la latitud del proyecto
4. Generar grid alineado con `azimuth_deg`:
     - filas separadas `d` en eje N-S
     - paneles consecutivos a `panel_width` en eje E-O
5. Filtrar paneles cuyo footprint no está totalmente contenido en el polígono buffereado.
6. Aplicar límite 130 kW por referencia catastral (Fase 1, opcional en MVP):
     max_panels = floor(130_000 / panel_wp)
7. Devolver: panel_count, peak_power_kwp, layout_geojson (array de polígonos).
```

La librería **Turf.js** cubre buffer, contains y reproyección con ayuda de **proj4js**.

---

## 7. Cálculo de producción con PVGIS

Endpoint: `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc`

Parámetros mínimos:
- `lat`, `lon` (centroide del polígono)
- `peakpower` (kWp resultantes)
- `loss` (14% por defecto)
- `angle` (tilt en grados)
- `aspect` (azimuth, 0 = Sur en PVGIS)
- `outputformat=json`
- `pvtechchoice=crystSi`
- `mountingplace=building` o `free`

Respuesta contiene `outputs.totals.fixed.E_y` (kWh/año) y `outputs.monthly.fixed` (12 valores).

**Cacheado**: clave `(lat_rounded_4, lon_rounded_4, peak_power_kwp_rounded_1, tilt, azimuth, loss)` para evitar repetir llamadas al hacer ajustes finos.

---

## 8. UX del MVP

Pantalla única dividida en dos paneles:

```
┌──────────────────────────────────┬──────────────────────┐
│                                  │  Datos del proyecto  │
│                                  │  - Cliente           │
│                                  │  - Dirección / Ref.  │
│         MAPA SATÉLITE            │                      │
│  (con polígono + paneles render) │  Parámetros          │
│                                  │  - Modelo panel ▼    │
│                                  │  - Tilt °            │
│                                  │  - Azimuth °         │
│                                  │  - Margen m          │
│                                  │                      │
│                                  │  Resultados          │
│                                  │  - Superficie útil   │
│                                  │  - Nº paneles        │
│                                  │  - kWp               │
│                                  │  - kWh/año           │
│                                  │  - kWh/kWp·año       │
└──────────────────────────────────┴──────────────────────┘
```

Acciones:
1. **Buscar dirección** → centra mapa, intenta autocargar polígono de Catastro.
2. **Editar polígono** (vértices arrastrables) si Catastro no es preciso.
3. **Recalcular** (auto al cambiar parámetros, con debounce).
4. **Guardar proyecto** (a Supabase).

---

## 9. Roadmap propuesto

| Hito | Contenido | Tiempo estimado |
|------|-----------|-----------------|
| **M0** | Scaffold Next.js + Supabase + Mapa satélite con búsqueda de dirección | 2-3 días |
| **M1** | Integración Catastro: dada una ref. o un click sobre el mapa, traer polígono | 3-4 días |
| **M2** | Algoritmo de empaquetado + render de paneles | 4-5 días |
| **M3** | Integración PVGIS + cacheado + panel de resultados | 2-3 días |
| **M4 → MVP cerrado** | Persistencia de proyectos, edición de polígono, catálogo de paneles | 3-4 días |
| **M5** | Generador de infografía PDF formato Zeus (estilo Barceló Montecastillo) | 4-6 días |
| **M6** | Parser de factura de luz + dimensionado por consumo | 5-7 días |
| **M7** | Fase 1: Comunidad Energética + límite 130 kW catastral | 7-10 días |
| **M8** | Integración CRM + lápiz digital | a definir |
| **M9** | Integración **SolarEdge Monitoring API** (post-venta, ver §13) | 3-5 días |

---

## 10. Decisiones que requieren validación

Antes de empezar M0 conviene cerrar:

1. **Hosting**: ¿Vercel + Supabase Cloud, o todo on-prem en infraestructura de Zeus?
2. **Imagen satélite**: ¿Tenéis cuenta Mapbox? Si no, partimos con Esri (gratis, atribución obligatoria).
3. **Catálogo de paneles**: ¿hay un listado preferido o trabajamos con los que aparecen en el infográfico (LONGi / JA Solar / Trina Vertex 650-720 Wp)?
4. **Identidad visual**: ¿podéis pasar el logo en SVG, paleta de colores corporativa y fuente para que el render del PDF sea fiel al ejemplo Barceló Montecastillo?
5. **Costes por defecto (Alfredo)**: para Fase 2, ¿pueden facilitar la tabla €/kWp por tramos para la oferta económica?
6. **Acceso**: ¿la app es sólo para comerciales internos (login) o habrá rol cliente?
7. **Cumplimiento RGPD**: tratamiento del CUPS y datos del cliente — definir política antes de procesar facturas.

---

## 11. Riesgos técnicos

| Riesgo | Mitigación |
|--------|-----------|
| Polígonos de Catastro imprecisos en cubiertas reales (incluyen patios, vuelos) | Permitir edición manual + capa OSM buildings como alternativa |
| Rate-limit de PVGIS | Cacheado agresivo en Postgres por hash de parámetros |
| Sombras de obstáculos (chimeneas, peto, otros edificios) en MVP | Asumir cubierta limpia en MVP; en M5+ permitir dibujar zonas de exclusión |
| Distintos azimuth por cubierta (naves con dos aguas) | En MVP una sola orientación; modelo de datos ya prevé varias `roofs` por proyecto |
| Cambios en API de Catastro | Aislar la integración tras una interfaz `CadastralProvider` para poder cambiar a alternativa |

---

## 13. SolarEdge — análisis de encaje

Pablo ha pedido valorar la integración con SolarEdge. Es importante distinguir **dos productos diferentes** de SolarEdge que se confunden con frecuencia:

### 13.1 SolarEdge Monitoring API (pública)

- **Qué es:** API REST + key que da acceso a datos de **instalaciones ya construidas** con inversor SolarEdge.
- **URL base:** `https://monitoringapi.solaredge.com/`
- **Auth:** API Key a nivel de cuenta (Account) o de sitio (Site).
- **Formato:** JSON.
- **Endpoints útiles para Zeus:**
  - `GET /sites/list` — listado de plantas vinculadas al token
  - `GET /site/{siteId}/details` — datos del sitio, ubicación, potencia
  - `GET /site/{siteId}/overview` — energía total / mensual / anual / del día
  - `GET /site/{siteId}/energy` — serie temporal de producción
  - `GET /site/{siteId}/power` — potencia instantánea (15 min)
  - `GET /site/{siteId}/inventory` — inversores, baterías, optimizadores, contadores
  - `GET /site/{siteId}/alerts` — alarmas activas
  - `GET /equipment/{siteId}/{serial}/data` — datos por inversor
- **Límites:** **300 peticiones/día por token de cuenta**, máximo 3 concurrentes por IP. Hay que diseñar con caché (Postgres) y un job periódico que sincronice — no llamar bajo demanda desde el frontend.

**Qué NO hace esta API:** no diseña, no dibuja paneles, no calcula producción estimada de instalaciones futuras, no da imagen satélite. Sólo lee de plantas reales SolarEdge ya conectadas.

### 13.2 SolarEdge Designer (no API pública)

- **Qué es:** herramienta web gratuita de SolarEdge para que instaladores certificados diseñen instalaciones: layout automático sobre imagen satélite, sombras, stringing, BOM.
- **API:** **no es pública**. SolarEdge sólo la integra con un puñado de partners específicos (Bodhi, DST Connect, etc.).
- **Para usarla desde nuestra app habría que:**
  - solicitar acuerdo de partner integrador con SolarEdge — proceso comercial, no técnico, sin garantías,
  - o usar Designer manualmente y exportar resultados (no automatizable).
- **Recomendación:** **no apostar Fase 2 a Designer**. La capacidad de dibujar paneles sobre cubierta debe construirse internamente (lo que ya plantea §6 del documento). Mantiene la independencia tecnológica y evita dependencia de un fabricante de inversores.

### 13.3 Dónde encaja SolarEdge en Zeus

| Etapa | Encaje | Acción |
|-------|--------|--------|
| MVP (diseño + cálculo) | **Ninguno** — la API pública no diseña; Designer no es API | Construir el diseñador propio (M2-M3) |
| Oferta comercial (M5) | Opcional: usar nombres de inversores SolarEdge en el catálogo | Sólo dato estático |
| **Post-venta / O&M (nuevo hito M9)** | **Encaje claro**: traer producción real, alertas, comparativa contra producción estimada en el momento del diseño | Job nocturno + tabla `solaredge_sites` |
| CRM | Mostrar al comercial el % de cumplimiento de la estimación inicial | Vista en el CRM una vez sincronizado |

### 13.4 Modelo de datos propuesto para post-venta

```sql
create table solaredge_sites (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete set null,
  se_site_id      bigint unique,             -- ID en SolarEdge
  api_key_ref     text,                       -- nombre en secret manager
  installed_kwp   numeric,
  commissioned_at date,
  last_sync_at    timestamptz
);

create table solaredge_energy_daily (
  site_id      uuid references solaredge_sites(id) on delete cascade,
  day          date,
  energy_kwh   numeric,
  primary key (site_id, day)
);
```

Edge Function `sync_solaredge` ejecutada por cron (Supabase pg_cron) cada noche:
1. Listar sitios activos.
2. Para cada uno: pedir `energy?timeUnit=DAY&startDate=last_sync&endDate=today`.
3. Upsert en `solaredge_energy_daily`.
4. Calcular `kpi_real_vs_estimated = sum(real) / pvgis_estimate * 100` y exponerlo en la vista del proyecto.

Con esto se cierra el ciclo: el comercial diseña con la app → se construye con SolarEdge → la misma app muestra cómo se comporta vs lo prometido.

### 13.5 Decisión

- **MVP y Fase 2 (oferta comercial)**: **no** integrar SolarEdge. El diseño y dibujo de paneles se construye en casa.
- **Post-venta (M9 o cuando haya las primeras plantas SolarEdge en cartera)**: **sí** integrar la Monitoring API para cerrar el círculo diseño → real.

---

## 14. Próximos pasos inmediatos

Si se valida este documento, los pasos siguientes serían:

1. Crear repo nuevo `zeus-fv-web` (o usar este `Outlook-Autom` como contenedor temporal) con scaffold Next.js + TypeScript + Tailwind.
2. Provisionar proyecto Supabase (puedo hacerlo desde el MCP `2164bc5a-...` cuando confirméis nombre y región).
3. Implementar M0 y compartir URL de preview en Vercel.

---

*Documento generado el 2026-05-21 como punto de partida. Cualquier cambio sustancial sobre el alcance del MVP o el stack deberá revisarse aquí antes de codificar.*
