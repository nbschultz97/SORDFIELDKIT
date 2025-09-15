import { useEffect, useRef, useState } from 'react'
import maplibregl, { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PMTiles, Protocol as PMProtocol } from 'pmtiles'

const DEMO_PM = 'https://demotiles.maplibre.org/tiles/planet.pmtiles'

export default function MapView() {
  const el = useRef<HTMLDivElement|null>(null)
  const mapRef = useRef<Map|null>(null)
  const [status, setStatus] = useState('ready')
  const [wps, setWps] = useState<{lng:number,lat:number}[]>([])

  useEffect(() => {
    if (!el.current || mapRef.current) return

    // PMTiles protocol
    const protocol = new PMProtocol((key)=>new PMTiles(key))
    maplibregl.addProtocol('pmtiles', protocol.tile)

    const pick = async () => {
      const local = '/SORDFIELDKIT/tiles/basemap.pmtiles'
      try { const r = await fetch(local, { method: 'HEAD' }); return r.ok ? local : DEMO_PM }
      catch { return DEMO_PM }
    }

    (async () => {
      const src = await pick()
      const map = new maplibregl.Map({
        container: el.current!,
        style: {
          version: 8,
          sources: { pm: { type: 'vector', url: `pmtiles://${src}`, attribution:'© OpenStreetMap' } },
          layers: [
            { id:'bg', type:'background', paint:{ 'background-color':'#0b0b0b' } },
            { id:'land', type:'fill', source:'pm', 'source-layer':'land', paint:{ 'fill-color':'#2a2a2a' } }
          ]
        },
        center: [-98.5, 39.8],
        zoom: 4
      })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ visualizePitch:true }), 'top-right')
      setStatus(src===DEMO_PM ? 'demo tiles' : 'local tiles')
    })()

    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  const locate = () => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15 })
        addWp([longitude, latitude])
      },
      () => alert('Location permission denied')
    )
  }

  const addWp = (lnglat?:[number,number]) => {
    if (!mapRef.current) return
    const pt = lnglat ?? (mapRef.current.getCenter().toArray() as [number,number])
    new maplibregl.Marker().setLngLat(pt).addTo(mapRef.current)
    setWps(v=>[...v,{lng:pt[0],lat:pt[1]}])
  }

  const exportGeoJSON = () => {
    const fc = { type:'FeatureCollection',
      features: wps.map(w=>({ type:'Feature', geometry:{ type:'Point', coordinates:[w.lng,w.lat] }, properties:{} }))
    }
    const blob = new Blob([JSON.stringify(fc,null,2)], { type:'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'waypoints.geojson'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{height:'100%',position:'relative'}}>
      <div ref={el} style={{position:'absolute',inset:0}} />
      <div style={{position:'absolute',left:12,top:12,display:'flex',gap:8,
        background:'rgba(0,0,0,0.55)',padding:'8px 10px',borderRadius:8,color:'#fff'}}>
        <button onClick={locate}>📍 Locate</button>
        <button onClick={()=>addWp()}>➕ Waypoint</button>
        <button onClick={exportGeoJSON}>⬇️ Export</button>
        <span style={{opacity:.8}}>tiles: {status}</span>
      </div>
    </div>
  )
}
