// Registration and editing of a delivery area.
//
// The perimeter is set in two ways that share the same state: by drawing on the map,
// or generating a circle from a radius in km (`GET /delivery-zone/radius-polygon`; the center
// comes from a click on the map, from an address or from written coordinates). There is no entry
// Raw GeoJSON: Removed as a product request. The server validates the ring again
// closed; here it is validated before so as not to lose the drawing in a 400.

import React, { useMemo, useState } from 'react';
import type {
  DeliveryZone,
  DeliveryZoneDraft,
  DeliveryZoneStatus,
  ZoneGeometry,
} from '../../../../types/delivery';
import {
  ZONE_DESCRIPTION_MAX,
  ZONE_NAME_MAX,
  ZONE_STATUSES,
  ZONE_STATUS_META,
  editableVertices,
  formatCoordinate,
  geometryCenter,
  insertVertex,
  parseCoordinate,
  parseLatLngPair,
  parseZoneGeoJson,
  polygonFromVertices,
  radiusError,
  vertexCount,
  zoneCode,
  zoneDescriptionError,
  zoneGeometry,
  zoneNameError,
  type LatLng,
} from '../../../../lib/delivery-zones';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { geocodeAddress, getRadiusPolygon } from '../../../../api/delivery';
import { ApiError } from '../../../../lib/api-error';
import { SideDrawer } from '../../shared/SideDrawer';
import { ModalFormError, ModalFormFooter } from '../../shared/AppModal';
import { ZoneMap, type ZoneMapHandle } from './ZoneMap';

type BoundaryTab = 'draw' | 'radius';

interface ZoneFormDrawerProps {
  initial?: DeliveryZone;
  /** Rest of commercial areas, context on the map. */
  otherZones: DeliveryZone[];
  merchantName: string | null;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (draft: DeliveryZoneDraft) => void;
}

const fieldClass =
  'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md outline-none w-full font-poppins focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] hover:text-primary! transition-colors duration-200';
const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider';
const chipButton =
  'px-3 py-1.5 rounded border border-[#e8e2d8] text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-primary! hover:border-[#ae001a] transition-colors duration-200 disabled:opacity-40 cursor-pointer';

/** Circle vertices that are requested from the server (endpoint default). */
export const RADIUS_SEGMENTS = 64;

export const ZoneFormDrawer: React.FC<ZoneFormDrawerProps> = ({
  initial,
  otherZones,
  merchantName,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const isEdit = Boolean(initial);
  const initialGeometry = useMemo(() => (initial ? zoneGeometry(initial) : null), [initial]);

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<DeliveryZoneStatus>(initial?.status ?? 'active');

  // Simple polygon → is edited by vertices. MultiPolygon / with gaps cannot be edited by
  // vertices: preserved as is, and can only be replaced with the radius or deleted.
  const [vertices, setVertices] = useState<LatLng[] | null>(() => editableVertices(initialGeometry));
  const [complexGeometry, setComplexGeometry] = useState<ZoneGeometry | null>(() =>
    editableVertices(initialGeometry) === null ? initialGeometry : null,
  );
  const [tab, setTab] = useState<BoundaryTab>(() =>
    initialGeometry && editableVertices(initialGeometry) === null ? 'radius' : 'draw',
  );

  const [centerLat, setCenterLat] = useState(() =>
    initialGeometry ? formatCoordinate(geometryCenter(initialGeometry).lat) : '',
  );
  const [centerLng, setCenterLng] = useState(() =>
    initialGeometry ? formatCoordinate(geometryCenter(initialGeometry).lng) : '',
  );
  const [radiusKm, setRadiusKm] = useState('3');
  const [radiusTouched, setRadiusTouched] = useState(false);
  const [pickingCenter, setPickingCenter] = useState(false);
  const [radiusBusy, setRadiusBusy] = useState(false);
  const [radiusApiError, setRadiusApiError] = useState('');
  const [address, setAddress] = useState('');
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [addressLabel, setAddressLabel] = useState('');

  const [mapHandle, setMapHandle] = useState<ZoneMapHandle | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [touched, setTouched] = useState(false);

  useModalDismiss(onCancel);

  const geometry: ZoneGeometry | null = complexGeometry ?? polygonFromVertices(vertices ?? []);
  const drawing = vertices !== null && vertices.length > 0 && vertices.length < 3;

  const nameError = zoneNameError(name);
  const descriptionError = zoneDescriptionError(description);
  const boundaryError = drawing ? 'A boundary needs at least 3 vertices — keep clicking on the map, or clear it' : '';
  const blocked = Boolean(nameError || descriptionError || boundaryError) || submitting;

  const centerPoint = (() => {
    const lat = parseCoordinate(centerLat, 'lat');
    const lng = parseCoordinate(centerLng, 'lng');
    return lat === null || lng === null ? null : { lat, lng };
  })();
  const radiusProblem = radiusError(radiusKm);
  const centerProblem = centerPoint ? '' : 'Set a valid center (latitude, longitude)';

  const replaceGeometry = (next: ZoneGeometry | null) => {
    const editable = editableVertices(next);
    if (editable === null) {
      setComplexGeometry(next);
      setVertices(null);
    } else {
      setComplexGeometry(null);
      setVertices(editable);
    }
    setFitKey((k) => k + 1);
  };

  const handleVerticesChange = (next: LatLng[]) => {
    setVertices(next);
  };

  const handleMapClick = (point: LatLng) => {
    if (tab === 'radius' || pickingCenter) {
      setCenterLat(formatCoordinate(point.lat));
      setCenterLng(formatCoordinate(point.lng));
      setPickingCenter(false);
      return;
    }
    if (tab === 'draw' && vertices !== null) {
      handleVerticesChange(insertVertex(vertices, point));
    }
  };

  const setCenter = (point: LatLng) => {
    setCenterLat(formatCoordinate(point.lat));
    setCenterLng(formatCoordinate(point.lng));
  };

  // Direction (Nominatim) or "lat, lng" stuck → center of the radius.
  const findAddress = async () => {
    const query = address.trim();
    if (!query) return;
    setAddressError('');
    setAddressLabel('');
    const pair = parseLatLngPair(query);
    if (pair) {
      setCenter(pair);
      mapHandle?.focus(pair);
      return;
    }
    setAddressBusy(true);
    try {
      const [hit] = await geocodeAddress(query);
      if (!hit) {
        setAddressError('Address not found. Try "latitude, longitude" or click the map.');
        return;
      }
      const point = { lat: hit.lat, lng: hit.lng };
      setCenter(point);
      setAddressLabel(hit.label);
      mapHandle?.focus(point);
    } catch (err) {
      setAddressError(err instanceof ApiError ? err.message : 'Address lookup failed. Try coordinates instead.');
    } finally {
      setAddressBusy(false);
    }
  };

  // The circle is generated by the server (same geodesic calculation that validates the save).
  const generateCircle = async () => {
    setRadiusTouched(true);
    setRadiusApiError('');
    if (radiusProblem || !centerPoint) return;
    setRadiusBusy(true);
    try {
      const result = await getRadiusPolygon({
        center: centerPoint,
        radiusKm: Number(radiusKm),
        segments: RADIUS_SEGMENTS,
      });
      const parsed = parseZoneGeoJson(result?.geojson ?? null);
      if (!parsed.ok) {
        setRadiusApiError(`The server returned an invalid boundary: ${parsed.error}`);
        return;
      }
      replaceGeometry(parsed.geometry);
      setTab('draw');
    } catch (err) {
      setRadiusApiError(err instanceof ApiError ? err.message : 'Failed to generate the radius boundary.');
    } finally {
      setRadiusBusy(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (blocked) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      geojson: geometry,
      status,
    });
  };

  const tabs: { id: BoundaryTab; label: string; icon: string; disabled?: boolean }[] = [
    { id: 'draw', label: 'Draw on map', icon: 'polyline', disabled: vertices === null },
    { id: 'radius', label: 'Radius template', icon: 'radio_button_checked' },
  ];

  return (
    <SideDrawer
      title={isEdit ? `Edit ${initial?.name}` : 'New delivery zone'}
      subtitle={isEdit ? zoneCode(initial!.id) : 'DELIVERY ZONES'}
      onClose={onCancel}
      closeDisabled={submitting}
      maxWidth={1120}
    >
      <form noValidate onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 font-sans">
        {formError ? <ModalFormError message={formError} /> : null}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6 items-start">
          {/* ---------- Area data ---------- */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-body-sm text-[#5f5e5e]">
              <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">
                storefront
              </span>
              Store:
              <span
                data-testid="drawer-merchant"
                className="px-2 py-0.5 rounded-full bg-[#ece8e0] text-[#1d1c17] text-[11px] font-bold uppercase tracking-wider"
              >
                {merchantName ?? 'Active store'}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <label htmlFor="zone-name" className={labelClass}>
                  Zone name *
                </label>
                <span className="text-[11px] text-[#5f5e5e]">
                  {name.trim().length}/{ZONE_NAME_MAX}
                </span>
              </div>
              <input
                id="zone-name"
                type="text"
                maxLength={ZONE_NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Centro, Zona Norte"
                aria-invalid={Boolean(touched && nameError)}
                className={fieldClass}
              />
              {touched && nameError ? (
                <p className="text-body-sm text-error" role="alert">
                  {nameError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <label htmlFor="zone-description" className={labelClass}>
                  Description
                </label>
                <span className="text-[11px] text-[#5f5e5e]">
                  {description.trim().length}/{ZONE_DESCRIPTION_MAX}
                </span>
              </div>
              <textarea
                id="zone-description"
                rows={3}
                maxLength={ZONE_DESCRIPTION_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Streets, landmarks or notes for drivers"
                aria-invalid={Boolean(descriptionError)}
                className={`${fieldClass} resize-y`}
              />
              {descriptionError ? (
                <p className="text-body-sm text-error" role="alert">
                  {descriptionError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="zone-status" className={labelClass}>
                Status
              </label>
              <select
                id="zone-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as DeliveryZoneStatus)}
                className={fieldClass}
              >
                {ZONE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ZONE_STATUS_META[s].label}
                  </option>
                ))}
              </select>
              {status !== 'active' ? (
                <p className="text-body-sm text-[#92400e] bg-[#f59e0b]/10 border border-[#f59e0b]/40 rounded p-2 flex gap-2">
                  <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">
                    block
                  </span>
                  New delivery orders for this zone are rejected while it is {ZONE_STATUS_META[status].label.toLowerCase()}.
                </p>
              ) : null}
            </div>

            {/* ---------- Boundary perimeter tools ---------- */}
            <fieldset className="flex flex-col gap-3 border-t border-[#e8e2d8] pt-4">
              <legend className={`${labelClass} mb-2`}>Boundary</legend>

              <div role="tablist" aria-label="Boundary tools" className="flex flex-wrap gap-2">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    disabled={t.disabled}
                    onClick={() => setTab(t.id)}
                    className={`${chipButton} flex items-center gap-1.5 ${
                      // `!`: chipButton's base color/border won and the active tab was indistinguishable.
                      tab === t.id ? 'border-[#ae001a]! text-primary! bg-[#ae001a]/5!' : ''
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      {t.icon}
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'draw' ? (
                <div className="flex flex-col gap-2 text-body-sm text-[#5f5e5e]">
                  <p>
                    Click the map to add a vertex (it is inserted on the nearest edge), drag a vertex to
                    move it, click a vertex to delete it. The ring is closed automatically.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={chipButton}
                      disabled={!vertices?.length}
                      onClick={() => handleVerticesChange((vertices ?? []).slice(0, -1))}
                    >
                      Undo last vertex
                    </button>
                    <button
                      type="button"
                      className={chipButton}
                      disabled={!geometry && !vertices?.length}
                      onClick={() => replaceGeometry(null)}
                    >
                      Clear boundary
                    </button>
                  </div>
                </div>
              ) : null}

              {tab === 'radius' ? (
                <div className="flex flex-col gap-3" data-testid="radius-tool">
                  {complexGeometry ? (
                    <div className="flex flex-wrap items-center gap-2 text-body-sm text-[#92400e] bg-[#fdf1dc] border border-[#f59e0b]/40 rounded px-3 py-2" data-testid="complex-boundary-note">
                      <span className="flex-1 min-w-[12rem]">
                        This zone has several polygons or holes, so its vertices can&apos;t be edited here. It is kept as is
                        unless you generate a new radius boundary or clear it.
                      </span>
                      <button type="button" className={chipButton} onClick={() => replaceGeometry(null)}>
                        Clear boundary
                      </button>
                    </div>
                  ) : null}
                  <p className="text-body-sm text-[#5f5e5e]">
                    Generates a circular zone ({RADIUS_SEGMENTS} vertices) around the store, e.g. 3 km.
                    Set the center by clicking the map, looking up an address, or typing coordinates.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="radius-address" className={labelClass}>
                      Center address
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="radius-address"
                        value={address}
                        onChange={(e) => {
                          setAddress(e.target.value);
                          setAddressError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void findAddress();
                          }
                        }}
                        placeholder="Store address, or 18.4662, -69.9384"
                        className={fieldClass}
                      />
                      <button
                        type="button"
                        className={`${chipButton} shrink-0`}
                        disabled={addressBusy || !address.trim()}
                        onClick={() => void findAddress()}
                      >
                        {addressBusy ? 'Searching…' : 'Find address'}
                      </button>
                    </div>
                    {addressError ? (
                      <p className="text-body-sm text-error" role="alert">
                        {addressError}
                      </p>
                    ) : addressLabel ? (
                      <p className="text-[11px] text-[#5f5e5e] truncate" title={addressLabel} data-testid="radius-address-hit">
                        {addressLabel}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="radius-lat" className={labelClass}>
                        Center lat
                      </label>
                      <input
                        id="radius-lat"
                        inputMode="decimal"
                        value={centerLat}
                        onChange={(e) => setCenterLat(e.target.value)}
                        placeholder="18.46620"
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="radius-lng" className={labelClass}>
                        Center lng
                      </label>
                      <input
                        id="radius-lng"
                        inputMode="decimal"
                        value={centerLng}
                        onChange={(e) => setCenterLng(e.target.value)}
                        placeholder="-69.93840"
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="radius-km" className={labelClass}>
                        Radius (km)
                      </label>
                      <input
                        id="radius-km"
                        inputMode="decimal"
                        value={radiusKm}
                        onChange={(e) => setRadiusKm(e.target.value)}
                        className={fieldClass}
                      />
                    </div>
                  </div>
                  {radiusTouched && (radiusProblem || centerProblem) ? (
                    <p className="text-body-sm text-error" role="alert">
                      {centerProblem || radiusProblem}
                    </p>
                  ) : null}
                  {radiusApiError ? (
                    <p className="text-body-sm text-error" role="alert" data-testid="radius-error">
                      {radiusApiError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={chipButton}
                      disabled={!mapHandle}
                      onClick={() => {
                        const c = mapHandle?.center();
                        if (!c) return;
                        setCenterLat(formatCoordinate(c.lat));
                        setCenterLng(formatCoordinate(c.lng));
                      }}
                    >
                      Use map center
                    </button>
                    <button
                      type="button"
                      onClick={() => void generateCircle()}
                      disabled={radiusBusy}
                      className="px-4 py-1.5 rounded bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold font-poppins uppercase tracking-wider transition-colors duration-200 disabled:opacity-50"
                    >
                      {radiusBusy ? 'Generating…' : `Generate ${radiusKm || '?'} km zone`}
                    </button>
                  </div>
                </div>
              ) : null}

              <p
                data-testid="boundary-summary"
                className={`text-body-sm flex items-center gap-2 ${
                  geometry ? 'text-[#047857]' : 'text-[#92400e]'
                }`}
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {geometry ? 'hexagon' : 'warning'}
                </span>
                {geometry
                  ? `Polygon defined · ${vertexCount(geometry)} vertices`
                  : 'No boundary set — the zone cannot geofence addresses yet'}
              </p>
              {touched && boundaryError ? (
                <p className="text-body-sm text-error" role="alert">
                  {boundaryError}
                </p>
              ) : null}
            </fieldset>
          </div>

          {/* ---------- Mapa ---------- */}
          <div className="flex flex-col gap-2">
            <ZoneMap
              ariaLabel="Zone boundary editor"
              zones={
                complexGeometry
                  ? [
                      ...otherZones,
                      {
                        id: initial?.id ?? 0,
                        name: name || 'This zone',
                        description: null,
                        geojson: complexGeometry,
                        status,
                        created_at: '',
                        updated_at: '',
                      },
                    ]
                  : otherZones
              }
              editVertices={vertices ?? []}
              onVerticesChange={handleVerticesChange}
              onMapClick={handleMapClick}
              marker={tab === 'radius' && centerPoint ? { point: centerPoint, inside: true } : null}
              fitKey={fitKey}
              height={520}
              onReady={setMapHandle}
            />
            <p className="text-[11px] text-[#5f5e5e]">
              Other zones of the store are shown for reference (dashed = not active).
            </p>
          </div>
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : isEdit ? 'Save zone' : 'Create zone'}
          isSubmitting={submitting}
        />
      </form>
    </SideDrawer>
  );
};

export default ZoneFormDrawer;
