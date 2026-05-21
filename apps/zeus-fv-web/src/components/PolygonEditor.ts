"use client";

import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import maplibregl from "maplibre-gl";

/**
 * Editor de vértices sobre el polígono activo de la parcela.
 *
 * Acciones:
 *  - Arrastrar un vértice → mueve el vértice y dispara onChange.
 *  - Doble click en un vértice → lo elimina (si quedan ≥ 4 puntos en el anillo).
 *  - Click en un mango entre dos vértices → inserta un vértice en ese punto.
 *
 * Sólo soporta `Polygon` (no MultiPolygon). El anillo editable es el
 * exterior; los interiores (huecos) se mantienen sin tocar.
 */
export class PolygonEditor {
  private map: MapLibreMap;
  private vertexMarkers: Marker[] = [];
  private midpointMarkers: Marker[] = [];
  private onChange: (polygon: GeoJSON.Polygon) => void;
  private currentPolygon: GeoJSON.Polygon | null = null;

  constructor(
    map: MapLibreMap,
    onChange: (polygon: GeoJSON.Polygon) => void,
  ) {
    this.map = map;
    this.onChange = onChange;
  }

  setPolygon(polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null) {
    this.clear();
    if (!polygon) {
      this.currentPolygon = null;
      return;
    }

    // Trabajamos siempre con Polygon. Si entra MultiPolygon, editamos el
    // primero (caso raro en Catastro urbano y suficiente para el MVP).
    const poly: GeoJSON.Polygon =
      polygon.type === "Polygon"
        ? polygon
        : { type: "Polygon", coordinates: polygon.coordinates[0] };

    this.currentPolygon = poly;
    this.render();
  }

  destroy() {
    this.clear();
  }

  private clear() {
    for (const m of this.vertexMarkers) m.remove();
    for (const m of this.midpointMarkers) m.remove();
    this.vertexMarkers = [];
    this.midpointMarkers = [];
  }

  private render() {
    if (!this.currentPolygon) return;
    this.clear();
    const ring = this.currentPolygon.coordinates[0];
    // El último punto de un anillo cerrado es duplicado del primero.
    const pointCount = ring.length - 1;

    for (let i = 0; i < pointCount; i++) {
      this.addVertexMarker(i);
      const next = (i + 1) % pointCount;
      this.addMidpointMarker(i, next);
    }
  }

  private addVertexMarker(index: number) {
    if (!this.currentPolygon) return;
    const ring = this.currentPolygon.coordinates[0];
    const [lon, lat] = ring[index];

    const el = document.createElement("div");
    el.className =
      "h-3 w-3 cursor-grab rounded-full border-2 border-white bg-emerald-500 shadow ring-1 ring-black/30 hover:scale-125 transition-transform";
    el.title = "Arrastra para mover · Doble click para eliminar";

    const marker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat([lon, lat])
      .addTo(this.map);

    marker.on("drag", () => {
      const { lng, lat: latNew } = marker.getLngLat();
      this.updateVertex(index, [lng, latNew], /* commit */ false);
    });

    marker.on("dragend", () => {
      const { lng, lat: latNew } = marker.getLngLat();
      this.updateVertex(index, [lng, latNew], /* commit */ true);
    });

    el.addEventListener("dblclick", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      this.deleteVertex(index);
    });

    this.vertexMarkers.push(marker);
  }

  private addMidpointMarker(i: number, j: number) {
    if (!this.currentPolygon) return;
    const ring = this.currentPolygon.coordinates[0];
    const a = ring[i];
    const b = ring[j];
    const mid: GeoJSON.Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    const el = document.createElement("div");
    el.className =
      "h-2 w-2 cursor-pointer rounded-full border border-white/80 bg-emerald-500/60 hover:bg-emerald-400 hover:scale-150 transition-transform";
    el.title = "Click para añadir vértice aquí";

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([mid[0], mid[1]])
      .addTo(this.map);

    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      this.insertVertex(j, mid);
    });

    this.midpointMarkers.push(marker);
  }

  private updateVertex(index: number, coord: GeoJSON.Position, commit: boolean) {
    if (!this.currentPolygon) return;
    const ring = this.currentPolygon.coordinates[0];
    ring[index] = coord;
    // Si es el primer vértice, hay que actualizar también el de cierre.
    if (index === 0) {
      ring[ring.length - 1] = coord;
    }
    if (commit) {
      this.emit();
    } else {
      // Durante el drag refrescamos sólo los midpoints adyacentes.
      this.refreshMidpointsAround(index);
    }
  }

  private deleteVertex(index: number) {
    if (!this.currentPolygon) return;
    const ring = this.currentPolygon.coordinates[0];
    // Anillo cerrado: ring.length - 1 vértices únicos. Mínimo 3.
    if (ring.length - 1 <= 3) return;

    ring.splice(index, 1);
    // Si quitamos el primero, hay que volver a cerrar el anillo con el nuevo primero.
    if (index === 0) {
      ring[ring.length - 1] = ring[0];
    }
    this.emit();
  }

  private insertVertex(insertAt: number, coord: GeoJSON.Position) {
    if (!this.currentPolygon) return;
    const ring = this.currentPolygon.coordinates[0];
    ring.splice(insertAt, 0, coord);
    this.emit();
  }

  private refreshMidpointsAround(_index: number) {
    // Lo más sencillo: re-render completo. El coste es bajo (≤200 markers).
    this.render();
  }

  private emit() {
    if (!this.currentPolygon) return;
    this.render();
    this.onChange({
      type: "Polygon",
      coordinates: this.currentPolygon.coordinates.map((r) => r.map((p) => [...p])),
    });
  }
}
