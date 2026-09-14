import React, { useState, useEffect, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  DiningTable,
  FloorPlan,
  FloorZone,
  TableShape,
  CreateDiningTableDto,
  UpdateDiningTableDto,
} from '../../../../types/dining-system';
import {
  TABLE_SHAPES,
  TABLE_STATUSES,
  TABLE_MIN_SIZE_PX,
  TABLE_MAX_SIZE_PX,
  TABLE_MIN_ROTATION,
  TABLE_MAX_ROTATION,
  tableFootprint,
  tableStatusBadgeStyle,
  tableStatusLabel,
  zoneSwatchColor,
} from '../../../../types/dining-system';
import {
  activeServiceGuard,
  changesTableLayout,
  childTablesOf,
  duplicateTableNumberError,
  eligibleParentTables,
  eligibleTransferTargets,
  footprintClipWarning,
  formatSeats,
  formatSpatialSummary,
  GROUP_RELEASE_STATUS,
  inheritedChildStatus,
  isJoined,
  joinedChildrenLabel,
  joinedToLabel,
  parentTableId,
  positionBoundsError,
  rotationError,
} from '../../../../lib/dining-tables';
import { isActiveDuty, type TableAssignment } from '../../../../lib/table-assignments';
import { useDiningRealtime } from '../../../../lib/useDiningRealtime';
import type { UnitSystem } from '../../../../lib/measurement-units';
import {
  formatDimensions,
  lengthSuffix,
  lengthToPx,
  lengthValue,
  loadUnitSystem,
  saveUnitSystem,
  UNIT_SYSTEMS,
  UNIT_SYSTEM_SHORT,
} from '../../../../lib/measurement-units';
import { DiningSystemQuickLinks } from './DiningSystemQuickLinks';
import { TableJoinModal } from './TableJoinModal';
import { TableTransferModal } from './TableTransferModal';
import { FloorPlanEditor } from './FloorPlanEditor';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter, ModalFormError } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// 'deleted' es el borrado lógico de una mesa: nunca es un estado operativo ni se ofrece
// en el formulario. El resto del vocabulario vive en types/dining-system.
const DELETED_STATUS = 'deleted';

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const pluralize = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

// ========================= FORM DRAWER (CREATE / EDIT) =========================

interface TableFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: DiningTable;
  plans: FloorPlan[];
  zones: FloorZone[];
  // Inventario vivo: alimenta el selector de mesa madre y cierra el candado circular.
  tables: DiningTable[];
  // Números ya usados por el comercio: el índice (merchant_id, number) es ÚNICO en base.
  takenNumbers: Set<string>;
  // Camareros con esta mesa a su cargo ahora mismo. Con servicio vivo, mudarla de plano o
  // de zona deja al POS sin saber dónde está la comanda, así que se bloquea.
  activeAssignments: number;
  unitSystem: UnitSystem;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (dto: UpdateDiningTableDto) => void;
}

const TableFormDrawer: React.FC<TableFormDrawerProps> = ({
  mode,
  initial,
  plans,
  zones,
  tables,
  takenNumbers,
  activeAssignments,
  unitSystem,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [number, setNumber] = useState(initial?.number ?? '');
  const [capacity, setCapacity] = useState(String(initial?.capacity ?? 4));
  const [status, setStatus] = useState(initial?.status ?? 'available');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [shape, setShape] = useState<TableShape>(initial?.shape ?? 'Circle');
  const [planId, setPlanId] = useState<string>(
    initial?.floorPlan?.id ? String(initial.floorPlan.id) : '',
  );
  const [zoneId, setZoneId] = useState<string>(
    initial?.floorZone?.id ? String(initial.floorZone.id) : '',
  );
  const base = tableFootprint(initial ?? { shape });
  const [width, setWidth] = useState(String(lengthValue(base.w, unitSystem)));
  const [height, setHeight] = useState(String(lengthValue(base.h, unitSystem)));
  const [rotation, setRotation] = useState(String(initial?.rotation ?? 0));
  // Una mesa nueva aterriza a 40,40 del origen: dentro de cualquier lienzo y visible de
  // inmediato en el editor, donde se recoloca arrastrándola.
  const [posX, setPosX] = useState(String(initial?.pos_x ?? 40));
  const [posY, setPosY] = useState(String(initial?.pos_y ?? 40));
  const [parentId, setParentId] = useState<string>(
    initial ? String(parentTableId(initial) ?? '') : '',
  );

  useModalDismiss(onCancel);

  // Sólo las zonas del plano elegido: una mesa no puede caer en la zona de otra sala.
  const planZones = useMemo(
    () => zones.filter((z) => String(z.floorPlan?.id ?? '') === planId),
    [zones, planId],
  );

  const duplicateNumber =
    number.trim().length > 0 &&
    number.trim().toLowerCase() !== (initial?.number ?? '').toLowerCase() &&
    takenNumbers.has(number.trim().toLowerCase());

  const capacityNum = Number(capacity);
  const widthPx = clamp(lengthToPx(Number(width) || 0, unitSystem), TABLE_MIN_SIZE_PX, TABLE_MAX_SIZE_PX);
  const heightPx = clamp(lengthToPx(Number(height) || 0, unitSystem), TABLE_MIN_SIZE_PX, TABLE_MAX_SIZE_PX);

  const rotationNum = Number(rotation);
  const posXNum = Number(posX);
  const posYNum = Number(posY);
  const selectedPlan = plans.find((p) => String(p.id) === planId);

  // Las coordenadas se teclean en píxeles de lienzo (los mismos que persiste el backend y
  // que muestra la parrilla), no en la unidad de medida: son una posición sobre el plano,
  // no una distancia que el operador mida con cinta métrica.
  const positionError = positionBoundsError(posXNum, posYNum, selectedPlan, unitSystem);
  const clipWarning = positionError
    ? ''
    : footprintClipWarning(
        { pos_x: posXNum, pos_y: posYNum, shape, width: widthPx, height: heightPx },
        selectedPlan,
      );
  const rotationMsg = rotationError(rotationNum);

  // Mesa madre: nunca ella misma ni ninguna de sus hijas, para que no se cierre el ciclo.
  const parentOptions = useMemo(
    () => eligibleParentTables(tables, initial?.id ?? -1),
    [tables, initial],
  );

  // Con la mesa en servicio, cambiar de plano o de zona queda bloqueado; renombrarla o
  // recolocarla en el mismo lienzo sigue permitido.
  const layoutGuard =
    mode === 'edit' && initial
      ? changesTableLayout(initial, {
          floorPlan: Number(planId) || null,
          floorZone: Number(zoneId) || null,
        })
        ? activeServiceGuard(initial, { activeAssignments })
        : ''
      : '';

  const canSubmit =
    number.trim().length > 0 &&
    !duplicateNumber &&
    capacityNum >= 1 &&
    planId.trim().length > 0 &&
    zoneId.trim().length > 0 &&
    !positionError &&
    !rotationMsg &&
    !layoutGuard;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    onSubmit({
      number: number.trim(),
      capacity: capacityNum,
      status,
      location: location.trim() || 'Main',
      shape,
      width: widthPx,
      height: heightPx,
      rotation: rotationNum,
      pos_x: Math.round(posXNum),
      pos_y: Math.round(posYNum),
      floorPlan: Number(planId),
      floorZone: Number(zoneId),
      // null explícito desune la mesa; el DTO de escritura sólo entiende el escalar.
      parent_table_id: parentId ? Number(parentId) : null,
    });
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';

  return (
    <AppModal
      title={mode === 'create' ? 'Create Table' : 'Edit Table'}
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close table form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-number" className={labelClass}>
              Table Number <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="tbl-number"
              type="text"
              autoFocus
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              maxLength={50}
              aria-invalid={duplicateNumber}
              className={`${inputClass} font-mono`}
              placeholder="e.g., T1"
            />
            {duplicateNumber && (
              <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                {duplicateTableNumberError(number)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-capacity" className={labelClass}>
              Seats <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="tbl-capacity"
              type="number"
              min={1}
              step={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-plan" className={labelClass}>
              Floor Plan <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="tbl-plan"
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value);
                setZoneId(''); // La zona pertenece al plano: cambiar de sala la invalida.
              }}
              className={inputClass}
            >
              <option value="">Select a floor plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-zone" className={labelClass}>
              Floor Zone <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="tbl-zone"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              disabled={!planId}
              className={`${inputClass} disabled:bg-[#f2ede5] disabled:cursor-not-allowed`}
            >
              <option value="">Select a zone…</option>
              {planZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            {planId && planZones.length === 0 && (
              <p className="text-[11px] text-[#5f5e5e] italic">
                This floor plan has no zones yet — create one first.
              </p>
            )}
          </div>
        </div>

        {layoutGuard && (
          <p
            role="alert"
            className="text-[11px] font-semibold text-[#ae001a] bg-[#ae001a]/5 border border-[#ae001a]/20 rounded px-3 py-2"
          >
            {layoutGuard}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-shape" className={labelClass}>
              Shape
            </label>
            <select
              id="tbl-shape"
              value={shape}
              onChange={(e) => {
                const next = e.target.value as TableShape;
                setShape(next);
                // Cambiar de forma trae su tamaño estándar salvo que el usuario lo retoque.
                const fp = tableFootprint({ shape: next });
                setWidth(String(lengthValue(fp.w, unitSystem)));
                setHeight(String(lengthValue(fp.h, unitSystem)));
              }}
              className={inputClass}
            >
              {TABLE_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-width" className={labelClass}>
              Width {lengthSuffix(unitSystem)}
            </label>
            <input
              id="tbl-width"
              type="number"
              step={0.01}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-height" className={labelClass}>
              Depth {lengthSuffix(unitSystem)}
            </label>
            <input
              id="tbl-height"
              type="number"
              step={0.01}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        {/* Colocación sobre el lienzo. Las coordenadas van en píxeles del plano —la unidad
            en la que el backend las persiste— y el giro en grados enteros. */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-pos-x" className={labelClass}>
              Position X (px)
            </label>
            <input
              id="tbl-pos-x"
              type="number"
              step={1}
              value={posX}
              onChange={(e) => setPosX(e.target.value)}
              aria-invalid={Boolean(positionError)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-pos-y" className={labelClass}>
              Position Y (px)
            </label>
            <input
              id="tbl-pos-y"
              type="number"
              step={1}
              value={posY}
              onChange={(e) => setPosY(e.target.value)}
              aria-invalid={Boolean(positionError)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-rotation" className={labelClass}>
              <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
                rotate_right
              </span>{' '}
              Rotation (°)
            </label>
            <input
              id="tbl-rotation"
              type="number"
              min={TABLE_MIN_ROTATION}
              max={TABLE_MAX_ROTATION}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(e.target.value)}
              aria-invalid={Boolean(rotationMsg)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        {positionError && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {positionError}
          </p>
        )}
        {rotationMsg && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {rotationMsg}
          </p>
        )}
        {clipWarning && (
          <p className="text-[11px] text-[#5f5e5e] italic">{clipWarning}</p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tbl-parent" className={labelClass}>
            <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
              link
            </span>{' '}
            Joined to
          </label>
          <select
            id="tbl-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputClass}
          >
            <option value="">Not joined — standalone table</option>
            {parentOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number} · {formatSeats(t.capacity)}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[#5f5e5e]">
            Joining hands this table to a larger party. A table can never be joined to itself
            or to one of its own child tables, so those are left out of the list.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-status" className={labelClass}>
              Status
            </label>
            <select
              id="tbl-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              {TABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tableStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-location" className={labelClass}>
              Location note
            </label>
            <input
              id="tbl-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              className={inputClass}
              placeholder="e.g., Near window"
            />
          </div>
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : mode === 'create' ? 'Create Table' : 'Save Table'}
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

// ========================= DELETE CONFIRM =========================

const ConfirmDeleteTableDialog: React.FC<{
  table: DiningTable;
  // Motivo por el que la mesa no puede borrarse (comanda o camarero vivos). Vacío = adelante.
  guard: string;
  childCount: number;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ table, guard, childCount, submitting, onCancel, onConfirm }) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Delete Table"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close delete confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        {guard ? (
          <>
            <p
              role="alert"
              className="text-sm text-[#ae001a] font-semibold bg-[#ae001a]/5 border border-[#ae001a]/20 rounded px-3 py-2"
            >
              {guard}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[#1d1c17]">
              Delete table <strong className="font-mono">{table.number}</strong>? It disappears from
              the floor plan canvas and from the POS.
            </p>
            {childCount > 0 && (
              <p className="text-[11px] text-[#5f5e5e] italic">
                {childCount === 1 ? 'One table is' : `${childCount} tables are`} joined to it and
                will be released back to standalone.
              </p>
            )}
            <ModalFormFooter
              onCancel={onCancel}
              submitLabel={submitting ? 'Deleting…' : 'Delete Table'}
              isSubmitting={submitting}
              submitType="button"
              onSubmit={onConfirm}
              destructive
            />
          </>
        )}
      </div>
    </AppModal>
  );
};

// ========================= MAIN VIEW =========================

interface DiningTablesViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const DiningTablesView: React.FC<DiningTablesViewProps> = ({ onNavigate, merchantId }) => {
  const activeMerchantId = merchantId ?? 1;

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [zones, setZones] = useState<FloorZone[]>([]);
  // Asignaciones vivas: alimentan la guarda de "mesa con camarero" sin pedir otra vista.
  const [assignments, setAssignments] = useState<TableAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(loadUnitSystem);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');

  const [formDrawer, setFormDrawer] = useState<null | {
    mode: 'create' | 'edit';
    table?: DiningTable;
  }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingTable, setDeletingTable] = useState<DiningTable | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [editorPlan, setEditorPlan] = useState<FloorPlan | null>(null);
  const [joinParent, setJoinParent] = useState<DiningTable | null>(null);
  const [transferSource, setTransferSource] = useState<DiningTable | null>(null);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const authHeaders = (): Record<string, string> => {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const handleUnauthorized = () => {
    clearAuthSession();
    window.location.href = '/login';
  };

  const fetchTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/tables?limit=100`, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las mesas');
      const json = await res.json();
      // El borrado de mesas es lógico vía status: las 'deleted' no son parte del inventario vivo.
      setTables(((json.data ?? []) as DiningTable[]).filter((t) => t.status !== DELETED_STATUS));
    } catch (err) {
      console.error('Error fetching tables:', err);
      setError('Failed to load tables. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContext = async () => {
    try {
      const [planRes, zoneRes, asgRes] = await Promise.all([
        fetch(`${API_BASE}/floor-plan?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/floor-zone?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/table-assignments?limit=100`, { headers: authHeaders() }),
      ]);
      if (planRes.ok) setPlans(((await planRes.json()).data ?? []) as FloorPlan[]);
      if (zoneRes.ok) setZones(((await zoneRes.json()).data ?? []) as FloorZone[]);
      // Si el plan del comercio no incluye la feature, el backend responde 403: la parrilla
      // se queda sin el dato de camarero y la guarda cae al estado de la mesa, que basta.
      if (asgRes.ok) setAssignments(((await asgRes.json()).data ?? []) as TableAssignment[]);
    } catch (err) {
      console.error('Error fetching plans/zones for tables:', err);
    }
  };

  // Mezcla filas frescas sobre las que ya están pintadas, sin reordenar ni parpadear la
  // parrilla entera: es lo que necesita tanto un evento suelto como el delta de reconexión.
  const mergeTables = (incoming: DiningTable[]) => {
    if (incoming.length === 0) return;
    setTables((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      incoming.forEach((t) => byId.set(t.id, { ...byId.get(t.id), ...t }));
      return Array.from(byId.values()).filter((t) => t.status !== DELETED_STATUS);
    });
  };

  useEffect(() => {
    fetchTables();
    fetchContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  const merchantPlans = useMemo(
    () => plans.filter((p) => p.merchant?.id == null || p.merchant.id === activeMerchantId),
    [plans, activeMerchantId],
  );

  const merchantZones = useMemo(
    () => zones.filter((z) => z.merchant?.id == null || z.merchant.id === activeMerchantId),
    [zones, activeMerchantId],
  );

  const planById = useMemo(() => {
    const m = new Map<number, FloorPlan>();
    merchantPlans.forEach((p) => m.set(p.id, p));
    return m;
  }, [merchantPlans]);

  const zoneById = useMemo(() => {
    const m = new Map<number, FloorZone>();
    merchantZones.forEach((z) => m.set(z.id, z));
    return m;
  }, [merchantZones]);

  // Cuántos camareros tienen ahora mismo cada mesa a su cargo (releasedAt === null).
  const activeAssignmentsByTable = useMemo(() => {
    const m = new Map<number, number>();
    assignments.filter(isActiveDuty).forEach((a) => {
      m.set(a.tableId, (m.get(a.tableId) ?? 0) + 1);
    });
    return m;
  }, [assignments]);

  const activeServersOn = (tableId: number): number => activeAssignmentsByTable.get(tableId) ?? 0;

  const guardFor = (t: DiningTable): string =>
    activeServiceGuard(t, { activeAssignments: activeServersOn(t.id) });

  const takenNumbers = useMemo(
    () => new Set(tables.map((t) => (t.number ?? '').trim().toLowerCase())),
    [tables],
  );

  // Cascada: elegir un plano recorta el selector de zonas a las suyas. Sin esto el operador
  // puede combinar "Rooftop" con una zona de la planta baja y quedarse con la parrilla vacía.
  const selectableZones = useMemo(
    () =>
      planFilter
        ? merchantZones.filter((z) => String(z.floorPlan?.id ?? '') === planFilter)
        : merchantZones,
    [merchantZones, planFilter],
  );

  const filteredTables = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return tables.filter((t) => {
      if (term) {
        const haystack = [t.number ?? '', t.location ?? '', t.floorZone?.name ?? '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter && t.status !== statusFilter) return false;
      if (planFilter && String(t.floorPlan?.id ?? '') !== planFilter) return false;
      if (zoneFilter && String(t.floorZone?.id ?? '') !== zoneFilter) return false;
      return true;
    });
  }, [tables, searchQuery, statusFilter, planFilter, zoneFilter]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || planFilter || zoneFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setPlanFilter('');
    setZoneFilter('');
  };

  const changeUnits = (next: UnitSystem) => {
    setUnitSystem(next);
    saveUnitSystem(next);
  };

  const openCreate = () => {
    setFormError('');
    setFormDrawer({ mode: 'create' });
  };

  const handleCreateSubmit = async (dto: UpdateDiningTableDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const body: CreateDiningTableDto = {
        merchant_id: activeMerchantId,
        number: dto.number ?? '',
        capacity: dto.capacity ?? 1,
        status: dto.status ?? 'available',
        location: dto.location ?? 'Main',
        rotation: 0,
        shape: (dto.shape ?? 'Circle') as TableShape,
        width: dto.width ?? null,
        height: dto.height ?? null,
        // Las mesas creadas aquí aterrizan en el origen del lienzo; se colocan luego
        // arrastrándolas en el editor, que es donde la posición tiene sentido visual.
        pos_x: 40,
        pos_y: 40,
        floorZone: dto.floorZone ?? 0,
        floorPlan: dto.floorPlan ?? 0,
      };
      const res = await fetch(`${API_BASE}/tables`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to create table');
      await fetchTables();
      setFormDrawer(null);
      setToast({ message: 'Table created successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (id: number, dto: UpdateDiningTableDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      // Las mesas usan PUT (no PATCH), a diferencia de planos y zonas.
      const res = await fetch(`${API_BASE}/tables/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update table');
      await fetchTables();
      setFormDrawer(null);
      setToast({ message: 'Table updated successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update table');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTable) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/tables/${deletingTable.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete table');
      }
      setTables((prev) => prev.filter((t) => t.id !== deletingTable.id));
      setDeletingTable(null);
      setToast({ message: 'Table deleted successfully', type: 'success' });
    } catch (err) {
      setDeletingTable(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to delete table',
        type: 'error',
      });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // PUT parcial sobre una mesa. Las mesas usan PUT (no PATCH) y rechazan merchant_id.
  const putTable = async (id: number, dto: UpdateDiningTableDto): Promise<void> => {
    const res = await fetch(`${API_BASE}/tables/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(dto),
    });
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to update table');
    }
  };

  // Unir mesas para un grupo grande: cada hija apunta a la madre y, si la madre ya tiene
  // comensales sentados, hereda su estado — el POS no puede ofrecer como libre una mesa
  // que forma parte de un grupo ocupado.
  const handleJoinSubmit = async (childIds: number[]) => {
    if (!joinParent) return;
    setLinkSubmitting(true);
    try {
      const inherited = inheritedChildStatus(joinParent.status);
      await Promise.all(
        childIds.map((id) =>
          putTable(id, {
            parent_table_id: joinParent.id,
            ...(inherited ? { status: inherited } : {}),
          }),
        ),
      );
      await fetchTables();
      setJoinParent(null);
      setToast({
        message: `${childIds.length === 1 ? '1 table' : `${childIds.length} tables`} joined to ${joinParent.number}`,
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to join the tables',
        type: 'error',
      });
    } finally {
      setLinkSubmitting(false);
    }
  };

  // Desunir una hija antes de cerrar la cuenta: parte del grupo se va y su mesa vuelve a
  // estar disponible por su cuenta.
  const handleUnjoin = async (child: DiningTable) => {
    setLinkSubmitting(true);
    try {
      await putTable(child.id, { parent_table_id: null });
      await fetchTables();
      setToast({ message: `Table ${child.number} unjoined`, type: 'success' });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to unjoin the table',
        type: 'error',
      });
    } finally {
      setLinkSubmitting(false);
    }
  };

  // Liberar el grupo entero: se sueltan todas las hijas y madre e hijas pasan a limpieza,
  // que es lo mismo que hace el backend al cobrar la cuenta de la mesa madre.
  const handleReleaseGroup = async (parent: DiningTable) => {
    const children = childTablesOf(tables, parent.id);
    setLinkSubmitting(true);
    try {
      await Promise.all([
        ...children.map((c) =>
          putTable(c.id, { parent_table_id: null, status: GROUP_RELEASE_STATUS }),
        ),
        putTable(parent.id, { status: GROUP_RELEASE_STATUS }),
      ]);
      await fetchTables();
      setToast({
        message: `Group released — ${parent.number} and ${children.length} joined ${
          children.length === 1 ? 'table' : 'tables'
        } moved to cleaning`,
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to release the group',
        type: 'error',
      });
    } finally {
      setLinkSubmitting(false);
    }
  };

  // Transferencia en vivo: el backend la resuelve en una sola transacción (re-vincula la
  // comanda abierta, libera el origen y ocupa el destino). Aquí sólo se elige el destino.
  const handleTransferSubmit = async (target: DiningTable) => {
    if (!transferSource) return;
    setLinkSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/tables/transfer`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sourceTableId: transferSource.id, targetTableId: target.id }),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to transfer the table');
      await fetchTables();
      await fetchContext();
      setTransferSource(null);
      setToast({
        message: `Guests moved from ${transferSource.number} to ${target.number}`,
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to transfer the table',
        type: 'error',
      });
    } finally {
      setLinkSubmitting(false);
    }
  };

  // Al recuperar la red pedimos sólo lo que cambió mientras estuvimos sordos, en vez de
  // recargar la parrilla entera. Si el backend no expone el delta, recarga completa.
  const resyncFromDelta = async (since: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/tables/status-delta?since=${encodeURIComponent(since)}`,
        { headers: authHeaders() },
      );
      if (res.status === 401) return handleUnauthorized();
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        mergeTables((json.data ?? []) as DiningTable[]);
        return;
      }
    } catch (err) {
      console.error('Error reconciling table status delta:', err);
    }
    fetchTables();
  };

  // La sala se mueve desde las tablets del POS: la parrilla tiene que reflejarlo sin que
  // nadie recargue la página.
  const { connected: liveConnected } = useDiningRealtime({
    onTableStatusChanged: (p) => {
      if (p.merchantId !== activeMerchantId) return;
      setTables((prev) => {
        // Una mesa que no tenemos pintada (recién creada en otra terminal) obliga a recargar.
        if (!prev.some((t) => t.id === p.tableId)) {
          fetchTables();
          return prev;
        }
        return prev.map((t) =>
          t.id === p.tableId
            ? { ...t, status: p.status, parent_table_id: p.parent_table_id ?? t.parent_table_id }
            : t,
        );
      });
    },
    onTableTransferred: (p) => {
      if (p.merchantId === activeMerchantId) fetchTables();
    },
    onAssignmentChanged: (p) => {
      if (p.merchantId === activeMerchantId) fetchContext();
    },
    onFloorPlanUpdated: (p) => {
      if (p.merchantId !== activeMerchantId) return;
      fetchTables();
      fetchContext();
    },
    onReconnect: (since) => {
      void resyncFromDelta(since);
    },
  });

  // El eje del módulo: desde la mesa se salta al lienzo donde vive.
  const openEditorForTable = (t: DiningTable) => {
    const plan = t.floorPlan?.id != null ? planById.get(t.floorPlan.id) : undefined;
    if (!plan) {
      setToast({ message: 'This table is not placed on any floor plan yet.', type: 'error' });
      return;
    }
    setEditorPlan(plan);
  };

  const isTrueEmpty = !loading && !error && tables.length === 0;
  const isFilteredEmpty = !loading && !error && tables.length > 0 && filteredTables.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchTables}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">
          Dining Tables
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          The physical table inventory — seats, shape, size, and where each one sits on the floor
          plan.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <span
            className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]"
            aria-hidden="true"
          >
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by table number, zone or location..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search tables"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            setZoneFilter('');
          }}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by floor plan"
        >
          <option value="">All Floor Plans</option>
          {merchantPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by zone"
        >
          <option value="">All Zones</option>
          {selectableZones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {TABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tableStatusLabel(s)}
            </option>
          ))}
        </select>

        {/* Unidades: misma preferencia que el editor y la parrilla de planos. */}
        <div className="flex border border-[#e8e2d8] rounded overflow-hidden" role="group" aria-label="Measurement units">
          {UNIT_SYSTEMS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => changeUnits(u)}
              aria-pressed={unitSystem === u}
              className={`px-3 py-2 text-[11px] font-bold uppercase transition-colors ${
                unitSystem === u
                  ? 'bg-[#ae001a] text-white'
                  : 'bg-white text-[#1d1c17] hover:text-[#ae001a]'
              }`}
            >
              {UNIT_SYSTEM_SHORT[u]}
            </button>
          ))}
        </div>

        {!isTrueEmpty && (
          <button
            type="button"
            onClick={openCreate}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Create Table
          </button>
        )}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {isTrueEmpty && (
        <div
          data-testid="dining-tables-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            table_restaurant
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No dining tables configured. Click &apos;Create Table&apos; to place tables on your
            floor plans.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Create Table
          </button>
        </div>
      )}

      {(loading || tables.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              DINING TABLES
            </span>
            <span className="flex items-center gap-3">
              {/* Estado del canal en vivo: si la sala se mueve y esto dice "Offline", lo que
                  hay en pantalla puede estar rancio. */}
              <span
                data-testid="dining-realtime-status"
                title={
                  liveConnected
                    ? 'Live floor updates connected'
                    : 'Live floor updates unavailable — data refreshes on reload'
                }
                className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
                  liveConnected ? 'text-green-400' : 'text-white/40'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  {liveConnected ? 'sensors' : 'sensors_off'}
                </span>
                {liveConnected ? 'Live' : 'Offline'}
              </span>
              <span className="text-white/50 text-xs">
                {loading ? 'Loading...' : pluralize(filteredTables.length, 'table', 'tables')}
              </span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Table
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Seats
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Spatial
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Zone
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Floor Plan
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span
                          className="material-symbols-outlined text-[#5f5e5e] text-4xl"
                          aria-hidden="true"
                        >
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e]">No tables match your active filters</p>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-[#ae001a] text-sm font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTables.map((t) => {
                    const fp = tableFootprint(t);
                    const zone = t.floorZone?.id != null ? zoneById.get(t.floorZone.id) : undefined;
                    const zoneColor = zoneSwatchColor(zone?.color ?? t.floorZone?.color);
                    const joinedLabel = joinedToLabel(tables, t);
                    const childrenLabel = joinedChildrenLabel(tables, t.id);
                    return (
                      <tr key={t.id} className="group hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">{t.number}</p>
                          {t.location && <p className="text-xs text-[#5f5e5e]">{t.location}</p>}
                          {joinedLabel && (
                            <span
                              data-testid={`table-joined-badge-${t.id}`}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#ae001a]/10 text-[#ae001a]"
                            >
                              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                                link
                              </span>
                              {joinedLabel}
                            </span>
                          )}
                          {childrenLabel && (
                            <span
                              data-testid={`table-children-badge-${t.id}`}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#1d1c17]/5 text-[#1d1c17]"
                            >
                              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                                link
                              </span>
                              {childrenLabel}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#1d1c17]">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                              person
                            </span>
                            {formatSeats(t.capacity)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p
                            data-testid={`table-spatial-${t.id}`}
                            className="text-sm text-[#1d1c17] font-mono whitespace-nowrap"
                          >
                            {formatSpatialSummary(t)}
                          </p>
                          <p className="text-xs text-[#5f5e5e] font-mono">
                            {formatDimensions(fp.w, fp.h, unitSystem)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          {t.floorZone?.id != null ? (
                            <span className="inline-flex items-center gap-2">
                              <span
                                data-testid={`table-zone-swatch-${t.id}`}
                                aria-hidden="true"
                                style={{ backgroundColor: zoneColor }}
                                className="inline-block w-4 h-4 rounded border border-[#e8e2d8] shrink-0"
                              />
                              <span className="text-sm text-[#1d1c17]">
                                {zone?.name ?? t.floorZone.name ?? `Zone #${t.floorZone.id}`}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-[#5f5e5e] italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {t.floorPlan?.id != null ? (
                            <button
                              type="button"
                              onClick={() => openEditorForTable(t)}
                              title="Open this table's floor plan in the live editor"
                              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-[#ece8e0] text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                            >
                              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                                map
                              </span>
                              {planById.get(t.floorPlan.id)?.name ??
                                t.floorPlan.name ??
                                `Plan #${t.floorPlan.id}`}
                            </button>
                          ) : (
                            <span className="text-xs text-[#5f5e5e] italic">Not placed</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            data-testid={`table-status-${t.id}`}
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${tableStatusBadgeStyle(
                              t.status,
                            )}`}
                          >
                            {tableStatusLabel(t.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditorForTable(t)}
                              aria-label={`Open editor for table ${t.number}`}
                              title="Open the layout editor"
                              className="px-3 py-1.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                                edit_square
                              </span>
                              Open Editor
                            </button>
                            <span className="flex gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                              {t.status === 'occupied' && (
                                <button
                                  type="button"
                                  onClick={() => setTransferSource(t)}
                                  aria-label={`Transfer guests from table ${t.number}`}
                                  title="Move this party to another table"
                                  className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                                >
                                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                    swap_horiz
                                  </span>
                                </button>
                              )}
                              {isJoined(t) ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnjoin(t)}
                                  disabled={linkSubmitting}
                                  aria-label={`Unjoin table ${t.number}`}
                                  title="Unjoin from its parent table"
                                  className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40"
                                >
                                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                    link_off
                                  </span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setJoinParent(t)}
                                  aria-label={`Join tables to ${t.number}`}
                                  title="Join other tables to this one"
                                  className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                                >
                                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                    link
                                  </span>
                                </button>
                              )}
                              {childrenLabel && (
                                <button
                                  type="button"
                                  onClick={() => handleReleaseGroup(t)}
                                  disabled={linkSubmitting}
                                  aria-label={`Release the group joined to table ${t.number}`}
                                  title="Release the whole group back to cleaning"
                                  className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40"
                                >
                                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                    group_remove
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setFormError('');
                                  setFormDrawer({ mode: 'edit', table: t });
                                }}
                                aria-label={`Edit table ${t.number}`}
                                title="Edit table"
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                  edit
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTable(t)}
                                aria-label={`Delete table ${t.number}`}
                                title="Delete table"
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                  delete
                                </span>
                              </button>
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DiningSystemQuickLinks active="tables" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick create table"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          add
        </span>
      </button>

      {formDrawer && (
        <TableFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.table}
          plans={merchantPlans}
          zones={merchantZones}
          tables={tables}
          takenNumbers={takenNumbers}
          activeAssignments={
            formDrawer.table ? activeServersOn(formDrawer.table.id) : 0
          }
          unitSystem={unitSystem}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto)
              : handleEditSubmit(formDrawer.table!.id, dto)
          }
        />
      )}

      {deletingTable && (
        <ConfirmDeleteTableDialog
          table={deletingTable}
          guard={guardFor(deletingTable)}
          childCount={childTablesOf(tables, deletingTable.id).length}
          submitting={deleteSubmitting}
          onCancel={() => setDeletingTable(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {joinParent && (
        <TableJoinModal
          parent={joinParent}
          tables={tables}
          submitting={linkSubmitting}
          onCancel={() => setJoinParent(null)}
          onSubmit={handleJoinSubmit}
        />
      )}

      {transferSource && (
        <TableTransferModal
          source={transferSource}
          targets={eligibleTransferTargets(tables, transferSource.id)}
          submitting={linkSubmitting}
          onCancel={() => setTransferSource(null)}
          onSubmit={handleTransferSubmit}
        />
      )}

      {editorPlan && (
        <FloorPlanEditor
          plan={editorPlan}
          merchantId={activeMerchantId}
          onClose={() => setEditorPlan(null)}
          onSaved={() => {
            fetchTables();
            fetchContext();
          }}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default DiningTablesView;
