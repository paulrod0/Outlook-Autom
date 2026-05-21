"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import { AddressSearch } from "./AddressSearch";
import { PolygonEditor } from "./PolygonEditor";
import type { GeocodeResult } from "@/lib/geocoding";
import { runFromPoint, runLayoutAndPvgis } from "@/lib/pipeline";
import { setState, useProjectState } from "@/lib/store";

const DEFAULT_CENTER: [number, number] = [-3.7038, 40.4168];
const DEFAULT_ZOOM = 5.5;

const PARCEL_SOURCE = "zeus-parcel";
const PANELS_SOURCE = "zeus-panels";

export function MapWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const editorRef = useRef<PolygonEditor | null>(null);
  const editModeRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [editMode, setEditMode] = useState(false);
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
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: PARCEL_SOURCE,
        paint: {
          "line-color": "#22c55e",
          "line-width": 2,
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
      map.addLayer({
        id: "panels-line",
        type: "line",
        source: PANELS_SOURCE,
        paint: { "line-color": "#0f172a", "line-width": 0.4 },
      });

      setReady(true);
    });

    map.on("click", (e) => {
      // En modo edición, los clicks los gestionan los handles del editor.
      if (editModeRef.current) return;
      const { lat, lng } = e.lngLat;
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new maplibregl.Marker({ color: "#22c55e" })
        .setLngLat([lng, lat])
        .addTo(map);
      void runFromPoint(lat, lng);
    });

    mapRef.current = map;

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
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

    panelsSrc.setData({
      type: "FeatureCollection",
      features: project.layout?.panels ?? [],
    });
  }, [project.layout, ready]);

  const onPick = (result: GeocodeResult) => {
    const map = mapRef.current;
    if (!map) return;
    const center: [number, number] = [result.lon, result.lat];
    map.flyTo({ center, zoom: 19, speed: 1.4 });
  };

  const canEdit = !!project.parcelGeometry;

  return (
    <section className="relative">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-4 top-4 z-10 w-[420px] max-w-[calc(100%-2rem)]">
        <AddressSearch disabled={!ready} onPick={onPick} />
        <p className="mt-2 rounded-md bg-zeus-panel/90 px-3 py-1.5 text-[11px] text-slate-300 shadow ring-1 ring-white/5">
          {editMode
            ? "Arrastra los puntos verdes · Doble click para borrar · Click en un punto pequeño para añadir."
            : "Haz clic sobre una cubierta para cargar la parcela catastral."}
        </p>
      </div>
      {canEdit && (
        <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium shadow ring-1 ring-white/10 ${
              editMode
                ? "bg-amber-500 text-slate-900 hover:bg-amber-400"
                : "bg-zeus-panel/95 text-slate-200 hover:bg-zeus-panel"
            }`}
          >
            {editMode ? "Terminar edición" : "Editar polígono"}
          </button>
        </div>
      )}
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
