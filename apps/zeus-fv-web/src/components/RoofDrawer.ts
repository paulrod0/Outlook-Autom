"use client";

import * as turf from "@turf/turf";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";

/**
 * Trazado manual de la cubierta desde cero, vértice a vértice.
 *
 * Soluciona el desfase entre el polígono que devuelve Catastro y la
 * imagen satélite real: el comercial pincha cada esquina del tejado y
 * obtenemos el polígono exacto que se ve.
 *
 * Flujo:
 *   start()      → entra en modo dibujo; cada click añade un vértice
 *   commit()     → cierra el anillo (≥ 3 puntos) y devuelve el polígono
 *   cancel()     → descarta
 *
 * Mientras se dibuja, mostramos:
 *  - Puntos en cada vértice
 *  - Línea entre vértices consecutivos
 *  - Línea "fantasma" desde el último vértice hasta el cursor
 *  - Etiqueta con longitud (m) y ángulo (°) de la última arista
 */

const SOURCE_ID = "zeus-roof-draw";
const FILL_LAYER = "zeus-roof-draw-fill";
const LINE_LAYER = "zeus-roof-draw-line";
const POINT_LAYER = "zeus-roof-draw-points";
const FIRST_POINT_LAYER = "zeus-roof-draw-first";
const LABEL_LAYER = "zeus-roof-draw-labels";

export class RoofDrawer {
  private map: MapLibreMap;
  private vertices: GeoJSON.Position[] = [];
  private active = false;
  private hover: GeoJSON.Position | null = null;
  private onChange: () => void;

  private clickHandler = (e: maplibregl.MapMouseEvent) => {
    const point: GeoJSON.Position = [e.lngLat.lng, e.lngLat.lat];
    // Si hace click sobre el primer vértice y ya hay ≥ 3 → cerramos
    if (this.vertices.length >= 3) {
      const first = this.vertices[0];
      const distPx = this.distancePx(first, point);
      if (distPx < 14) {
        // Disparamos commit a través de onChange con un flag
        this.onChange();
        return;
      }
    }
    this.vertices.push(point);
    this.updatePreview();
    this.onChange();
  };

  private mouseMoveHandler = (e: maplibregl.MapMouseEvent) => {
    this.hover = [e.lngLat.lng, e.lngLat.lat];
    if (this.vertices.length > 0) {
      this.updatePreview();
    }
  };

  private keyHandler = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.key === "Escape") {
      this.onChange(); // permite al UI cancelar
    } else if (e.key === "Enter") {
      this.onChange(); // permite al UI commitear
    } else if (e.key === "Backspace" || e.key === "Delete") {
      this.vertices.pop();
      this.updatePreview();
      this.onChange();
    }
  };

  constructor(map: MapLibreMap, onChange: () => void) {
    this.map = map;
    this.onChange = onChange;
    this.ensureLayers();
  }

  isActive() {
    return this.active;
  }

  pointCount() {
    return this.vertices.length;
  }

  start() {
    this.vertices = [];
    this.hover = null;
    this.active = true;
    this.map.getCanvas().style.cursor = "crosshair";
    this.map.on("click", this.clickHandler);
    this.map.on("mousemove", this.mouseMoveHandler);
    window.addEventListener("keydown", this.keyHandler);
    this.updatePreview();
  }

  cancel() {
    this.cleanup();
  }

  commit(): GeoJSON.Polygon | null {
    if (this.vertices.length < 3) {
      this.cleanup();
      return null;
    }
    const ring: GeoJSON.Position[] = [...this.vertices, this.vertices[0]];
    this.cleanup();
    return { type: "Polygon", coordinates: [ring] };
  }

  destroy() {
    this.cleanup();
    [POINT_LAYER, FIRST_POINT_LAYER, LINE_LAYER, FILL_LAYER, LABEL_LAYER].forEach(
      (id) => {
        if (this.map.getLayer(id)) this.map.removeLayer(id);
      },
    );
    if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
  }

  private cleanup() {
    this.active = false;
    this.map.off("click", this.clickHandler);
    this.map.off("mousemove", this.mouseMoveHandler);
    window.removeEventListener("keydown", this.keyHandler);
    this.map.getCanvas().style.cursor = "";
    this.vertices = [];
    this.hover = null;
    this.updatePreview();
  }

  private ensureLayers() {
    if (this.map.getSource(SOURCE_ID)) return;
    this.map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    this.map.addLayer({
      id: FILL_LAYER,
      type: "fill",
      source: SOURCE_ID,
      filter: ["==", "$type", "Polygon"],
      paint: { "fill-color": "#1FBFE8", "fill-opacity": 0.18 },
    });
    this.map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", "$type", "LineString"],
      paint: {
        "line-color": "#1FBFE8",
        "line-width": 2.5,
      },
    });
    this.map.addLayer({
      id: POINT_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: [
        "all",
        ["==", "$type", "Point"],
        ["!=", ["get", "kind"], "first"],
        ["!=", ["get", "kind"], "label"],
      ],
      paint: {
        "circle-radius": 5,
        "circle-color": "#1FBFE8",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    });
    this.map.addLayer({
      id: FIRST_POINT_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["all", ["==", "$type", "Point"], ["==", ["get", "kind"], "first"]],
      paint: {
        "circle-radius": 8,
        "circle-color": "#22c55e",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    });
    this.map.addLayer({
      id: LABEL_LAYER,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "label"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-font": ["Open Sans Bold"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-offset": [0, -0.8],
      },
      paint: {
        "text-color": "#fff",
        "text-halo-color": "#0F2A4D",
        "text-halo-width": 2,
      },
    });
  }

  private updatePreview() {
    const src = this.map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = [];

    // Polígono parcialmente dibujado (relleno).
    if (this.vertices.length >= 3) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[...this.vertices, this.vertices[0]]],
        },
        properties: {},
      });
    }

    // Línea entre vértices (incluido el segmento fantasma al cursor).
    if (this.vertices.length >= 1) {
      const line: GeoJSON.Position[] = [...this.vertices];
      if (this.hover) line.push(this.hover);
      if (this.vertices.length >= 2) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: line },
          properties: {},
        });
      } else if (this.hover) {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [this.vertices[0], this.hover],
          },
          properties: {},
        });
      }
    }

    // Vértices.
    this.vertices.forEach((v, i) => {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: v },
        properties: { kind: i === 0 ? "first" : "vertex" },
      });
    });

    // Etiquetas de longitud + ángulo del último segmento y, si hover, del fantasma.
    const allSegments: Array<[GeoJSON.Position, GeoJSON.Position]> = [];
    for (let i = 0; i < this.vertices.length - 1; i++) {
      allSegments.push([this.vertices[i], this.vertices[i + 1]]);
    }
    if (this.vertices.length > 0 && this.hover) {
      allSegments.push([this.vertices[this.vertices.length - 1], this.hover]);
    }
    for (const [a, b] of allSegments) {
      const length = turf.distance(turf.point(a), turf.point(b), {
        units: "meters",
      });
      const bearing = turf.bearing(turf.point(a), turf.point(b));
      const normalized = ((bearing + 360) % 360).toFixed(0);
      const mid: GeoJSON.Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: mid },
        properties: {
          kind: "label",
          label: `${length.toFixed(2)} m · ${normalized}°`,
        },
      });
    }

    src.setData({ type: "FeatureCollection", features });
  }

  private distancePx(a: GeoJSON.Position, b: GeoJSON.Position): number {
    const pa = this.map.project([a[0], a[1]]);
    const pb = this.map.project([b[0], b[1]]);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  }
}
