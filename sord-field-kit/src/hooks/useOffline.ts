import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearPMTilesBlob,
  readPMTilesBlob,
  savePMTilesBlob,
  readSetting,
  writeSetting,
} from "../lib/storage";

export type OfflinePhase = "idle" | "downloading" | "paused" | "ready" | "error";

export interface OfflineStatus {
  phase: OfflinePhase;
  storedChunks: number;
  totalChunks: number;
  bytesStored: number;
  totalBytes?: number;
  error?: string;
}

const PREF_KEY = "offline-enabled";
const CHUNK_SIZE = 64 * 1024;

export function useOffline(pmtilesUrl: string | null) {
  const [enabled, setEnabled] = useState(() => readSetting(PREF_KEY, false));
  const [offlineBlob, setOfflineBlob] = useState<Blob | null>(null);
  const [cachedSourceUrl, setCachedSourceUrl] = useState<string | null>(null);
  const [hasCache, setHasCache] = useState(false);
  const [status, setStatus] = useState<OfflineStatus>({
    phase: "idle",
    storedChunks: 0,
    totalChunks: 0,
    bytesStored: 0,
  });

  const controllerRef = useRef<AbortController | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const record = await readPMTilesBlob();
      const blob = record?.blob ?? null;
      if (!cancelled) {
        setOfflineBlob(blob);
        setCachedSourceUrl(record?.sourceUrl ?? null);
        setHasCache(Boolean(blob));
        if (blob) {
          const chunkEstimate = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));
          setStatus({
            phase: "ready",
            storedChunks: chunkEstimate,
            totalChunks: chunkEstimate,
            bytesStored: blob.size,
            totalBytes: blob.size,
            error: undefined,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    activeUrlRef.current = pmtilesUrl;
  }, [pmtilesUrl]);

  useEffect(() => {
    writeSetting(PREF_KEY, enabled);
  }, [enabled]);

  const resetController = () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  };

  const startCaching = useCallback(async () => {
    if (!pmtilesUrl) {
      setStatus((prev) => ({
        ...prev,
        phase: "error",
        error: "No PMTiles source available",
      }));
      return;
    }
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    activeUrlRef.current = pmtilesUrl;
    setCachedSourceUrl(pmtilesUrl);
    setStatus({
      phase: "downloading",
      storedChunks: 0,
      totalChunks: 0,
      bytesStored: 0,
      totalBytes: undefined,
      error: undefined,
    });
    try {
      const response = await fetch(pmtilesUrl, { signal: controller.signal });
      if (!response.ok || !response.body) {
        throw new Error(`Unable to download tiles (${response.status})`);
      }
      const totalBytes = Number(response.headers.get("content-length") ?? "0") || undefined;
      const estimatedChunks = totalBytes ? Math.ceil(totalBytes / CHUNK_SIZE) : 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;
      let storedChunks = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        receivedBytes += value.length;
        storedChunks += Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
        setStatus({
          phase: "downloading",
          storedChunks,
          totalChunks: estimatedChunks || storedChunks,
          bytesStored: receivedBytes,
          totalBytes,
        });
      }
      const buffer = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      await savePMTilesBlob(blob, pmtilesUrl);
      setOfflineBlob(blob);
      setHasCache(true);
      setCachedSourceUrl(pmtilesUrl);
      const finalChunks = estimatedChunks || storedChunks || 1;
      setStatus({
        phase: "ready",
        storedChunks: finalChunks,
        totalChunks: finalChunks,
        bytesStored: receivedBytes || blob.size,
        totalBytes: totalBytes ?? blob.size,
        error: undefined,
      });
    } catch (error) {
      if ((error as DOMException).name === "AbortError") {
        setStatus((prev) => ({
          ...prev,
          phase: "paused",
        }));
      } else {
        console.error("Offline caching failed", error);
        setStatus((prev) => ({
          ...prev,
          phase: "error",
          error: (error as Error).message,
        }));
      }
    } finally {
      controllerRef.current = null;
    }
  }, [pmtilesUrl]);

  const pauseCaching = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
  }, []);

  const resumeCaching = useCallback(() => {
    if (!pmtilesUrl) return;
    startCaching();
  }, [pmtilesUrl, startCaching]);

  const clearCache = useCallback(async () => {
    resetController();
    await clearPMTilesBlob();
    setOfflineBlob(null);
    setCachedSourceUrl(null);
    setHasCache(false);
    setStatus({
      phase: "idle",
      storedChunks: 0,
      totalChunks: 0,
      bytesStored: 0,
      totalBytes: undefined,
      error: undefined,
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetController();
      setStatus((prev) => ({
        ...prev,
        phase: hasCache ? "ready" : "idle",
      }));
      return;
    }
    if (pmtilesUrl) {
      startCaching();
    }
  }, [enabled, pmtilesUrl, hasCache, startCaching]);

  const progress = useMemo(() => {
    if (status.totalChunks === 0) return 0;
    return Math.min(100, Math.round((status.storedChunks / status.totalChunks) * 100));
  }, [status.storedChunks, status.totalChunks]);

  return {
    enabled,
    setEnabled,
    status,
    progress,
    hasCache,
    offlineBlob,
    startCaching,
    pauseCaching,
    resumeCaching,
    clearCache,
    activeUrl: activeUrlRef.current,
    cachedSourceUrl,
  };
}
