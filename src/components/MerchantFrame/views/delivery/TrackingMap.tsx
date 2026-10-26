// Radar Leaflet (teselas de OpenStreetMap) de la flota en reparto.
//
// Igual que ZoneMap: el mapa se crea UNA vez y las capas se actualizan con las props. Los
// marcadores se reutilizan por asignación (`setLatLng` al llegar una posición nueva) y el
// icono sólo se rehace cuando cambia su estilo: el reloj de 1 s no repinta nada.

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DeliveryZone } from '../../../../types/delivery';
import type { RoutePoint } from '../../../../types/delivery-tracking';
import { leafletRings, zoneGeometry } from '../../../../lib/delivery-zones';
import { TRACKING_COLORS, markerHtml, type MarkerStyle } from '../../../../lib/delivery-tracking';

export interface TrackingMarker {
  id: number;
  lat: number;
  lng: number;
  style: MarkerStyle;
  title: string;
}

interface TrackingMapProps {
  markers: TrackingMarker[];
  route: RoutePoint[] | null;
  zones: DeliveryZone[];
  /** Puntos a encuadrar cuando cambia `fitKey`. */
  fitPoints: Array<[number, number]>;
  fitKey: string;
  onSelect?: (assignmentId: number) => void;
  height?: number | string;
}

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const iconFor = (style: MarkerStyle) =>
  L.divIcon({ className: '', html: markerHtml(style), iconSize: [34, 34], iconAnchor: [17, 17] });

const styleKey = (style: MarkerStyle) => `${style.status}|${style.color}|${style.icon}|${style.focused}`;

export const TrackingMap: React.FC<TrackingMapProps> = ({
  markers,
  route,
  zones,
  fitPoints,
  fitKey,
  onSelect,
  height = 560,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerRefs = useRef(new Map<number, { marker: L.Marker; key: string }>());

  const handlersRef = useRef({ onSelect, fitPoints });
  useEffect(() => {
    handlersRef.current = { onSelect, fitPoints };
  });

  // ---------- Montaje único ----------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [20, 0], zoom: 2, worldCopyJump: true });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    zonesLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const markerMap = markerRefs.current;

    const resize = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(resize);
      markerMap.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // El contenedor cambia de tamaño al pasar a pantalla completa.
  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [height]);

  // ---------- Zonas (capa tenue) ----------
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    zones
      .filter((zone) => zone.status === 'active')
      .forEach((zone) => {
        const geometry = zoneGeometry(zone);
        if (!geometry) return;
        L.polygon(leafletRings(geometry), {
          color: TRACKING_COLORS.inactive,
          weight: 1,
          fillOpacity: 0.05,
          dashArray: '4 6',
          interactive: false,
        }).addTo(layer);
      });
  }, [zones]);

  // ---------- Marcadores de vehículo ----------
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    const registry = markerRefs.current;
    const seen = new Set<number>();

    markers.forEach((item) => {
      seen.add(item.id);
      const key = styleKey(item.style);
      const existing = registry.get(item.id);
      if (existing) {
        const current = existing.marker.getLatLng();
        if (current.lat !== item.lat || current.lng !== item.lng) {
          existing.marker.setLatLng([item.lat, item.lng]);
        }
        if (existing.key !== key) {
          existing.marker.setIcon(iconFor(item.style));
          existing.marker.setZIndexOffset(item.style.focused ? 1000 : 0);
          existing.key = key;
        }
        return;
      }
      const marker = L.marker([item.lat, item.lng], {
        icon: iconFor(item.style),
        title: item.title,
        keyboard: true,
        zIndexOffset: item.style.focused ? 1000 : 0,
      });
      marker.bindTooltip(item.title);
      marker.on('click', () => handlersRef.current.onSelect?.(item.id));
      marker.addTo(layer);
      registry.set(item.id, { marker, key });
    });

    registry.forEach((entry, id) => {
      if (seen.has(id)) return;
      layer.removeLayer(entry.marker);
      registry.delete(id);
    });
  }, [markers]);

  // ---------- Rastro de la ruta enfocada ----------
  useEffect(() => {
    const layer = routeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!route?.length) return;
    const latlngs = route.map((p) => [p.lat, p.lng] as [number, number]);
    if (latlngs.length >= 2) {
      L.polyline(latlngs, { color: TRACKING_COLORS.primary, weight: 4, opacity: 0.85 }).addTo(layer);
    }
    L.circleMarker(latlngs[0], {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: TRACKING_COLORS.primary,
      fillOpacity: 1,
    })
      .bindTooltip('Route start')
      .addTo(layer);
  }, [route]);

  // ---------- Encuadre ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = handlersRef.current.fitPoints;
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 16);
      return;
    }
    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [fitKey]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Live fleet radar"
      data-testid="tracking-map"
      className="w-full rounded border border-[#e8e2d8] isolate z-0 bg-[#ece8e0]"
      style={{ height }}
    />
  );
};

export default TrackingMap;
