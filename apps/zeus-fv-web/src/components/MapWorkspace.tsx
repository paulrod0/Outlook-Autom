"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import { AddressSearch } from "./AddressSearch";
import type { GeocodeResult } from "@/lib/geocoding";

const DEFAULT_CENTER: [number, number] = [-3.7038, 40.4168]; // Madrid
const DEFAULT_ZOOM = 5.5;

export function MapWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
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
        layers: [
          {
            id: "satellite",
            type: "raster",
            source: "esri-world-imagery",
          },
        ],
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

    map.on("load", () => setReady(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const onPick = (result: GeocodeResult) => {
    const map = mapRef.current;
    if (!map) return;
    const center: [number, number] = [result.lon, result.lat];
    map.flyTo({ center, zoom: 19, speed: 1.4 });

    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new maplibregl.Marker({ color: "#22c55e" })
      .setLngLat(center)
      .addTo(map);
  };

  return (
    <section className="relative">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-4 top-4 z-10 w-[420px] max-w-[calc(100%-2rem)]">
        <AddressSearch disabled={!ready} onPick={onPick} />
      </div>
    </section>
  );
}
