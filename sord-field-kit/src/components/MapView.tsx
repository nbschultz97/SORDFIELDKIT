import { useCallback, useEffect, useRef } from "react";
import maplibregl, { type LayerSpecification, type Map as MapLibreMap } from "maplibre-gl";
import { addVectorSource, resolvePMTiles, type BasemapInfo } from "../lib/pmtiles";
import type { Waypoint } from "../hooks/useWaypoints";

const SOURCE_ID = "basemap";

interface LayerDescriptor {
  key: string;
  matches: string[];
  build: (sourceLayer: string) => LayerSpecification;
}

const LAYERS: LayerDescriptor[] = [
  {
    key: "land",
    matches: ["land", "earth", "park"],
    build: (sourceLayer) => ({
      id: "basemap-land",
      type: "fill",
      source: SOURCE_ID,
      "source-layer": sourceLayer,
      paint: {
        "fill-color": "#1e2a36",
        "fill-opacity": 0.55,
      },
    }),
  },
  {
    key: "water",
    matches: ["water"],
    build: (sourceLayer) => ({
      id: "basemap-water",
      type: "fill",
      source: SOURCE_ID,
      "source-layer": sourceLayer,
      paint: {
        "fill-color": "#2f8edb",
        "fill-opacity": 0.6,
      },
    }),
  },
  {
    key: "roads",
    matches: ["road", "transport"],
    build: (sourceLayer) => ({
      id: "basemap-roads",
      type: "line",
      source: SOURCE_ID,
      "source-layer": sourceLayer,
      paint: {
        "line-color": "#f1f3f5",
        "line-width": 1.2,
      },
    }),
  },
  {
    key: "buildings",
    matches: ["building"],
    build: (sourceLayer) => ({
      id: "basemap-buildings",
      type: "fill",
      source: SOURCE_ID,
      "source-layer": sourceLayer,
      paint: {
        "fill-color": "#d29b4b",
        "fill-opacity": 0.55,
      },
    }),
  },
];

interface MapViewProps {
  waypoints: Waypoint[];
  visibleLayers: Record<string, boolean>;
  onMapReady?: (map: MapLibreMap, info: BasemapInfo) => void;
  offlineBlob: Blob | null;
  offlineSourceUrl: string | null;
  onSourceChanged?: (info: BasemapInfo) => void;
}

export function MapView({
  waypoints,
  visibleLayers,
  onMapReady,
  offlineBlob,
  offlineSourceUrl,
  onSourceChanged,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const layerIdsRef = useRef<Record<string, string>>({});
  const offlineBlobRef = useRef<Blob | null>(offlineBlob);
  const offlineSourceUrlRef = useRef<string | null>(offlineSourceUrl);
  const readyAnnouncedRef = useRef(false);

  const removeLayerCollection = useCallback((map: MapLibreMap) => {
    Object.values(layerIdsRef.current).forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });
    layerIdsRef.current = {};
  }, []);

  const installBasemap = useCallback(
    async (map: MapLibreMap, blob: Blob | null) => {
      const { pmtiles, info } = await resolvePMTiles(
        blob,
        blob ? offlineSourceUrlRef.current : null
      );
      removeLayerCollection(map);
      addVectorSource(map, SOURCE_ID, info.tileUrl, "© OpenStreetMap, © Protomaps");
      try {
        const metadata = (await pmtiles.getMetadata()) as {
          vector_layers?: { id: string }[];
        };
        const available = metadata?.vector_layers?.map((item) => item.id) ?? [];
        LAYERS.forEach((descriptor) => {
          const sourceLayer = available.find((id) =>
            descriptor.matches.some((needle) => id.toLowerCase().includes(needle))
          );
          if (!sourceLayer) return;
          const layerSpec = descriptor.build(sourceLayer);
          if (map.getLayer(layerSpec.id)) {
            map.removeLayer(layerSpec.id);
          }
          map.addLayer(layerSpec);
          layerIdsRef.current[descriptor.key] = layerSpec.id;
        });
      } catch (error) {
        console.warn("Failed to read PMTiles metadata", error);
      }
      if (onSourceChanged) {
        onSourceChanged(info);
      }
      if (onMapReady && !readyAnnouncedRef.current) {
        onMapReady(map, info);
        readyAnnouncedRef.current = true;
      }
    },
    [onMapReady, onSourceChanged, removeLayerCollection]
  );

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) {
      return;
    }
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#091221" },
          },
        ],
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      },
      center: [12.4964, 41.9028],
      zoom: 11,
      attributionControl: false,
      cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      installBasemap(map, offlineBlobRef.current).catch((error) =>
        console.error("Basemap load failed", error)
      );
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      readyAnnouncedRef.current = false;
    };
  }, [installBasemap]);

  useEffect(() => {
    offlineBlobRef.current = offlineBlob;
    offlineSourceUrlRef.current = offlineSourceUrl;
    const map = mapRef.current;
    if (!map) return;
    installBasemap(map, offlineBlob).catch((error) =>
      console.error("Failed to switch PMTiles source", error)
    );
  }, [offlineBlob, offlineSourceUrl, installBasemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    waypoints.forEach((wp) => {
      let marker = markersRef.current.get(wp.id);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "waypoint-marker";
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([wp.lng, wp.lat])
          .addTo(map);
        markersRef.current.set(wp.id, marker);
      } else {
        marker.setLngLat([wp.lng, wp.lat]);
      }
      seen.add(wp.id);
    });
    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });
  }, [waypoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.entries(visibleLayers).forEach(([key, visible]) => {
      const layerId = layerIdsRef.current[key];
      if (!layerId || !map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    });
  }, [visibleLayers]);

  return <div ref={mapContainer} className="map-container" />;
}
