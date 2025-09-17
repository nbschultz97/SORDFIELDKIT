import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import maplibregl, { type AnyLayer, type Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PMTiles, Protocol as PMProtocol } from 'pmtiles'

const LOCAL_PM_CANDIDATES = ['/SORDFIELDKIT/tiles/basemap.pmtiles', '/tiles/basemap.pmtiles']
const DEMO_PM = 'https://demotiles.maplibre.org/tiles/planet.pmtiles'
const STORAGE_KEY = 'vantage-scanner:waypoints'
const DEFAULT_THEME: ThemeKey = 'dark'

type ThemeKey = 'dark' | 'muted' | 'contrast'

type WaypointSource = 'manual' | 'gps'

interface Theme {
  name: string
  background: string
  land: string
  water: string
  roads: string
  building: string
  boundary: string
  text: string
  textHalo: string
}

const THEMES: Record<ThemeKey, Theme> = {
  dark: {
    name: 'Dark Ops',
    background: '#030712',
    land: '#1b2a38',
    water: '#0f4470',
    roads: '#f3f6fb',
    building: '#c87a35',
    boundary: '#6c8195',
    text: '#f5f9ff',
    textHalo: '#0b101a'
  },
  muted: {
    name: 'Muted Terrain',
    background: '#0c1014',
    land: '#253026',
    water: '#1c3f57',
    roads: '#f0e9da',
    building: '#d6c09a',
    boundary: '#7a8c7a',
    text: '#f0e9da',
    textHalo: '#1c1f23'
  },
  contrast: {
    name: 'High Contrast',
    background: '#010203',
    land: '#1c1c1c',
    water: '#0a2c5f',
    roads: '#ffffff',
    building: '#ff8800',
    boundary: '#ffcc00',
    text: '#ffffff',
    textHalo: '#000000'
  }
}

const LAYER_LABELS: Record<string, string> = {
  land: 'Land',
  water: 'Water',
  roads: 'Roads',
  buildings: 'Buildings',
  boundaries: 'Boundaries',
  labels: 'Labels'
}

interface LayerDescriptor {
  key: keyof typeof LAYER_LABELS
  matches: string[]
  type: AnyLayer['type']
  paint: (theme: Theme) => Record<string, unknown>
  layout?: (theme: Theme) => Record<string, unknown>
  minzoom?: number
  maxzoom?: number
}

const LAYER_DESCRIPTORS: LayerDescriptor[] = [
  {
    key: 'land',
    matches: ['land', 'earth', 'park', 'landuse', 'landcover'],
    type: 'fill',
    paint: (theme) => ({
      'fill-color': theme.land,
      'fill-opacity': 0.65
    })
  },
  {
    key: 'water',
    matches: ['water'],
    type: 'fill',
    paint: (theme) => ({
      'fill-color': theme.water,
      'fill-opacity': 0.75
    })
  },
  {
    key: 'roads',
    matches: ['road', 'transport', 'transportation'],
    type: 'line',
    paint: (theme) => ({
      'line-color': theme.roads,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5, 0.4,
        10, 1.6,
        13, 3.2,
        16, 5
      ],
      'line-opacity': 0.85
    })
  },
  {
    key: 'buildings',
    matches: ['building'],
    type: 'fill',
    paint: (theme) => ({
      'fill-color': theme.building,
      'fill-opacity': 0.6
    }),
    minzoom: 13
  },
  {
    key: 'boundaries',
    matches: ['boundary', 'admin'],
    type: 'line',
    paint: (theme) => ({
      'line-color': theme.boundary,
      'line-width': 1,
      'line-dasharray': [4, 3],
      'line-opacity': 0.5
    }),
    minzoom: 3
  },
  {
    key: 'labels',
    matches: ['label', 'place'],
    type: 'symbol',
    paint: (theme) => ({
      'text-color': theme.text,
      'text-halo-color': theme.textHalo,
      'text-halo-width': 1.2
    }),
    layout: () => ({
      'text-field': [
        'coalesce',
        ['get', 'name'],
        ['get', 'name_en'],
        ['get', 'ref']
      ],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5, 11,
        12, 16
      ],
      'text-letter-spacing': 0.02,
      'symbol-placement': 'point'
    }),
    minzoom: 4
  }
]

interface Waypoint {
  id: string
  lng: number
  lat: number
  label: string
  createdAt: number
  source: WaypointSource
  accuracy?: number
}

interface Coordinates {
  lng: number
  lat: number
}

const SOURCE_ICON: Record<WaypointSource, string> = {
  manual: '🧭',
  gps: '📡'
}

const timeFormatter = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' })
  : null

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `wp-${Math.random().toString(36).slice(2, 10)}`
}

function formatCoord(value: number): string {
  return value.toFixed(5)
}

function formatTimestamp(value: number): string {
  if (timeFormatter) {
    return timeFormatter.format(new Date(value))
  }
  return new Date(value).toISOString()
}

function metersBetween(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function bearingBetween(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`
  }
  if (meters >= 100) {
    return `${meters.toFixed(0)} m`
  }
  return `${meters.toFixed(1)} m`
}

function formatBearing(bearing: number | null): string {
  if (bearing === null || Number.isNaN(bearing)) {
    return '—'
  }
  return `${Math.round(bearing)}°`
}

function totalDistance(waypoints: Waypoint[]): number {
  let sum = 0
  for (let i = 1; i < waypoints.length; i += 1) {
    sum += metersBetween(waypoints[i - 1], waypoints[i])
  }
  return sum
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.click()
  URL.revokeObjectURL(url)
}

function createMarkerElement(waypoint: Waypoint): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'wp-marker'
  wrapper.dataset.source = waypoint.source

  const core = document.createElement('div')
  core.className = 'wp-marker__core'
  wrapper.appendChild(core)

  const label = document.createElement('span')
  label.className = 'wp-marker__label'
  label.textContent = waypoint.label
  wrapper.appendChild(label)

  wrapper.title = `${waypoint.label}\n${formatCoord(waypoint.lat)}, ${formatCoord(waypoint.lng)}`
  return wrapper
}

function updateMarkerElement(element: HTMLElement, waypoint: Waypoint) {
  element.dataset.source = waypoint.source
  const label = element.querySelector('.wp-marker__label')
  if (label) {
    label.textContent = waypoint.label
  }
  element.title = `${waypoint.label}\n${formatCoord(waypoint.lat)}, ${formatCoord(waypoint.lng)}`
}

function loadStoredWaypoints(): Waypoint[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item, index): Waypoint | null => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const candidate = item as Partial<Waypoint>
        if (typeof candidate.lat !== 'number' || typeof candidate.lng !== 'number') {
          return null
        }
        return {
          id: typeof candidate.id === 'string' ? candidate.id : makeId(),
          lat: candidate.lat,
          lng: candidate.lng,
          label:
            typeof candidate.label === 'string' && candidate.label.trim().length > 0
              ? candidate.label
              : `WP-${String(index + 1).padStart(2, '0')}`,
          createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
          source: candidate.source === 'gps' ? 'gps' : 'manual',
          accuracy: typeof candidate.accuracy === 'number' ? candidate.accuracy : undefined
        }
      })
      .filter((item): item is Waypoint => Boolean(item))
  } catch (error) {
    console.warn('Failed to restore cached waypoints', error)
    return []
  }
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const layerIdsRef = useRef<Record<string, string>>({})
  const protocolRef = useRef<PMProtocol | null>(null)
  const protocolRegisteredRef = useRef(false)
  const sourceUrlRef = useRef<string | null>(null)
  const themeRef = useRef<Theme>(THEMES[DEFAULT_THEME])
  const enabledLayersRef = useRef<Record<string, boolean>>({})

  const [status, setStatus] = useState('Bootstrapping map…')
  const [mapReady, setMapReady] = useState(false)
  const [tileDetails, setTileDetails] = useState('')
  const [availableLayers, setAvailableLayers] = useState<string[]>([])
  const [waypoints, setWaypoints] = useState<Waypoint[]>(loadStoredWaypoints)
  const [themeKey, setThemeKey] = useState<ThemeKey>(DEFAULT_THEME)
  const [enabledLayers, setEnabledLayers] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    LAYER_DESCRIPTORS.forEach((descriptor) => {
      initial[descriptor.key] = true
    })
    enabledLayersRef.current = initial
    return initial
  })
  const [tileSource, setTileSource] = useState<'local' | 'remote'>('remote')
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null)
  const [geolocationError, setGeolocationError] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number; zoom: number } | null>(null)

  useEffect(() => {
    enabledLayersRef.current = enabledLayers
  }, [enabledLayers])

  const applyTheme = useCallback(() => {
    const map = mapRef.current
    if (!map) {
      return
    }
    const theme = themeRef.current
    if (map.getLayer('background')) {
      map.setPaintProperty('background', 'background-color', theme.background)
    }
    LAYER_DESCRIPTORS.forEach((descriptor) => {
      const layerId = layerIdsRef.current[descriptor.key]
      if (!layerId || !map.getLayer(layerId)) {
        return
      }
      const paint = descriptor.paint(theme)
      Object.entries(paint).forEach(([prop, value]) => {
        map.setPaintProperty(layerId, prop, value as any)
      })
      if (descriptor.layout) {
        const layout = descriptor.layout(theme)
        Object.entries(layout).forEach(([prop, value]) => {
          if (prop === 'visibility') return
          map.setLayoutProperty(layerId, prop, value as any)
        })
      }
    })
  }, [])

  useEffect(() => {
    themeRef.current = THEMES[themeKey]
    applyTheme()
  }, [themeKey, applyTheme])

  const removeLayers = useCallback((map: Map) => {
    Object.values(layerIdsRef.current).forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId)
      }
    })
    layerIdsRef.current = {}
    if (map.getSource('pm')) {
      map.removeSource('pm')
    }
  }, [])

  const installBasemap = useCallback(
    async (map: Map, src: string) => {
      if (!src) {
        return
      }
      if (sourceUrlRef.current === src && map.getSource('pm')) {
        applyTheme()
        return
      }
      sourceUrlRef.current = src

      const pmtiles = new PMTiles(src)
      protocolRef.current?.add(pmtiles)

      let headerSummary = ''
      try {
        const header = await pmtiles.getHeader()
        headerSummary = `z${header.minZoom}-${header.maxZoom}`
      } catch (error) {
        console.warn('Failed to inspect PMTiles header', error)
      }

      let vectorLayers: { id: string }[] = []
      try {
        const metadata = (await pmtiles.getMetadata()) as { vector_layers?: { id: string }[] }
        vectorLayers = metadata?.vector_layers ?? []
      } catch (error) {
        console.warn('PMTiles metadata unavailable', error)
      }

      removeLayers(map)

      map.addSource('pm', {
        type: 'vector',
        url: `pmtiles://${src}`,
        attribution: '© OpenStreetMap contributors'
      })

      const matched: string[] = []
      const theme = themeRef.current

      LAYER_DESCRIPTORS.forEach((descriptor) => {
        const sourceLayer = vectorLayers.find((candidate) =>
          descriptor.matches.some((needle) => candidate.id.toLowerCase().includes(needle))
        )
        if (!sourceLayer) {
          return
        }
        const layerId = `pm-${descriptor.key}`
        const layoutProps: Record<string, unknown> = descriptor.layout ? descriptor.layout(theme) : {}
        layoutProps.visibility = (enabledLayersRef.current[descriptor.key] ?? true) ? 'visible' : 'none'

        const layer: AnyLayer = {
          id: layerId,
          type: descriptor.type,
          source: 'pm',
          'source-layer': sourceLayer.id,
          paint: descriptor.paint(theme),
          layout: layoutProps
        } as AnyLayer

        if (descriptor.minzoom !== undefined) {
          layer.minzoom = descriptor.minzoom
        }
        if (descriptor.maxzoom !== undefined) {
          layer.maxzoom = descriptor.maxzoom
        }

        if (map.getLayer(layerId)) {
          map.removeLayer(layerId)
        }
        map.addLayer(layer)
        layerIdsRef.current[descriptor.key] = layerId
        matched.push(descriptor.key)
      })

      setAvailableLayers(matched)
      setEnabledLayers((prev) => {
        const next = { ...prev }
        matched.forEach((key) => {
          if (next[key] === undefined) {
            next[key] = true
          }
        })
        return next
      })

      const detailParts = [] as string[]
      if (headerSummary) {
        detailParts.push(headerSummary)
      }
      if (matched.length) {
        detailParts.push(`${matched.length} layers`)
      }
      setTileDetails(detailParts.join(' • '))

      applyTheme()
    },
    [applyTheme, removeLayers]
  )

  const pickSource = useCallback(async () => {
    for (const candidate of LOCAL_PM_CANDIDATES) {
      try {
        const response = await fetch(candidate, { method: 'HEAD' })
        if (response.ok) {
          return { src: candidate, mode: 'local' as const }
        }
      } catch (error) {
        console.warn('Local PMTiles probe failed', error)
      }
    }
    return { src: DEMO_PM, mode: 'remote' as const }
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }
    const protocol = new PMProtocol((key) => new PMTiles(key))
    protocolRef.current = protocol
    if (!protocolRegisteredRef.current) {
      maplibregl.addProtocol('pmtiles', protocol.tile)
      protocolRegisteredRef.current = true
    }

    let cancelled = false

    const bootstrap = async () => {
      setStatus('Checking for offline basemap…')
      const { src, mode } = await pickSource()
      if (cancelled) return
      setTileSource(mode)
      setStatus(mode === 'local' ? 'Loading local tiles…' : 'Streaming demo tiles…')

      const initialCenter = waypoints.length
        ? [waypoints[waypoints.length - 1].lng, waypoints[waypoints.length - 1].lat]
        : [-98.5, 39.8]
      const initialZoom = waypoints.length ? 13 : 4

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': themeRef.current.background }
            }
          ],
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
        },
        center: initialCenter as [number, number],
        zoom: initialZoom,
        attributionControl: false,
        cooperativeGestures: true
      })

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

      mapRef.current = map

      map.once('load', () => {
        installBasemap(map, src)
          .then(() => {
            if (cancelled) return
            setMapReady(true)
            setStatus(mode === 'local' ? 'Local tiles ready' : 'Demo tiles ready')
          })
          .catch((error) => {
            console.error('Basemap load failed', error)
            if (cancelled) return
            setStatus('Basemap failed to load')
          })
      })
    }

    bootstrap()

    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current.clear()
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      layerIdsRef.current = {}
      setAvailableLayers([])
      setMapReady(false)
      sourceUrlRef.current = null
      if (protocolRegisteredRef.current && typeof (maplibregl as any).removeProtocol === 'function') {
        ;(maplibregl as any).removeProtocol('pmtiles')
        protocolRegisteredRef.current = false
      }
    }
  }, [installBasemap, pickSource, waypoints])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(waypoints))
    } catch (error) {
      console.warn('Failed to persist waypoints', error)
    }
  }, [waypoints])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }
    const seen = new Set<string>()
    waypoints.forEach((wp) => {
      let marker = markersRef.current.get(wp.id)
      if (!marker) {
        const element = createMarkerElement(wp)
        marker = new maplibregl.Marker({ element, anchor: 'bottom' })
          .setLngLat([wp.lng, wp.lat])
          .addTo(map)
        markersRef.current.set(wp.id, marker)
      } else {
        marker.setLngLat([wp.lng, wp.lat])
        updateMarkerElement(marker.getElement(), wp)
      }
      seen.add(wp.id)
    })
    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    })
  }, [waypoints])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }
    Object.entries(enabledLayers).forEach(([key, visible]) => {
      const layerId = layerIdsRef.current[key]
      if (!layerId || !map.getLayer(layerId)) {
        return
      }
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    })
  }, [enabledLayers])

  useEffect(() => {
    if (!mapReady) {
      setMapCenter(null)
      return
    }
    const map = mapRef.current
    if (!map) {
      return
    }
    const update = () => {
      const center = map.getCenter()
      setMapCenter({ lat: center.lat, lng: center.lng, zoom: map.getZoom() })
    }
    map.on('moveend', update)
    update()
    return () => {
      map.off('moveend', update)
    }
  }, [mapReady])

  const addWaypoint = useCallback(
    (lnglat?: [number, number], meta?: Partial<Pick<Waypoint, 'label' | 'source' | 'accuracy'>>) => {
      const map = mapRef.current
      if (!lnglat && !map) {
        return
      }
      const center = lnglat ?? (map?.getCenter().toArray() as [number, number])
      setWaypoints((prev) => {
        const label = meta?.label ?? `WP-${String(prev.length + 1).padStart(2, '0')}`
        const source: WaypointSource = meta?.source ?? 'manual'
        const next: Waypoint = {
          id: makeId(),
          lng: center[0],
          lat: center[1],
          label,
          source,
          createdAt: Date.now(),
          accuracy: meta?.accuracy
        }
        return [...prev, next]
      })
      setStatus(meta?.source === 'gps' ? 'Waypoint logged from GPS' : 'Waypoint recorded')
    },
    []
  )

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGeolocationError('Geolocation unavailable')
      setStatus('No geolocation hardware')
      return
    }
    setGeolocationError(null)
    setStatus('Requesting GPS fix…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        setLastFix({ lat: latitude, lng: longitude, accuracy: accuracy ?? undefined })
        addWaypoint([longitude, latitude], { source: 'gps', accuracy: accuracy ?? undefined })
        const map = mapRef.current
        if (map) {
          map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom() ?? 14, 15), essential: true })
        }
      },
      (error) => {
        setGeolocationError(error.message || 'Location failed')
        setStatus(`GPS error: ${error.message || 'failed'}`)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const focusWaypoint = (waypoint: Waypoint) => {
    const map = mapRef.current
    if (!map) {
      return
    }
    map.flyTo({ center: [waypoint.lng, waypoint.lat], zoom: Math.max(map.getZoom() ?? 13, 15), duration: 700 })
    setStatus(`Centered on ${waypoint.label}`)
  }

  const removeWaypoint = (id: string) => {
    setWaypoints((prev) => prev.filter((wp) => wp.id !== id))
    setStatus('Waypoint removed')
  }

  const renameWaypoint = (waypoint: Waypoint) => {
    const next = window.prompt('Waypoint label', waypoint.label)
    if (!next) {
      return
    }
    const trimmed = next.trim()
    if (!trimmed) {
      return
    }
    setWaypoints((prev) => prev.map((wp) => (wp.id === waypoint.id ? { ...wp, label: trimmed } : wp)))
    setStatus('Waypoint renamed')
  }

  const clearWaypoints = () => {
    if (!waypoints.length) {
      return
    }
    const confirmed = window.confirm('Clear all recorded waypoints?')
    if (!confirmed) {
      return
    }
    setWaypoints([])
    setLastFix(null)
    setStatus('Waypoint log cleared')
  }

  const exportGeoJSON = () => {
    if (!waypoints.length) {
      return
    }
    const collection = {
      type: 'FeatureCollection',
      features: waypoints.map((wp) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [wp.lng, wp.lat] },
        properties: {
          label: wp.label,
          timestamp: new Date(wp.createdAt).toISOString(),
          source: wp.source,
          accuracy: wp.accuracy ?? null
        }
      }))
    }
    downloadBlob(new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' }), 'waypoints.geojson')
    setStatus('Exported GeoJSON')
  }

  const exportCSV = () => {
    if (!waypoints.length) {
      return
    }
    const header = 'label,lat,lng,timestamp,source,accuracy_m\n'
    const rows = waypoints
      .map((wp) => {
        const parts = [
          JSON.stringify(wp.label),
          wp.lat.toFixed(6),
          wp.lng.toFixed(6),
          new Date(wp.createdAt).toISOString(),
          wp.source,
          wp.accuracy !== undefined ? wp.accuracy.toFixed(2) : ''
        ]
        return parts.join(',')
      })
      .join('\n')
    downloadBlob(new Blob([header + rows], { type: 'text/csv' }), 'waypoints.csv')
    setStatus('Exported CSV')
  }

  const lastLeg = useMemo(() => {
    if (waypoints.length < 2) {
      return null
    }
    const a = waypoints[waypoints.length - 2]
    const b = waypoints[waypoints.length - 1]
    return {
      distance: metersBetween(a, b),
      bearing: bearingBetween(a, b)
    }
  }, [waypoints])

  const totalPath = useMemo(() => totalDistance(waypoints), [waypoints])

  const handleLayerToggle = (key: string) => (event: ChangeEvent<HTMLInputElement>) => {
    setEnabledLayers((prev) => ({ ...prev, [key]: event.target.checked }))
  }

  return (
    <div className="map-root">
      <div ref={containerRef} className="map-canvas" />

      <div className="hud hud--top-left">
        <div className="panel panel--compact">
          <div className="panel__row">
            <button type="button" onClick={locate}>📡 Fix</button>
            <button type="button" onClick={() => addWaypoint()}>➕ Waypoint</button>
            <button type="button" onClick={exportGeoJSON} disabled={!waypoints.length}>⬇️ GeoJSON</button>
            <button type="button" onClick={exportCSV} disabled={!waypoints.length}>📄 CSV</button>
          </div>
          <div className="panel__row panel__row--meta">
            <span>{tileSource === 'local' ? 'Tiles: local archive' : 'Tiles: demo stream'}</span>
            {tileDetails && <span>• {tileDetails}</span>}
          </div>
          <div className="panel__row panel__row--meta">
            <span>{status}</span>
          </div>
          {lastFix && (
            <div className="panel__row panel__row--meta">
              <span>
                Last fix {formatCoord(lastFix.lat)}, {formatCoord(lastFix.lng)}
              </span>
              {typeof lastFix.accuracy === 'number' && <span>±{Math.round(lastFix.accuracy)} m</span>}
            </div>
          )}
          {geolocationError && <div className="panel__row panel__row--alert">{geolocationError}</div>}
          {mapCenter && (
            <div className="panel__row panel__row--meta">
              <span>
                Map center {formatCoord(mapCenter.lat)}, {formatCoord(mapCenter.lng)} (z {mapCenter.zoom.toFixed(1)})
              </span>
            </div>
          )}
        </div>

        <div className="panel panel--compact">
          <label className="panel__label">
            Theme
            <select value={themeKey} onChange={(event) => setThemeKey(event.target.value as ThemeKey)}>
              {(Object.entries(THEMES) as [ThemeKey, Theme][]).map(([key, theme]) => (
                <option value={key} key={key}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          {availableLayers.length > 0 && (
            <div className="layer-toggles">
              {availableLayers.map((key) => (
                <label key={key} className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={enabledLayers[key] ?? true}
                    onChange={handleLayerToggle(key)}
                  />
                  <span>{LAYER_LABELS[key] ?? key}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hud hud--right">
        <div className="panel panel--log">
          <div className="panel__header">
            <strong>Waypoints ({waypoints.length})</strong>
            <div className="panel__actions">
              <button type="button" onClick={clearWaypoints} disabled={!waypoints.length}>
                🗑 Clear
              </button>
            </div>
          </div>
          <div className="panel__metrics">
            <span>Total {formatDistance(totalPath)}</span>
            {lastLeg && (
              <span>
                Last {formatDistance(lastLeg.distance)} @ {formatBearing(lastLeg.bearing)}
              </span>
            )}
          </div>
          <ul className="waypoint-list">
            {waypoints.map((wp, index) => {
              const previous = index > 0 ? waypoints[index - 1] : null
              const segmentDistance = previous ? metersBetween(previous, wp) : null
              const segmentBearing = previous ? bearingBetween(previous, wp) : null
              return (
                <li key={wp.id} className="waypoint-list__item">
                  <div className="waypoint-list__row">
                    <span className="waypoint-list__label">
                      {SOURCE_ICON[wp.source]} {wp.label}
                    </span>
                    <span className="waypoint-list__time">{formatTimestamp(wp.createdAt)}</span>
                  </div>
                  <div className="waypoint-list__row waypoint-list__row--meta">
                    <span>
                      {formatCoord(wp.lat)}, {formatCoord(wp.lng)}
                    </span>
                    {wp.accuracy !== undefined && <span>±{Math.round(wp.accuracy)} m</span>}
                  </div>
                  {segmentDistance !== null && (
                    <div className="waypoint-list__row waypoint-list__row--meta">
                      <span>{formatDistance(segmentDistance)}</span>
                      <span>{formatBearing(segmentBearing)}</span>
                    </div>
                  )}
                  <div className="waypoint-list__actions">
                    <button type="button" onClick={() => focusWaypoint(wp)}>
                      Center
                    </button>
                    <button type="button" onClick={() => renameWaypoint(wp)}>
                      Rename
                    </button>
                    <button type="button" onClick={() => removeWaypoint(wp.id)}>
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
            {!waypoints.length && <li className="waypoint-list__empty">No waypoints logged yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
