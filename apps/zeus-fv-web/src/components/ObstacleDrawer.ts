"use client";

import maplibregl, { Map as MapLibreMap } from "maplibre-gl";

/**
 * Dibuja obstáculos rectangulares sobre la cubierta (skylights, HVAC,
 * chimeneas, etc.). El usuario hace mousedown en una esquina y arrastra
 * hasta la opuesta. Al soltar, devolvemos el rectángulo como GeoJSON
 * Polygon.
 *
 * El layout respeta los obstáculos al colocar paneles (panelLayout.ts).
 */

const SOURCE_ID = "zeus-obstacle-preview";
const FILL_LAYER = "zeus-obstacle-preview-fill";
const LINE_LAYER = "zeus-obstacle-preview-line";

export class ObstacleDrawer {
  private map: MapLibreMap;
  private start: [number, number] | null = null;
  private active = false;
  private onCommit: (polygon: GeoJSON.Polygon) => void;
  private onCancel: () => void;

  private mouseDown = (e: maplibregl.MapMouseEvent) => {
    if (!this.active) return;
    e.preventDefault();
    this.start = [e.lngLat.lng, e.lngLat.lat];
    this.map.dragPan.disable();
  };

  private mouseMove = (e: maplibregl.MapMouseEvent) => {
    if (!this.active || !this.start) return;
    this.updatePreview([e.lngLat.lng, e.lngLat.lat]);
  };

  private mouseUp = (e: maplibregl.MapMouseEvent) => {
    if (!this.active || !this.start) return;
    const end: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    const polygon = this.rectangleFrom(this.start, end);
    this.start = null;
    this.cleanupListeners();
    this.updatePreview(null);
    this.map.dragPan.enable();
    this.map.getCanvas().style.cursor = "";
    this.active = false;
    // Sólo confirmamos si el rectángulo tiene un área mínima razonable
    if (this.minSidePx(polygon) < 6) {
      this.onCancel();
      return;
    }
    this.onCommit(polygon);
  };

  constructor(
    map: MapLibreMap,
    onCommit: (polygon: GeoJSON.Polygon) => void,
    onCancel: () => void,
  ) {
    this.map = map;
    this.onCommit = onCommit;
    this.onCancel = onCancel;
    this.ensureLayers();
  }

  isActive() {
    return this.active;
  }

  start_() {
    this.active = true;
    this.map.getCanvas().style.cursor = "crosshair";
    this.map.on("mousedown", this.mouseDown);
    this.map.on("mousemove", this.mouseMove);
    this.map.on("mouseup", this.mouseUp);
  }

  cancel() {
    this.cleanupListeners();
    this.updatePreview(null);
    this.start = null;
    this.active = false;
    this.map.dragPan.enable();
    this.map.getCanvas().style.cursor = "";
  }

  destroy() {
    this.cancel();
    if (this.map.getLayer(FILL_LAYER)) this.map.removeLayer(FILL_LAYER);
    if (this.map.getLayer(LINE_LAYER)) this.map.removeLayer(LINE_LAYER);
    if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
  }

  private cleanupListeners() {
    this.map.off("mousedown", this.mouseDown);
    this.map.off("mousemove", this.mouseMove);
    this.map.off("mouseup", this.mouseUp);
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
      paint: {
        "fill-color": "#f43f5e",
        "fill-opacity": 0.3,
      },
    });
    this.map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": "#f43f5e",
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });
  }

  private updatePreview(end: [number, number] | null) {
    const src = this.map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    if (!this.start || !end) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const poly = this.rectangleFrom(this.start, end);
    src.setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: poly, properties: {} }],
    });
  }

  private rectangleFrom(
    a: [number, number],
    b: [number, number],
  ): GeoJSON.Polygon {
    const minLng = Math.min(a[0], b[0]);
    const maxLng = Math.max(a[0], b[0]);
    const minLat = Math.min(a[1], b[1]);
    const maxLat = Math.max(a[1], b[1]);
    return {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    };
  }

  private minSidePx(polygon: GeoJSON.Polygon): number {
    const ring = polygon.coordinates[0];
    const p0 = this.map.project(ring[0] as [number, number]);
    const p1 = this.map.project(ring[1] as [number, number]);
    const p2 = this.map.project(ring[2] as [number, number]);
    return Math.min(
      Math.abs(p1.x - p0.x),
      Math.abs(p2.y - p1.y),
    );
  }
}
