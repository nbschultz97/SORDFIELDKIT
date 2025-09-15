import { useCallback, useEffect, useMemo, useState } from "react";
import { getDistance } from "geolib";

export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  label: string;
  createdAt: number;
}

export interface WaypointInput {
  lat: number;
  lng: number;
  accuracy?: number;
}

const STORAGE_KEY = "sord-field-kit:waypoints";

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function useWaypoints() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as Waypoint[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Unable to parse stored waypoints", error);
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(waypoints));
    } catch (error) {
      console.warn("Failed to persist waypoints", error);
    }
  }, [waypoints]);

  const addWaypoint = useCallback((input: WaypointInput) => {
    setWaypoints((prev) => {
      const nextIndex = prev.length + 1;
      const label = `WP-${String(nextIndex).padStart(2, "0")}`;
      const wp: Waypoint = {
        id: createId(),
        lat: input.lat,
        lng: input.lng,
        accuracy: input.accuracy,
        label,
        createdAt: Date.now(),
      };
      return [...prev, wp];
    });
  }, []);

  const removeWaypoint = useCallback((id: string) => {
    setWaypoints((prev) => prev.filter((wp) => wp.id !== id));
  }, []);

  const clearWaypoints = useCallback(() => {
    setWaypoints([]);
  }, []);

  const updateWaypoint = useCallback((id: string, patch: Partial<Waypoint>) => {
    setWaypoints((prev) =>
      prev.map((wp) => (wp.id === id ? { ...wp, ...patch } : wp))
    );
  }, []);

  const exportGeoJSON = useCallback(() => {
    if (waypoints.length === 0) return;
    const featureCollection = {
      type: "FeatureCollection",
      features: waypoints.map((wp) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [wp.lng, wp.lat],
        },
        properties: {
          id: wp.id,
          label: wp.label,
          createdAt: wp.createdAt,
          accuracy: wp.accuracy ?? null,
        },
      })),
    };
    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sord-field-kit-waypoints-${new Date()
      .toISOString()
      .replace(/[:]/g, "-")}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [waypoints]);

  const totalDistanceMeters = useMemo(() => {
    if (waypoints.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < waypoints.length; i += 1) {
      const prev = waypoints[i - 1];
      const current = waypoints[i];
      total += getDistance(
        { latitude: prev.lat, longitude: prev.lng },
        { latitude: current.lat, longitude: current.lng }
      );
    }
    return total;
  }, [waypoints]);

  return {
    waypoints,
    addWaypoint,
    removeWaypoint,
    updateWaypoint,
    clearWaypoints,
    exportGeoJSON,
    totalDistanceMeters,
  };
}
