"use client";

import maplibregl, { Map as MapLibreMap } from "maplibre-gl";

/**
 * Dibujado de una zona de exclusión (hole) sobre el polígono actual.
 *
 * Flujo:
 *   start()        → entra en modo dibujo, cada click del mapa añade un vértice.
 *   commit()       → cierra el anillo y devuelve la geometría del hole.
 *                    Devuelve null si hay menos de 3 puntos.
 *   cancel()       → descarta lo dibujado.
 *
 * Pinta un preview en una source/layer propia mientras se dibuja.
 */

const SOURCE_ID = "zeus-hole-preview";
const LINE_LAYER = "zeus-hole-preview-line";
const POINT_LAYER = "zeus-hole-preview-points";

export class HoleDrawer {
  private map: MapLibreMap;
  private vertices: GeoJSON.Position[] = [];
  private active = false;
  private onChange: () => void;
  private clickHandler = (e: maplibregl.MapMouseEvent) => {
    this.vertices.push([e.lngLat.lng, e.lngLat.lat]);
    this.updatePreview();
    this.onChange();
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
    this.active = true;
    this.map.getCanvas().style.cursor = "crosshair";
    this.map.on("click", this.clickHandler);
    this.updatePreview();
  }

  cancel() {
    this.cleanup();
  }

  commit(): GeoJSON.Position[] | null {
    if (this.vertices.length < 3) {
      this.cleanup();
      return null;
    }
    const ring = [...this.vertices, this.vertices[0]];
    this.cleanup();
    return ring;
  }

  destroy() {
    this.cleanup();
    if (this.map.getLayer(POINT_LAYER)) this.map.removeLayer(POINT_LAYER);
    if (this.map.getLayer(LINE_LAYER)) this.map.removeLayer(LINE_LAYER);
    if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
  }

  private cleanup() {
    this.active = false;
    this.map.off("click", this.clickHandler);
    this.map.getCanvas().style.cursor = "";
    this.vertices = [];
    this.updatePreview();
  }

  private ensureLayers() {
    if (this.map.getSource(SOURCE_ID)) return;
    this.map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    this.map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", "$type", "LineString"],
      paint: {
        "line-color": "#f59e0b",
        "line-width": 2,
        "line-dasharray": [1, 1.5],
      },
    });
    this.map.addLayer({
      id: POINT_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#f59e0b",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1.5,
      },
    });
  }

  private updatePreview() {
    const src = this.map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = [];
    for (const v of this.vertices) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: v },
        properties: {},
      });
    }
    if (this.vertices.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates:
            this.vertices.length >= 3
              ? [...this.vertices, this.vertices[0]]
              : this.vertices,
        },
        properties: {},
      });
    }
    src.setData({ type: "FeatureCollection", features });
  }
}
