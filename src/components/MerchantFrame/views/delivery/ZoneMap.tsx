// Leaflet Map (OpenStreetMap tiles) for delivery zones.
//
// Single component for two use cases: general overview (read-only polygons,
// colored by status, click = select) and drawer editor (draggable vertices:
// click on map adds, drag moves, click on vertex deletes).
//
// The map is created ONCE and layers are recreated when props change: filtering
// the table does not reload the map or lose user framing.

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DeliveryZone } from '../../../../types/delivery';
import {
  ZONE_STATUS_META,
  leafletRings,
  zoneCode,
  zoneGeometry,
  type LatLng,
} from '../../../../lib/delivery-zones';

export interface ZoneMapHandle {
  center: () => LatLng;
  focus: (point: LatLng, zoom?: number) => void;
}

interface ZoneMapProps {
  zones: DeliveryZone[];
  selectedZoneId?: number | null;
  onSelectZone?: (zoneId: number) => void;
  /** Perimeter being edited; null/undefined = editor inactive. */
  editVertices?: LatLng[] | null;
  onVerticesChange?: (vertices: LatLng[]) => void;
  /** Click on map (add vertex, set radius center...). */
  onMapClick?: (point: LatLng) => void;
  /** Queried point for geofence check. */
  marker?: { point: LatLng; inside: boolean } | null;
  /** Change this value to re-fit all zones. */
  fitKey?: string | number;
  height?: number;
  ariaLabel: string;
  onReady?: (handle: ZoneMapHandle) => void;
}

const PRIMARY = '#ae001a';
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const vertexIcon = L.divIcon({
  className: '',
  // Background styling via classes so hover can fill node with brand color.
  html: `<span class="zone-vertex block rounded-full bg-white text-[#5f5e5e] hover:bg-[#ae001a] hover:text-primary! transition-colors duration-200" style="width:14px;height:14px;border:3px solid ${PRIMARY};box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:grab"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export const ZoneMap: React.FC<ZoneMapProps> = ({
  zones,
  selectedZoneId,
  onSelectZone,
  editVertices,
  onVerticesChange,
  onMapClick,
  marker,
  fitKey,
  height = 420,
  ariaLabel,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const editLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  // Handlers change on each render; Leaflet events always read latest reference.
  const handlersRef = useRef({ onSelectZone, onVerticesChange, onMapClick, editVertices });
  useEffect(() => {
    handlersRef.current = { onSelectZone, onVerticesChange, onMapClick, editVertices };
  });

  // ---------- Initial mount ----------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      worldCopyJump: true,
    });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    zonesLayerRef.current = L.layerGroup().addTo(map);
    editLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      handlersRef.current.onMapClick?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    mapRef.current = map;
    onReady?.({
      center: () => {
        const c = map.getCenter();
        return { lat: c.lat, lng: c.lng };
      },
      focus: (point, zoom = 14) => map.setView([point.lat, point.lng], zoom),
    });

    // Container may mount inside an animating drawer.
    const resize = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(resize);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Read-only zones ----------
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    zones.forEach((zone) => {
      const geometry = zoneGeometry(zone);
      if (!geometry) return;
      const color = ZONE_STATUS_META[zone.status]?.color ?? '#64748b';
      const selected = zone.id === selectedZoneId;
      const polygon = L.polygon(leafletRings(geometry), {
        color: selected ? PRIMARY : color,
        weight: selected ? 4 : 2,
        fillColor: color,
        fillOpacity: selected ? 0.35 : 0.18,
        dashArray: zone.status === 'active' ? undefined : '6 6',
      });
      polygon.bindTooltip(`${zoneCode(zone.id)} · ${zone.name}`, { sticky: true });
      polygon.on('click', (event: L.LeafletMouseEvent) => {
        if (!handlersRef.current.onSelectZone) return;
        L.DomEvent.stopPropagation(event);
        handlersRef.current.onSelectZone(zone.id);
      });
      polygon.addTo(layer);
    });
  }, [zones, selectedZoneId]);

  // ---------- Framing ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = L.latLngBounds([]);
    zones.forEach((zone) => {
      const geometry = zoneGeometry(zone);
      if (geometry) leafletRings(geometry).flat(2).forEach((p) => bounds.extend(p));
    });
    (editVertices ?? []).forEach((v) => bounds.extend([v.lat, v.lng]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    // Only re-fit on fitKey change: re-framing on every dragged vertex would cause jarring motion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // ---------- Vertex editor ----------
  useEffect(() => {
    const layer = editLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!editVertices) return;

    const latlngs = editVertices.map((v) => [v.lat, v.lng] as [number, number]);
    if (latlngs.length >= 3) {
      L.polygon(latlngs, { color: PRIMARY, weight: 3, fillColor: PRIMARY, fillOpacity: 0.15 }).addTo(layer);
    } else if (latlngs.length === 2) {
      L.polyline(latlngs, { color: PRIMARY, weight: 3, dashArray: '4 6' }).addTo(layer);
    }

    editVertices.forEach((vertex, index) => {
      const handle = L.marker([vertex.lat, vertex.lng], {
        icon: vertexIcon,
        draggable: true,
        keyboard: false,
        title: `Vertex ${index + 1} — drag to move, click to delete`,
      });
      handle.on('dragend', () => {
        const { lat, lng } = handle.getLatLng();
        const current = handlersRef.current.editVertices ?? [];
        handlersRef.current.onVerticesChange?.(
          current.map((v, i) => (i === index ? { lat, lng } : v)),
        );
      });
      handle.on('click', (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event);
        const current = handlersRef.current.editVertices ?? [];
        handlersRef.current.onVerticesChange?.(current.filter((_, i) => i !== index));
      });
      handle.addTo(layer);
    });
  }, [editVertices]);

  // ---------- Geofence marker point ----------
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!marker) return;
    L.circleMarker([marker.point.lat, marker.point.lng], {
      radius: 9,
      color: '#fff',
      weight: 3,
      fillColor: marker.inside ? '#10b981' : PRIMARY,
      fillOpacity: 1,
    }).addTo(layer);
    mapRef.current?.panTo([marker.point.lat, marker.point.lng]);
  }, [marker]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      data-testid="zone-map"
      // `isolate`: Leaflet panes use z-index 400-1000 and without stacking context
      // would render above fixed headers and NavHubBar.
      className="w-full rounded border border-[#e8e2d8] isolate z-0 bg-[#ece8e0]"
      style={{ height }}
    />
  );
};

export default ZoneMap;
