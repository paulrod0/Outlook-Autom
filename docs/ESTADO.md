# Estado del proyecto — Zeus FV (traspaso a local)

> Documento de traspaso para continuar el desarrollo en local. Resume el
> estado, las decisiones tomadas y los pasos para retomar la conversación
> con cualquier herramienta (Claude Code local, extensión de Chrome, etc.).
>
> Última actualización: 2026-05-27.

---

## 1. Qué es esto

Aplicación web interna de **Zeus Energía / Optimus Grupo** para diseño y
dimensionado de instalaciones fotovoltaicas y Comunidades Energéticas.

- Repo: `paulrod0/Outlook-Autom`
- Rama de desarrollo: `claude/photovoltaic-design-app-rY39b`
- App: `apps/zeus-fv-web/` (Next.js 15 + TypeScript + Tailwind + MapLibre)
- Documento de arquitectura: `docs/ARQUITECTURA.md`

---

## 2. Cómo arrancar en local

```bash
# 1. Clonar (si no lo tienes ya)
git clone https://github.com/paulrod0/outlook-autom.git
cd outlook-autom
git checkout claude/photovoltaic-design-app-rY39b

# 2. Arrancar la app
cd apps/zeus-fv-web
cp .env.example .env.local      # opcional, para Neon (ver §5)
npm install
npm run dev
# → http://localhost:3000
```

Atajo: hay un script `apps/zeus-fv-web/setup.sh` que hace install + dev.

Para retomar con **Claude Code local**: instala el CLI
(`npm i -g @anthropic-ai/claude-code`), entra en la carpeta del repo y
ejecuta `claude`. Lee este fichero y `docs/ARQUITECTURA.md` para
recuperar todo el contexto.

---

## 3. Qué está hecho (todo en la rama, ya pusheado)

| Funcionalidad | Estado |
|---------------|--------|
| Scaffold Next.js + TS + Tailwind + MapLibre (Esri satélite) | ✅ |
| Búsqueda de dirección (Nominatim) | ✅ |
| Catastro: parcela por click o por referencia (OVCCoordenadas + WFS CP) | ✅ |
| Catastro: huella de edificio (WFS BU) + botón "Recortar al edificio" | ✅ |
| Algoritmo de empaquetado de paneles con auto-rotación y auto-offset | ✅ |
| Producción anual vía PVGIS v5.3 | ✅ |
| Edición de polígono (vértices arrastrables) | ✅ |
| Zonas de exclusión (dibujar huecos) | ✅ |
| Parser de factura eléctrica (PDF) → CUPS, tarifa, consumo, kWp recomendado | ✅ |
| Modelo económico: inversión / ahorro / payback | ✅ |
| Comunidad Energética: miembros, reparto, cobertura, límite 130 kW | ✅ |
| Oferta PDF (estructura simple, sin branding aún) | ✅ |
| Persistencia: Neon si hay DATABASE_URL, si no localStorage | ✅ |
| Indicador de backend (Neon / navegador) en la UI | ✅ |

Validado end-to-end con Barceló Montecastillo (`5163125QA6656S`) y una
vivienda de Brenes (`6693304TG4569S`).

---

## 4. Decisiones tomadas

- **Stack**: Next.js (App Router) + TypeScript + Tailwind + MapLibre +
  Turf.js + proj4. Todo open-source, sin coste por mapa (Esri World
  Imagery con atribución).
- **Base de datos**: **Neon** (Postgres serverless), elegida por Pablo
  frente a Supabase. La capa es híbrida: sin `DATABASE_URL` cae a
  localStorage automáticamente.
- **SolarEdge**: la API pública (Monitoring) solo lee de plantas ya
  instaladas; el Designer no tiene API pública. Conclusión: el diseño se
  construye en casa (hecho); SolarEdge se integra en **post-venta** para
  comparar producción real vs estimada. Detalle en `docs/ARQUITECTURA.md` §13.
- **Costes**: se usan rangos orientativos del sector (`lib/economics.ts`).
  Pendiente sustituir por la tabla real de Alfredo.

---

## 5. Montar Neon (cuando quieras persistencia real)

Esto requiere una credencial de tu cuenta Neon (no se puede automatizar
sin ella). Dos formas:

**A — desde la consola web:**
1. `console.neon.tech` → New Project.
2. Copia la connection string (`postgresql://...?sslmode=require`).
3. Pónla en `apps/zeus-fv-web/.env.local`: `DATABASE_URL=...`
4. `npm run dev`. La tabla `projects` se crea sola; el badge de la UI
   se pone verde ("Guardando en Neon").

**B — con la extensión de Claude para Chrome:**
   Pídele a ese Claude que cree el proyecto en `console.neon.tech` y
   genere la connection string; luego pégala en `.env.local`.

> Nota: cualquier Claude que controle el navegador (extensión Chrome)
> puede hacer el alta; lo que NO puede ningún Claude es montar Neon sin
> acceso a tu cuenta, porque la cuenta es tuya.

---

## 6. Qué queda pendiente (necesita input de negocio, no código)

1. **Identidad visual**: logo SVG + paleta corporativa para que la oferta
   PDF quede fiel al estilo del infográfico Barceló.
2. **Tabla de costes de Alfredo**: €/kWp por tramos para sustituir los
   rangos orientativos de `lib/economics.ts` (función `COST_BRACKETS`).
3. **Consumo de los chips**: definir API/formato del sistema de Zeus para
   alimentar el dimensionado automáticamente.
4. **Despliegue**: decidir hosting (Vercel + Neon recomendado) y dominio.
5. **Auth**: login de comerciales si va a producción (NextAuth u otro).
6. **Pruebas con facturas reales** de varias comercializadoras para afinar
   el parser (`lib/billParser.ts`).
7. **SolarEdge post-venta** (M9): cuando haya plantas instaladas.

---

## 7. Mapa de ficheros clave

```
apps/zeus-fv-web/src/
├── app/api/
│   ├── catastro/by-point   · punto → parcela
│   ├── catastro/by-ref     · refcat → parcela
│   ├── catastro/building   · refcat → huella de edificio
│   ├── pvgis               · producción anual
│   ├── bill/parse          · POST factura PDF → datos
│   └── projects[/id]       · CRUD proyectos (Neon)
└── lib/
    ├── catastro.ts         · WFS Catastro (parcela + edificio) + parser GML
    ├── panelLayout.ts      · empaquetado UTM + auto-rotación/offset
    ├── pvgis.ts            · cliente PVGIS
    ├── billParser.ts       · extracción de factura (unpdf + regex)
    ├── economics.ts        · costes / ahorro / payback
    ├── community.ts        · Comunidad Energética (reparto)
    ├── offerPdf.tsx        · generación de oferta PDF
    ├── projects.ts         · persistencia híbrida Neon/localStorage
    ├── db.ts               · cliente Neon
    ├── pipeline.ts         · orquestación del flujo
    └── store.ts            · estado global
```
