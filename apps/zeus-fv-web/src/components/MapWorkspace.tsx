"use client";

import * as turf from "@turf/turf";
import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import { AddressSearch } from "./AddressSearch";
import { HoleDrawer } from "./HoleDrawer";
import { ObstacleDrawer } from "./ObstacleDrawer";
import { PolygonEditor } from "./PolygonEditor";
import { RoofDrawer } from "./RoofDrawer";
import type { GeocodeResult } from "@/lib/geocoding";
import { clipParcelToBuilding, runFromPoint, runLayoutAndPvgis } from "@/lib/pipeline";
import {
  addExclusionHole,
  addObstacle,
  clearExclusionHoles,
  clearObstacles,
  clearRoofPlanes,
  removeObstacle,
  setState,
  useProjectState,
  type RoofPlane,
} from "@/lib/store";

const DEFAULT_CENTER: [number, number] = [-3.7038, 40.4168];
const DEFAULT_ZOOM = 5.5;

const PARCEL_SOURCE = "zeus-parcel";
const BUILDING_SOURCE = "zeus-building";
const PANELS_SOURCE = "zeus-panels";
const OBSTACLES_SOURCE = "zeus-obstacles";
const MEASURES_SOURCE = "zeus-measures";
const ROOFPLANES_SOURCE = "zeus-roofplanes";

// Paleta para distinguir faldones en el mapa.
const PLANE_COLORS = [
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#eab308",
  "#ec4899",
  "#84cc16",
];

export function MapWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const editorRef = useRef<PolygonEditor | null>(null);
  const drawerRef = useRef<HoleDrawer | null>(null);
  const obstacleDrawerRef = useRef<ObstacleDrawer | null>(null);
  const roofDrawerRef = useRef<RoofDrawer | null>(null);
  const editModeRef = useRef(false);
  const drawModeRef = useRef(false);
  const obstacleModeRef = useRef(false);
  const roofDrawModeRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [obstacleMode, setObstacleMode] = useState(false);
  const [roofDrawMode, setRoofDrawMode] = useState(false);
  const [roofDrawPointCount, setRoofDrawPointCount] = useState(0);
  const [drawPointCount, setDrawPointCount] = useState(0);
  const [view3D, setView3D] = useState(false);
  const [busyOsm, setBusyOsm] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [googleQuality, setGoogleQuality] = useState<string | null>(null);
  const [busyLidar, setBusyLidar] = useState(false);
  const [lidarInfo, setLidarInfo] = useState<string | null>(null);
  const project = useProjectState();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      preserveDrawingBuffer: true, // permite map.getCanvas().toDataURL() para el PDF
      style: {
        version: 8,
        sources: {
          "esri-world-imagery": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution:
              'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
            maxzoom: 19,
          },
        },
        layers: [{ id: "satellite", type: "raster", source: "esri-world-imagery" }],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({}), "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left",
    );

    map.on("load", () => {
      map.addSource(PARCEL_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: PARCEL_SOURCE,
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.12,
        },
      });
      // Vista 3D del polígono: paredes hasta una altura de 4 m.
      map.addLayer({
        id: "parcel-3d",
        type: "fill-extrusion",
        source: PARCEL_SOURCE,
        layout: { visibility: "none" },
        paint: {
          "fill-extrusion-color": "#e2e8f0",
          "fill-extrusion-height": 4,
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: PARCEL_SOURCE,
        paint: {
          "line-color": "#22c55e",
          "line-width": 2,
        },
      });

      map.addSource(BUILDING_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "building-line",
        type: "line",
        source: BUILDING_SOURCE,
        paint: {
          "line-color": "#facc15",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });

      map.addSource(PANELS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "panels-fill",
        type: "fill",
        source: PANELS_SOURCE,
        paint: {
          "fill-color": "#1d4ed8",
          "fill-opacity": 0.85,
        },
      });
      // Vista 3D: extrusión de cada panel a altura proporcional al tilt.
      map.addLayer({
        id: "panels-3d",
        type: "fill-extrusion",
        source: PANELS_SOURCE,
        layout: { visibility: "none" },
        paint: {
          "fill-extrusion-color": "#1d4ed8",
          "fill-extrusion-height": ["coalesce", ["get", "extrusionHeight"], 0.6],
          "fill-extrusion-base": 0.0,
          "fill-extrusion-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "panels-line",
        type: "line",
        source: PANELS_SOURCE,
        paint: { "line-color": "#0f172a", "line-width": 0.4 },
      });

      // Medidas: etiquetas de longitud (m) y ángulo (°) por arista del
      // polígono activo. Se mostrarán mientras el usuario edita.
      map.addSource(MEASURES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "measures-text",
        type: "symbol",
        source: MEASURES_SOURCE,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-font": ["Open Sans Bold"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#fff",
          "text-halo-color": "#0F2A4D",
          "text-halo-width": 2,
        },
      });

      // Faldones segmentados (cada uno su color).
      map.addSource(ROOFPLANES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "roofplanes-fill",
        type: "fill",
        source: ROOFPLANES_SOURCE,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "roofplanes-line",
        type: "line",
        source: ROOFPLANES_SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
        },
      });
      map.addLayer({
        id: "roofplanes-label",
        type: "symbol",
        source: ROOFPLANES_SOURCE,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-font": ["Open Sans Bold"],
        },
        paint: {
          "text-color": "#fff",
          "text-halo-color": "#0F2A4D",
          "text-halo-width": 2,
        },
      });

      // Obstáculos sobre la cubierta (skylights, HVAC, chimeneas).
      map.addSource(OBSTACLES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "obstacles-fill",
        type: "fill",
        source: OBSTACLES_SOURCE,
        paint: {
          "fill-color": "#f43f5e",
          "fill-opacity": 0.4,
        },
      });
      map.addLayer({
        id: "obstacles-line",
        type: "line",
        source: OBSTACLES_SOURCE,
        paint: {
          "line-color": "#f43f5e",
          "line-width": 1.5,
        },
      });

      setReady(true);
    });

    map.on("click", (e) => {
      // Edición de polígono y modos de dibujo tienen prioridad sobre el
      // click genérico de "cargar parcela".
      if (
        editModeRef.current ||
        drawModeRef.current ||
        obstacleModeRef.current ||
        roofDrawModeRef.current
      )
        return;

      // Click sobre un obstáculo existente → borrarlo.
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["obstacles-fill"],
      });
      if (hits.length > 0) {
        const idStr = hits[0].properties?.obstacleIndex;
        const idx = typeof idStr === "number" ? idStr : Number(idStr);
        if (Number.isInteger(idx)) {
          removeObstacle(idx);
          void runLayoutAndPvgis();
          return;
        }
      }

      const { lat, lng } = e.lngLat;
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new maplibregl.Marker({ color: "#1FBFE8" })
        .setLngLat([lng, lat])
        .addTo(map);
      void runFromPoint(lat, lng);
    });

    mapRef.current = map;

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
      drawerRef.current?.destroy();
      drawerRef.current = null;
      obstacleDrawerRef.current?.destroy();
      obstacleDrawerRef.current = null;
      roofDrawerRef.current?.destroy();
      roofDrawerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    editModeRef.current = editMode;
    const map = mapRef.current;
    if (!map || !ready) return;

    if (editMode) {
      if (!editorRef.current) {
        editorRef.current = new PolygonEditor(map, (polygon) => {
          setState({ parcelGeometry: polygon });
          void runLayoutAndPvgis();
        });
      }
      editorRef.current.setPolygon(project.parcelGeometry);
    } else {
      editorRef.current?.destroy();
      editorRef.current = null;
    }
  }, [editMode, ready, project.parcelGeometry]);

  useEffect(() => {
    drawModeRef.current = drawMode;
    const map = mapRef.current;
    if (!map || !ready) return;

    if (drawMode) {
      if (!drawerRef.current) {
        drawerRef.current = new HoleDrawer(map, () => {
          setDrawPointCount(drawerRef.current?.pointCount() ?? 0);
        });
      }
      drawerRef.current.start();
      setDrawPointCount(0);
    } else {
      drawerRef.current?.cancel();
    }
  }, [drawMode, ready]);

  useEffect(() => {
    roofDrawModeRef.current = roofDrawMode;
    const map = mapRef.current;
    if (!map || !ready) return;
    if (roofDrawMode) {
      if (!roofDrawerRef.current) {
        roofDrawerRef.current = new RoofDrawer(map, () => {
          setRoofDrawPointCount(roofDrawerRef.current?.pointCount() ?? 0);
        });
      }
      roofDrawerRef.current.start();
      setRoofDrawPointCount(0);
    } else {
      roofDrawerRef.current?.cancel();
    }
  }, [roofDrawMode, ready]);

  const finishRoof = async () => {
    if (!roofDrawerRef.current) return;
    const polygon = roofDrawerRef.current.commit();
    setRoofDrawMode(false);
    if (!polygon) return;
    // Calcular centroide para PVGIS
    const centroidCoords = turf.centroid(turf.feature(polygon)).geometry
      .coordinates as [number, number];
    const areaM2 = turf.area(turf.feature(polygon));
    setState({
      parcelGeometry: polygon,
      parcelAreaM2: Math.round(areaM2),
      buildingGeometry: null,
      reference: project.reference,
      address: project.address,
      centroid: { lon: centroidCoords[0], lat: centroidCoords[1] },
      status: "computing",
    });
    await runLayoutAndPvgis();
  };

  const detectWithGoogleSolar = async () => {
    const center = project.centroid ?? null;
    if (!center) return;
    setBusyGoogle(true);
    setGoogleQuality(null);
    try {
      const res = await fetch(
        `/api/google-solar/building-insights?lat=${center.lat}&lon=${center.lon}&quality=LOW`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Google Solar: error");
      }
      const data = (await res.json()) as {
        imageryQuality: string;
        planes: Array<{
          id: string;
          label: string;
          polygon: GeoJSON.Polygon;
          tiltDeg: number;
          azimuthDeg: number;
          areaM2: number;
        }>;
      };
      setGoogleQuality(data.imageryQuality);

      // Sustituir faldones existentes por los detectados.
      clearRoofPlanes();
      const planes: RoofPlane[] = data.planes.map((p) => ({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : p.id,
        label: p.label,
        polygon: p.polygon,
        tiltDeg: p.tiltDeg,
        // Google Solar usa convención: 0° = Norte, 90° = Este, 180° = Sur, 270° = Oeste.
        // Coincide con la nuestra: ya está bien.
        azimuthDeg: p.azimuthDeg,
        obstacles: [],
        enabled: true,
      }));
      setState({ roofPlanes: planes });
      await runLayoutAndPvgis();
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Error Google Solar",
      });
    } finally {
      setBusyGoogle(false);
    }
  };

  const analyzeWithLidar = async () => {
    const center = project.centroid ?? null;
    if (!center) return;
    setBusyLidar(true);
    setLidarInfo(null);
    try {
      // Si ya hay un polígono de cubierta cargado, lo enviamos para que el
      // análisis se restrinja a ESE edificio (clave en zonas densas donde
      // los edificios se fusionan a 2,5 m). Si no, modo edificio aislado.
      const hasPolygon = !!project.parcelGeometry;
      const res = hasPolygon
        ? await fetch("/api/roof-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: center.lat,
              lon: center.lon,
              polygon: project.parcelGeometry,
            }),
          })
        : await fetch(`/api/roof-analysis?lat=${center.lat}&lon=${center.lon}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "LiDAR: error");
      }
      const a = (await res.json()) as {
        selectionMode: "polygon" | "lidar-component";
        isPitched: boolean;
        dominantTiltDeg: number;
        dominantAzimuthDeg: number | null;
        meanTiltDeg: number;
        buildingHeightM: number;
        pitchedFraction: number;
        planes: Array<{ label: string; tiltDeg: number; azimuthDeg: number; fraction: number }>;
        segments: Array<{
          label: string;
          kind: "flat" | "pitched";
          tiltDeg: number;
          azimuthDeg: number;
          areaM2: number;
          polygon: GeoJSON.Polygon;
        }>;
        footprint: GeoJSON.Polygon | null;
        footprintTouchesEdge: boolean;
        resolutionM: number;
      };

      // Si el LiDAR mandó (Catastro desalineado), la huella real reemplaza
      // al polígono de Catastro en cualquier caso.
      const lidarOverridesPolygon = a.selectionMode === "lidar-component";

      const simplifyPoly = (poly: GeoJSON.Polygon): GeoJSON.Polygon => {
        try {
          return turf.simplify(turf.feature(poly), {
            tolerance: 0.00002,
            highQuality: true,
          }).geometry as GeoJSON.Polygon;
        } catch {
          return poly;
        }
      };

      const patch: Record<string, unknown> = {};
      let modeMsg = "";

      const pitchedSegments = a.segments.filter((s) => s.kind === "pitched");

      if (a.isPitched && pitchedSegments.length >= 1) {
        // CUBIERTA INCLINADA → crear un faldón por segmento detectado,
        // cada uno con su polígono, tilt y azimut reales.
        clearRoofPlanes();
        const planes: RoofPlane[] = pitchedSegments.map((s, i) => ({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `lidar-${i}`,
          label: s.label,
          polygon: simplifyPoly(s.polygon),
          tiltDeg: s.tiltDeg,
          azimuthDeg: s.azimuthDeg,
          obstacles: [],
          enabled: true,
        }));
        patch.roofPlanes = planes;
        modeMsg = `${planes.length} faldón(es) segmentado(s)`;
      } else {
        // CUBIERTA PLANA → modo simple (un polígono, estructura inclinada).
        clearRoofPlanes();
        patch.roofPlanes = [];
        if (hasPolygon && !lidarOverridesPolygon) {
          // Catastro alineado: conservamos la cubierta del usuario.
          modeMsg = "plana confirmada · se mantiene tu polígono";
        } else {
          // Modo edificio aislado: aplicamos la huella detectada.
          let footprintApplied = false;
          const flat = a.segments.find((s) => s.kind === "flat");
          const poly = flat?.polygon ?? a.footprint;
          if (poly && (!a.footprintTouchesEdge || flat)) {
            const geom = simplifyPoly(poly);
            const areaM2 = turf.area(turf.feature(geom));
            if (areaM2 > 20) {
              patch.parcelGeometry = geom;
              patch.parcelAreaM2 = Math.round(areaM2);
              patch.buildingGeometry = null;
              footprintApplied = true;
            }
          }
          modeMsg = footprintApplied
            ? "huella real aplicada"
            : a.footprintTouchesEdge
              ? "huella parcial (edificio mayor que el área analizada)"
              : "sin huella fiable";
        }
      }

      setState(patch);
      await runLayoutAndPvgis();

      setLidarInfo(
        a.isPitched
          ? `Inclinada · ${a.dominantTiltDeg}° · azimut ${a.dominantAzimuthDeg ?? "—"}° · ${a.buildingHeightM} m · ${modeMsg}`
          : `Plana · ${a.buildingHeightM} m · ${modeMsg}`,
      );
    } catch (err) {
      setLidarInfo(
        err instanceof Error ? `LiDAR: ${err.message}` : "Error análisis LiDAR",
      );
    } finally {
      setBusyLidar(false);
    }
  };

  const loadFromOSM = async () => {
    const center = project.centroid ?? null;
    if (!center) return;
    setBusyOsm(true);
    try {
      const res = await fetch(
        `/api/osm/building?lat=${center.lat}&lon=${center.lon}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "OSM: error");
      }
      const data = (await res.json()) as {
        polygon: GeoJSON.Polygon;
        areaM2: number;
      };
      setState({
        parcelGeometry: data.polygon,
        parcelAreaM2: data.areaM2,
        buildingGeometry: null,
        status: "computing",
      });
      await runLayoutAndPvgis();
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Error OSM",
      });
    } finally {
      setBusyOsm(false);
    }
  };

  useEffect(() => {
    obstacleModeRef.current = obstacleMode;
    const map = mapRef.current;
    if (!map || !ready) return;

    if (obstacleMode) {
      if (!obstacleDrawerRef.current) {
        obstacleDrawerRef.current = new ObstacleDrawer(
          map,
          (polygon) => {
            addObstacle(polygon);
            setObstacleMode(false);
            void runLayoutAndPvgis();
          },
          () => setObstacleMode(false),
        );
      }
      obstacleDrawerRef.current.start_();
    } else {
      obstacleDrawerRef.current?.cancel();
    }
  }, [obstacleMode, ready]);

  // Render obstáculos
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(OBSTACLES_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: project.obstacles.map((p, i) => ({
        type: "Feature",
        geometry: p,
        properties: { obstacleIndex: i },
      })),
    });
  }, [project.obstacles, ready]);

  // Render de los faldones segmentados (cada uno con su color + etiqueta).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(ROOFPLANES_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: project.roofPlanes
        .filter((p) => p.enabled)
        .map((p, i) => ({
          type: "Feature",
          geometry: p.polygon,
          properties: {
            color: PLANE_COLORS[i % PLANE_COLORS.length],
            label: `${p.label} · ${p.tiltDeg}°/${p.azimuthDeg}°`,
          },
        })),
    });
  }, [project.roofPlanes, ready]);

  // Etiquetas de medida sobre las aristas del polígono — sólo en modo edición.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(MEASURES_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;

    if (!editMode || !project.parcelGeometry || project.parcelGeometry.type !== "Polygon") {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const ring = project.parcelGeometry.coordinates[0];
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i] as [number, number];
      const b = ring[i + 1] as [number, number];
      const lengthM = turf.distance(turf.point(a), turf.point(b), {
        units: "meters",
      });
      const bearing = turf.bearing(turf.point(a), turf.point(b));
      const normalized = ((bearing + 360) % 360).toFixed(0);
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: mid },
        properties: {
          label: `${lengthM.toFixed(2)} m · ${normalized}°`,
        },
      });
    }
    src.setData({ type: "FeatureCollection", features });
  }, [editMode, project.parcelGeometry, ready]);

  const finishHole = () => {
    if (!drawerRef.current) return;
    const ring = drawerRef.current.commit();
    setDrawMode(false);
    if (ring) {
      addExclusionHole(ring);
      void runLayoutAndPvgis();
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const parcelSrc = map.getSource(PARCEL_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (parcelSrc) {
      parcelSrc.setData(
        project.parcelGeometry
          ? {
              type: "FeatureCollection",
              features: [
                { type: "Feature", geometry: project.parcelGeometry, properties: {} },
              ],
            }
          : { type: "FeatureCollection", features: [] },
      );
    }

    if (project.parcelGeometry) {
      const bbox = bboxOf(project.parcelGeometry);
      map.fitBounds(bbox, { padding: 60, duration: 600, maxZoom: 19 });
    }
  }, [project.parcelGeometry, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const panelsSrc = map.getSource(PANELS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!panelsSrc) return;

    // Para la vista 3D, añadimos al panel una "altura de extrusión" que
    // depende del tilt activo: tilt=0 → 0,1 m; tilt=30 → ~1,1 m.
    const tilt = project.tiltDeg ?? 15;
    const extrusionHeight = 0.1 + (tilt / 30) * 1.0;
    const panels = (project.layout?.panels ?? []).map((f) => ({
      ...f,
      properties: { ...(f.properties ?? {}), extrusionHeight },
    }));
    panelsSrc.setData({
      type: "FeatureCollection",
      features: panels,
    });
  }, [project.layout, project.tiltDeg, ready]);

  // Alternar entre vista 2D (cenital) y 3D (perspectiva con extrusión).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (view3D) {
      map.easeTo({ pitch: 55, bearing: -20, duration: 600 });
      map.setLayoutProperty("parcel-3d", "visibility", "visible");
      map.setLayoutProperty("panels-3d", "visibility", "visible");
      map.setLayoutProperty("panels-fill", "visibility", "none");
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
      map.setLayoutProperty("parcel-3d", "visibility", "none");
      map.setLayoutProperty("panels-3d", "visibility", "none");
      map.setLayoutProperty("panels-fill", "visibility", "visible");
    }
  }, [view3D, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(BUILDING_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(
      project.buildingGeometry
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: project.buildingGeometry,
                properties: {},
              },
            ],
          }
        : { type: "FeatureCollection", features: [] },
    );
  }, [project.buildingGeometry, ready]);

  const onPick = (result: GeocodeResult) => {
    const map = mapRef.current;
    if (!map) return;
    const center: [number, number] = [result.lon, result.lat];
    map.flyTo({ center, zoom: 19, speed: 1.4 });
  };

  const canEdit = !!project.parcelGeometry;

  return (
    <section className="relative h-full">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-3 right-14 top-3 z-10 max-w-[420px] sm:left-4 sm:top-4 md:right-auto">
        <AddressSearch disabled={!ready} onPick={onPick} />
        <p className="mt-2 hidden rounded-md bg-zeus-panel/90 px-3 py-1.5 text-[11px] text-slate-300 shadow ring-1 ring-white/5 sm:block">
          {roofDrawMode
            ? `Trazando cubierta · Click para añadir vértices · Click sobre el primer punto (verde) para cerrar · Backspace deshace · ${roofDrawPointCount} puntos.`
            : drawMode
              ? "Click sobre el mapa para añadir vértices a la zona de exclusión. Al terminar, pulsa Cerrar zona."
              : obstacleMode
                ? "Arrastra sobre el mapa para dibujar el rectángulo del obstáculo (skylight, HVAC). Click sobre un obstáculo existente para borrarlo."
                : editMode
                  ? "Arrastra los puntos verdes · Doble click para borrar · Click en un punto pequeño para añadir."
                  : "Haz clic sobre una cubierta para cargar la parcela catastral. Si no cuadra, pulsa \"Trazar cubierta manualmente\" o \"Usar OSM\"."}
        </p>
      </div>
      {/* Columna única de acciones en la esquina superior derecha */}
      <div className="absolute bottom-16 right-3 z-10 flex w-48 flex-col gap-2 md:bottom-auto md:right-4 md:top-4 md:w-52">
        {/* Toggle 2D / 3D (siempre visible) */}
        {canEdit && (
          <button
            type="button"
            onClick={() => setView3D((v) => !v)}
            className={`self-end rounded-md px-3 py-1.5 text-xs font-medium shadow ring-1 ring-white/10 ${
              view3D
                ? "bg-optimus-cyan text-optimus-navyDeep"
                : "bg-optimus-navy/95 text-slate-100 hover:bg-optimus-navy"
            }`}
            title={view3D ? "Volver a 2D" : "Vista 3D"}
          >
            {view3D ? "Vista 2D" : "Vista 3D"}
          </button>
        )}

        {/* Trazado manual de cubierta (disponible siempre) */}
        {roofDrawMode ? (
          <>
            <button
              type="button"
              onClick={() => void finishRoof()}
              disabled={roofDrawPointCount < 3}
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-900 shadow ring-1 ring-white/10 hover:bg-emerald-400 disabled:opacity-40"
            >
              Cerrar cubierta ({roofDrawPointCount} pts)
            </button>
            <button
              type="button"
              onClick={() => setRoofDrawMode(false)}
              className="rounded-md bg-zeus-panel/95 px-3 py-1.5 text-xs font-medium text-slate-200 shadow ring-1 ring-white/10 hover:bg-zeus-panel"
            >
              Cancelar trazado
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditMode(false);
              setDrawMode(false);
              setObstacleMode(false);
              setRoofDrawMode(true);
            }}
            className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-slate-900 shadow ring-1 ring-white/10 hover:bg-emerald-500"
            title="Dibuja la cubierta vértice a vértice sobre la imagen satélite. Mucho más preciso que Catastro cuando hay desfase."
          >
            Trazar cubierta manualmente
          </button>
        )}

        {/* Resto de acciones — sólo cuando hay parcela cargada */}
        {canEdit && (
          <>
          {project.buildingGeometry && (
            <button
              type="button"
              onClick={() => {
                setEditMode(false);
                setDrawMode(false);
                clipParcelToBuilding();
              }}
              className="rounded-md bg-amber-400/90 px-3 py-1.5 text-xs font-medium text-slate-900 shadow ring-1 ring-white/10 hover:bg-amber-400"
              title="Sustituye el polígono por la huella del edificio según Catastro BU"
            >
              Recortar al edificio
            </button>
          )}
          {project.centroid && (
            <button
              type="button"
              onClick={() => void loadFromOSM()}
              disabled={busyOsm}
              className="rounded-md bg-fuchsia-500/80 px-3 py-1.5 text-xs font-medium text-slate-900 shadow ring-1 ring-white/10 hover:bg-fuchsia-500 disabled:opacity-40"
              title="Sustituye el polígono por el edificio según OpenStreetMap (suele coincidir mejor con la imagen satélite cuando Catastro falla)"
            >
              {busyOsm ? "Cargando OSM…" : "Usar OSM"}
            </button>
          )}
          {project.centroid && (
            <button
              type="button"
              onClick={() => void analyzeWithLidar()}
              disabled={busyLidar}
              className="rounded-md bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-medium text-white shadow ring-1 ring-white/10 hover:opacity-90 disabled:opacity-40"
              title="Análisis con LiDAR del IGN (gratis): detecta inclinación, orientación, altura y la huella real del edificio. Cobertura España."
            >
              {busyLidar ? "Analizando LiDAR…" : "📡 Analizar cubierta (LiDAR IGN)"}
            </button>
          )}
          {lidarInfo && (
            <p className="rounded-md bg-emerald-500/20 px-2 py-1 text-[10px] leading-tight text-emerald-100">
              {lidarInfo}
            </p>
          )}
          {project.centroid && (
            <button
              type="button"
              onClick={() => void detectWithGoogleSolar()}
              disabled={busyGoogle}
              className="rounded-md bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-white shadow ring-1 ring-white/10 hover:opacity-90 disabled:opacity-40"
              title="Google Solar IA (de pago): detecta cada plano del tejado. Alternativa a LiDAR IGN para máxima resolución. ~0,10-5 € por consulta."
            >
              {busyGoogle ? "Analizando techo…" : "🛰 Detectar techo (Google AI)"}
            </button>
          )}
          {googleQuality && (
            <p
              className={`rounded-md px-2 py-1 text-[10px] text-center font-medium ${
                googleQuality === "HIGH"
                  ? "bg-emerald-500/30 text-emerald-100"
                  : googleQuality === "MEDIUM"
                    ? "bg-amber-500/30 text-amber-100"
                    : "bg-slate-500/30 text-slate-200"
              }`}
            >
              Google Solar: calidad {googleQuality}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setDrawMode(false);
              setEditMode((v) => !v);
            }}
            disabled={drawMode}
            className={`rounded-md px-3 py-1.5 text-xs font-medium shadow ring-1 ring-white/10 disabled:opacity-40 ${
              editMode
                ? "bg-amber-500 text-slate-900 hover:bg-amber-400"
                : "bg-zeus-panel/95 text-slate-200 hover:bg-zeus-panel"
            }`}
          >
            {editMode ? "Terminar edición" : "Editar polígono"}
          </button>

          {drawMode ? (
            <>
              <button
                type="button"
                onClick={finishHole}
                disabled={drawPointCount < 3}
                className="rounded-md bg-zeus-green/90 px-3 py-1.5 text-xs font-medium text-slate-900 shadow ring-1 ring-white/10 hover:bg-zeus-green disabled:opacity-40"
              >
                Cerrar zona ({drawPointCount} pts)
              </button>
              <button
                type="button"
                onClick={() => setDrawMode(false)}
                className="rounded-md bg-zeus-panel/95 px-3 py-1.5 text-xs font-medium text-slate-200 shadow ring-1 ring-white/10 hover:bg-zeus-panel"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditMode(false);
                setObstacleMode(false);
                setDrawMode(true);
              }}
              disabled={editMode || obstacleMode}
              className="rounded-md bg-zeus-panel/95 px-3 py-1.5 text-xs font-medium text-slate-200 shadow ring-1 ring-white/10 hover:bg-zeus-panel disabled:opacity-40"
            >
              Añadir zona de exclusión
            </button>
          )}

          {obstacleMode ? (
            <button
              type="button"
              onClick={() => setObstacleMode(false)}
              className="rounded-md bg-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-100 shadow ring-1 ring-rose-300/40 hover:bg-rose-500/50"
            >
              Cancelar obstáculo
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditMode(false);
                setDrawMode(false);
                setObstacleMode(true);
              }}
              disabled={editMode || drawMode}
              className="rounded-md bg-zeus-panel/95 px-3 py-1.5 text-xs font-medium text-slate-200 shadow ring-1 ring-white/10 hover:bg-zeus-panel disabled:opacity-40"
              title="Arrastra sobre el mapa para dibujar un obstáculo (skylight, HVAC, etc.)"
            >
              Añadir obstáculo
            </button>
          )}

          {project.obstacles.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearObstacles();
                void runLayoutAndPvgis();
              }}
              className="rounded-md bg-rose-500/80 px-3 py-1.5 text-xs font-medium text-slate-900 shadow ring-1 ring-white/10 hover:bg-rose-500"
            >
              Borrar obstáculos ({project.obstacles.length})
            </button>
          )}

          {project.parcelGeometry?.type === "Polygon" &&
            project.parcelGeometry.coordinates.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  clearExclusionHoles();
                  void runLayoutAndPvgis();
                }}
                className="rounded-md bg-rose-500/80 px-3 py-1.5 text-xs font-medium text-slate-900 shadow ring-1 ring-white/10 hover:bg-rose-500"
              >
                Borrar zonas de exclusión
              </button>
            )}
          </>
        )}
      </div>
      {project.status !== "idle" && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md bg-zeus-panel/95 px-4 py-2 text-xs text-slate-200 shadow ring-1 ring-white/10">
          <StatusBadge status={project.status} error={project.error} />
        </div>
      )}
    </section>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: ReturnType<typeof useProjectState>["status"];
  error: string | null;
}) {
  if (status === "error") return <span className="text-red-400">Error: {error}</span>;
  if (status === "loading-parcel") return <span>Cargando parcela del Catastro…</span>;
  if (status === "computing") return <span>Calculando empaquetado de paneles…</span>;
  if (status === "loading-pvgis") return <span>Consultando producción a PVGIS…</span>;
  if (status === "ready") return <span className="text-zeus-green">Listo</span>;
  return null;
}

function bboxOf(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const rings = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of rings) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY];
}
