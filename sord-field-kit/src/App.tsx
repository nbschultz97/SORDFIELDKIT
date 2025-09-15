import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapView } from "./components/MapView";
import { Controls } from "./components/Controls";
import { SettingsPanel } from "./components/SettingsPanel";
import { useWaypoints } from "./hooks/useWaypoints";
import { useOffline } from "./hooks/useOffline";
import {
  readSetting,
  writeSetting,
} from "./lib/storage";
import {
  detectObjects,
  ensureDetector,
  releaseDetector,
  type DetectionBox,
} from "./lib/ai/mediapipe";
import {
  ensureModel,
  generate,
  WebLLMNotSupportedError,
  type WebLLMProgress,
} from "./lib/ai/webllm";
import type { BasemapInfo } from "./lib/pmtiles";
import { LOCAL_PM_TILES_PATH, REMOTE_PM_TILES_URL } from "./lib/pmtiles";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type GpsPhase = "idle" | "locating" | "ready" | "error";

export default function App() {
  const { waypoints, addWaypoint, exportGeoJSON, totalDistanceMeters } =
    useWaypoints();
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({
    land: true,
    water: true,
    roads: true,
    buildings: true,
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gpsPhase, setGpsPhase] = useState<GpsPhase>("idle");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const latestPositionRef = useRef<GeolocationPosition | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const [basemapInfo, setBasemapInfo] = useState<BasemapInfo | null>(null);

  const [mediapipeEnabled, setMediapipeEnabledState] = useState(() =>
    readSetting("mediapipe-enabled", false)
  );
  const [mediapipeError, setMediapipeError] = useState<string | null>(null);
  const [mediapipeDetections, setMediapipeDetections] = useState<DetectionBox[]>(
    []
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const detectionLoopRef = useRef<number | null>(null);

  const [webllmEnabled, setWebllmEnabledState] = useState(() =>
    readSetting("webllm-enabled", false)
  );
  const [webllmLoading, setWebllmLoading] = useState(false);
  const [webllmProgress, setWebllmProgress] = useState<WebLLMProgress | null>(
    null
  );
  const [webllmError, setWebllmError] = useState<string | null>(null);
  const [webllmResponse, setWebllmResponse] = useState<string>("");

  const [installPrompt, setInstallPrompt] = useState<
    BeforeInstallPromptEvent | null
  >(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const media = window.matchMedia("(display-mode: standalone)");
    return media.matches || (navigator as any).standalone === true;
  });

  const pmtilesFetchUrl = useMemo(() => {
    if (!basemapInfo) return null;
    if (basemapInfo.usedOfflineCache) {
      if (!basemapInfo.sourceUrl.startsWith("indexeddb://")) {
        return basemapInfo.sourceUrl;
      }
      return basemapInfo.usedLocal ? LOCAL_PM_TILES_PATH : REMOTE_PM_TILES_URL;
    }
    return basemapInfo.sourceUrl;
  }, [basemapInfo]);

  const offline = useOffline(pmtilesFetchUrl);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsPhase("error");
      setGpsError("Geolocation unsupported on this device.");
      return;
    }
    setGpsPhase("locating");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latestPositionRef.current = position;
        setGpsPhase("ready");
        setGpsError(null);
      },
      (error) => {
        setGpsPhase("error");
        setGpsError(error.message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    writeSetting("mediapipe-enabled", mediapipeEnabled);
  }, [mediapipeEnabled]);

  useEffect(() => {
    writeSetting("webllm-enabled", webllmEnabled);
  }, [webllmEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    const media = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => {
      setIsInstalled(media.matches || (navigator as any).standalone === true);
    };
    media.addEventListener?.("change", updateInstalled);
    window.addEventListener("appinstalled", updateInstalled);
    updateInstalled();
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handler as EventListener
      );
      media.removeEventListener?.("change", updateInstalled);
      window.removeEventListener("appinstalled", updateInstalled);
    };
  }, []);

  const stopMediaPipe = useCallback(() => {
    if (detectionLoopRef.current) {
      cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setMediapipeDetections([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  const drawDetections = useCallback((boxes: DetectionBox[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;
    if (width === 0 || height === 0) return;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.font = "14px sans-serif";
    boxes.forEach((box) => {
      const x = box.bbox.x * width;
      const y = box.bbox.y * height;
      const w = box.bbox.width * width;
      const h = box.bbox.height * height;
      ctx.strokeStyle = "#5dc1b9";
      ctx.strokeRect(x, y, w, h);
      const label = `${box.label} ${(box.score * 100).toFixed(0)}%`;
      const padding = 4;
      const textWidth = ctx.measureText(label).width + padding * 2;
      ctx.fillStyle = "rgba(9, 18, 33, 0.75)";
      ctx.fillRect(x, Math.max(0, y - 22), textWidth, 22);
      ctx.fillStyle = "#f5f7fb";
      ctx.fillText(label, x + padding, Math.max(12, y - 6));
    });
  }, []);

  useEffect(() => {
    let active = true;
    const start = async () => {
      if (!mediapipeEnabled) {
        stopMediaPipe();
        releaseDetector();
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMediapipeError("Camera API unavailable in this browser.");
        return;
      }
      try {
        setMediapipeError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaStreamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        await ensureDetector();
        const loop = async () => {
          if (!active) return;
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const boxes = await detectObjects(videoRef.current);
              if (!active) return;
              setMediapipeDetections(boxes);
              drawDetections(boxes);
            } catch (error) {
              console.error("MediaPipe detection failed", error);
            }
          }
          detectionLoopRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (error) {
        const message =
          error instanceof DOMException
            ? error.message
            : (error as Error).message;
        setMediapipeError(message || "Camera access denied.");
        stopMediaPipe();
      }
    };
    start();
    return () => {
      active = false;
      stopMediaPipe();
      releaseDetector();
    };
  }, [mediapipeEnabled, drawDetections, stopMediaPipe]);

  useEffect(() => {
    if (!webllmEnabled) {
      setWebllmProgress(null);
      setWebllmResponse("");
      return;
    }
    if (!("gpu" in navigator)) {
      setWebllmError("WebGPU not available on this device/browser.");
      return;
    }
    setWebllmLoading(true);
    setWebllmError(null);
    ensureModel((progress) => setWebllmProgress(progress))
      .then(() => setWebllmLoading(false))
      .catch((error) => {
        setWebllmLoading(false);
        if (error instanceof WebLLMNotSupportedError) {
          setWebllmError(error.message);
        } else {
          setWebllmError((error as Error).message);
        }
      });
  }, [webllmEnabled]);

  const handleLocate = useCallback(() => {
    const map = mapInstanceRef.current;
    const coords = latestPositionRef.current?.coords;
    if (!map) return;
    if (coords) {
      map.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: Math.max(map.getZoom(), 15),
        speed: 1.2,
      });
    } else {
      setGpsPhase("locating");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          latestPositionRef.current = position;
          setGpsPhase("ready");
          setGpsError(null);
          map.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: 15,
            speed: 1.2,
          });
        },
        (error) => {
          setGpsPhase("error");
          setGpsError(error.message);
        }
      );
    }
  }, []);

  const handleAddWaypoint = useCallback(() => {
    const coords = latestPositionRef.current?.coords;
    if (!coords) {
      setGpsError("No GPS fix yet. Move to open sky and retry.");
      setGpsPhase("locating");
      return;
    }
    addWaypoint({
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
    });
  }, [addWaypoint]);

  const handleLayerVisibility = useCallback((key: string, visible: boolean) => {
    setLayerVisibility((prev) => ({ ...prev, [key]: visible }));
  }, []);

  const handleWebllmPrompt = useCallback(
    (prompt: string) => {
      if (!webllmEnabled) return;
      setWebllmLoading(true);
      setWebllmError(null);
      generate(prompt, (progress) => setWebllmProgress(progress))
        .then((response) => {
          setWebllmResponse(response);
          setWebllmLoading(false);
        })
        .catch((error) => {
          setWebllmLoading(false);
          if (error instanceof WebLLMNotSupportedError) {
            setWebllmError(error.message);
          } else {
            setWebllmError((error as Error).message);
          }
        });
    },
    [webllmEnabled]
  );

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  const gpsLabel = (() => {
    switch (gpsPhase) {
      case "ready":
        return "GPS fix";
      case "locating":
        return "GPS locating…";
      case "error":
        return gpsError ? `GPS error` : "GPS error";
      default:
        return "GPS idle";
    }
  })();

  const tilesLabel = (() => {
    if (offline.status.phase === "ready" && offline.hasCache) return "Tiles ready";
    if (offline.status.phase === "downloading")
      return `Tiles ${offline.progress}%`;
    if (offline.status.phase === "paused")
      return `Tiles paused ${offline.progress}%`;
    if (offline.hasCache) return "Tiles cached";
    return "Tiles live";
  })();

  const pwaLabel = isInstalled
    ? "PWA installed"
    : installPrompt
    ? "Install available"
    : "Browser mode";

  const shouldShowInstallToast = !isInstalled && installPrompt !== null;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>SORD Field Kit</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="icon-button" onClick={handleLocate}>
            📍 Locate
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setIsSettingsOpen((prev) => !prev)}
          >
            ⚙️ Settings
          </button>
        </div>
      </header>
      <div className="map-container">
        <MapView
          waypoints={waypoints}
          visibleLayers={layerVisibility}
          offlineBlob={offline.offlineBlob}
          offlineSourceUrl={offline.cachedSourceUrl}
          onMapReady={(map, info) => {
            mapInstanceRef.current = map;
            setBasemapInfo(info);
          }}
          onSourceChanged={(info) => setBasemapInfo(info)}
        />
        <Controls
          onAddWaypoint={handleAddWaypoint}
          onExportWaypoints={exportGeoJSON}
          onLayerVisibilityChange={handleLayerVisibility}
          layerVisibility={layerVisibility}
          hasWaypoints={waypoints.length > 0}
          totalDistanceMeters={totalDistanceMeters}
        />
      </div>
      <SettingsPanel
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        offline={{
          enabled: offline.enabled,
          onToggle: offline.setEnabled,
          status: offline.status,
          progress: offline.progress,
          hasCache: offline.hasCache,
          onPause: offline.pauseCaching,
          onResume: offline.resumeCaching,
          onClear: offline.clearCache,
          activeUrl:
            offline.cachedSourceUrl ?? pmtilesFetchUrl ?? undefined,
        }}
        mediapipe={{
          enabled: mediapipeEnabled,
          onToggle: setMediapipeEnabledState,
          error: mediapipeError,
          detections: mediapipeDetections,
          videoRef,
          canvasRef,
        }}
        webllm={{
          enabled: webllmEnabled,
          onToggle: setWebllmEnabledState,
          loading: webllmLoading,
          progress: webllmProgress,
          response: webllmResponse,
          error: webllmError,
          onPrompt: handleWebllmPrompt,
        }}
      />
      <div className="status-pill">
        <span>
          📡 <strong>{gpsLabel}</strong>
        </span>
        <span>
          🗺️ <strong>{tilesLabel}</strong>
        </span>
        <span>
          📱 <strong>{pwaLabel}</strong>
        </span>
      </div>
      {shouldShowInstallToast && (
        <div className="install-toast">
          <div>Install this app for full offline support.</div>
          <button type="button" onClick={handleInstall}>
            Install app
          </button>
        </div>
      )}
    </div>
  );
}
