import maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { PMTiles, Protocol, FileSource } from "pmtiles";

export const LOCAL_PM_TILES_PATH = "/tiles/basemap.pmtiles";
export const REMOTE_PM_TILES_URL =
  "https://pmtiles.io/protomaps(vector)ODbL_firenze.pmtiles";

let protocolInstance: Protocol | null = null;
let protocolRegistered = false;

function ensureProtocol(): Protocol {
  if (!protocolInstance) {
    protocolInstance = new Protocol({ metadata: true });
  }
  if (!protocolRegistered) {
    maplibregl.addProtocol("pmtiles", (request, controller) =>
      protocolInstance!.tile(request, controller)
    );
    protocolRegistered = true;
  }
  return protocolInstance!;
}

async function hasLocalPMTiles(): Promise<boolean> {
  try {
    const resp = await fetch(LOCAL_PM_TILES_PATH, { method: "HEAD" });
    return resp.ok;
  } catch (error) {
    console.warn("Local PMTiles lookup failed", error);
    return false;
  }
}

export interface BasemapInfo {
  /** URL passed to the PMTiles constructor. */
  sourceUrl: string;
  /** URL registered with MapLibre (pmtiles://...). */
  tileUrl: string;
  /** True if a local file path or unknown cached blob was used. */
  usedLocal: boolean;
  /** True if the archive came from IndexedDB. */
  usedOfflineCache: boolean;
}

export async function resolvePMTiles(
  offlineBlob?: Blob | null,
  offlineSourceUrl?: string | null
): Promise<{ pmtiles: PMTiles; info: BasemapInfo }> {
  const protocol = ensureProtocol();
  if (offlineBlob) {
    const file = new File([offlineBlob], "offline-basemap.pmtiles", {
      type: "application/octet-stream",
    });
    const pmtiles = new PMTiles(new FileSource(file));
    protocol.add(pmtiles);
    const sourceUrl =
      offlineSourceUrl && offlineSourceUrl.trim().length > 0
        ? offlineSourceUrl
        : "indexeddb://offline-basemap";
    const usedLocal =
      sourceUrl === LOCAL_PM_TILES_PATH || sourceUrl.startsWith("indexeddb://");
    return {
      pmtiles,
      info: {
        sourceUrl,
        tileUrl: `pmtiles://${pmtiles.source.getKey()}`,
        usedLocal,
        usedOfflineCache: true,
      },
    };
  }

  const useLocal = await hasLocalPMTiles();
  const sourceUrl = useLocal ? LOCAL_PM_TILES_PATH : REMOTE_PM_TILES_URL;
  const pmtiles = new PMTiles(sourceUrl);
  protocol.add(pmtiles);
  return {
    pmtiles,
    info: {
      sourceUrl,
      tileUrl: `pmtiles://${pmtiles.source.getKey()}`,
      usedLocal: useLocal,
      usedOfflineCache: false,
    },
  };
}

export function addVectorSource(
  map: Map,
  sourceId: string,
  tileUrl: string,
  attribution?: string
) {
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
  map.addSource(sourceId, {
    type: "vector",
    url: tileUrl,
    attribution,
  });
}
