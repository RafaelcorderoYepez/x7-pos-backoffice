// Modelo del monitor KDS: tipos, adaptación de las respuestas del backend y agregados de la
// vista SUMMARY y de la barra "all-day". Sin React: KitchenMonitorView solo los consume.

export type CourseType = 'APPETIZER' | 'MAIN_COURSE' | 'DESSERT' | 'BEVERAGE';
export type PreparationStatus = 'HELD' | 'PENDING' | 'IN_PREPARATION' | 'READY';

export interface TicketItem {
  id: number;
  name: string;
  variantName?: string;
  qty: number;
  preparedQuantity?: number;
  notes?: string;
  course: CourseType;
  preparationStatus: PreparationStatus;
  holdRemainingSeconds?: number;
  firedAt?: string | null;
}

export interface KitchenTicket {
  id: string;
  backendOrderId?: number;
  table: string;
  timeElapsed: number; // minutes
  createdAtMs?: number;
  server: string;
  stationName?: string;
  stationId?: number;
  priority: 'normal' | 'high' | 'urgent' | 'vip';
  items: TicketItem[];
  orderNotes?: string | null;
  isPulsing?: boolean;
  alertMessage?: string | null;
}

export type KdsView = 'EXPO' | 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID';

export interface BackendKitchenStation {
  id: number;
  name: string;
  station_type?: string;
  stationType?: string;
  display_mode?: 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID';
  displayMode?: 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID';
  display_order?: number;
  displayOrder?: number;
  backup_station_id?: number | null;
  backupStationId?: number | null;
  max_active_tickets_capacity?: number;
  maxActiveTicketsCapacity?: number;
  auto_reroute_on_offline?: boolean;
  autoRerouteOnOffline?: boolean;
  auto_reroute_on_capacity?: boolean;
  autoRerouteOnCapacity?: boolean;
  fallback_action?: string;
  fallbackAction?: string;
  printer_name?: string | null;
  printerName?: string | null;
  is_active?: boolean;
  isActive?: boolean;
  status?: string;
}

export type KdsCardDensity = 'compact' | 'normal' | 'spacious';

// Raw kitchen order as returned by GET /kitchen-orders (camelCase and snake_case variants).
export interface RawKitchenOrderItem {
  id: number;
  product?: { name?: string };
  productName?: string;
  variant?: { name?: string };
  variantName?: string;
  quantity?: number;
  preparedQuantity?: number;
  prepared_quantity?: number;
  notes?: string;
  course?: string;
  preparationStatus?: string;
  holdUntil?: string;
  firedAt?: string;
  fired_at?: string;
}

export interface RawKitchenOrder {
  id: number;
  businessStatus?: string;
  status?: string;
  createdAt?: string;
  startedAt?: string;
  order?: { diningTable?: { name?: string }; table_number?: string; waiter_name?: string; waiter?: { name?: string } };
  notes?: string;
  stationId?: number;
  station?: { id?: number; name?: string };
  priority?: number;
  items?: RawKitchenOrderItem[];
  kitchenOrderItems?: RawKitchenOrderItem[];
}

/** Estación tal como la usa el monitor, aceptando las claves camelCase y snake_case del backend. */
export const mapKitchenStation = (s: Record<string, unknown>): BackendKitchenStation => ({
  id: Number(s.id),
  name: String(s.name || ''),
  station_type: (s.stationType || s.station_type) as string | undefined,
  stationType: (s.stationType || s.station_type) as string | undefined,
  display_mode: (s.displayMode || s.display_mode || 'GRID') as 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID',
  displayMode: (s.displayMode || s.display_mode || 'GRID') as 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID',
  display_order: Number(s.displayOrder ?? s.display_order ?? s.id),
  displayOrder: Number(s.displayOrder ?? s.display_order ?? s.id),
  backup_station_id: (s.backup_station_id ?? s.backupStationId ?? null) as number | null,
  backupStationId: (s.backupStationId ?? s.backup_station_id ?? null) as number | null,
  max_active_tickets_capacity: (s.max_active_tickets_capacity ?? s.maxActiveTicketsCapacity ?? 15) as number,
  maxActiveTicketsCapacity: (s.maxActiveTicketsCapacity ?? s.max_active_tickets_capacity ?? 15) as number,
  auto_reroute_on_offline: (s.auto_reroute_on_offline ?? s.autoRerouteOnOffline ?? true) as boolean,
  autoRerouteOnOffline: (s.auto_reroute_on_offline ?? s.autoRerouteOnOffline ?? true) as boolean,
  auto_reroute_on_capacity: (s.auto_reroute_on_capacity ?? s.autoRerouteOnCapacity ?? true) as boolean,
  autoRerouteOnCapacity: (s.auto_reroute_on_capacity ?? s.autoRerouteOnCapacity ?? true) as boolean,
  fallback_action: (s.fallback_action || s.fallbackAction || 'BACKUP_STATION') as string,
  fallbackAction: (s.fallbackAction || s.fallback_action || 'BACKUP_STATION') as string,
  printer_name: (s.printer_name || s.printerName || null) as string | null,
  printerName: (s.printerName || s.printer_name || null) as string | null,
  is_active: (s.isActive ?? s.is_active ?? true) as boolean,
  isActive: (s.isActive ?? s.is_active ?? true) as boolean,
  status: s.status as string | undefined,
});

/** Orden todavía en cocina: ni completada, ni cancelada, ni borrada. */
export const isActiveKitchenOrder = (o: { businessStatus?: string; status?: string }): boolean =>
  o.businessStatus !== 'completed' && o.businessStatus !== 'cancelled' && o.status !== 'deleted';

/** Ticket del monitor a partir de una orden de GET /kitchen-orders. `now` fija el reloj (tests). */
export const mapKitchenOrderToTicket = (o: RawKitchenOrder, now: number): KitchenTicket => {
  const customerTimeRef = o.createdAt ? new Date(o.createdAt).getTime() : now;
  const elapsedMins = Math.max(0, Math.floor((now - customerTimeRef) / 60000));
  const tableName = o.order?.diningTable?.name
    ? `Table ${o.order.diningTable.name}`
    : o.order?.table_number
    ? `Table ${o.order.table_number}`
    : o.notes?.split('•')?.[0]?.trim() || o.notes?.match(/Table \d+/i)?.[0] || (o.notes && o.notes.length <= 30 ? o.notes.trim() : null) || `Ticket #KO-${o.id}`;

  return {
    id: `KO-${o.id}`,
    backendOrderId: o.id,
    table: tableName,
    orderNotes: o.notes || null,
    timeElapsed: elapsedMins,
    createdAtMs: customerTimeRef,
    server: o.order?.waiter_name || o.order?.waiter?.name || 'Kitchen Staff',
    stationName: o.station?.name || 'General Kitchen',
    stationId: o.stationId ?? o.station?.id,
    priority: (o.priority ?? 0) >= 3 ? 'vip' : (o.priority ?? 0) === 2 ? 'urgent' : (o.priority ?? 0) === 1 ? 'high' : 'normal',
    items: (o.items || o.kitchenOrderItems || []).map((i) => {
      const prepStatusUpper = (i.preparationStatus || 'pending').toUpperCase() as PreparationStatus;
      let holdSeconds: number | undefined = undefined;
      if (prepStatusUpper === 'HELD') {
        if (i.holdUntil) {
          holdSeconds = Math.max(0, Math.floor((new Date(i.holdUntil).getTime() - now) / 1000));
        } else {
          const prioNum = o.priority ?? 0;
          const defaultMins = prioNum >= 3 ? 1 : prioNum === 2 ? 4 : prioNum === 1 ? 7 : 10;
          holdSeconds = defaultMins * 60;
        }
      }

      return {
        id: i.id,
        name: i.product?.name || i.productName || 'Dish Item',
        variantName: i.variant?.name || i.variantName || undefined,
        qty: i.quantity || 1,
        preparedQuantity: i.prepared_quantity ?? i.preparedQuantity ?? 0,
        notes: i.notes || undefined,
        course: ((i.course || 'MAIN_COURSE').toUpperCase()) as CourseType,
        preparationStatus: prepStatusUpper,
        holdRemainingSeconds: holdSeconds,
        firedAt: i.firedAt || i.fired_at,
      };
    }),
  };
};

export interface AggregatedSummaryTable {
  ticketId: string;
  itemId: number;
  table: string;
  qty: number;
  status: PreparationStatus;
}

export interface AggregatedSummaryItem {
  key: string;
  name: string;
  variantName?: string;
  course: CourseType;
  totalQty: number;
  pendingQty: number;
  inPrepQty: number;
  heldQty: number;
  readyQty: number;
  notes: string[];
  tables: AggregatedSummaryTable[];
}

/** Lotes de la vista SUMMARY: unidades por plato/variante y su estado, con las mesas que las piden. */
export const aggregateSummary = (
  tickets: KitchenTicket[],
  activeCourseFilter: 'ALL' | CourseType,
): AggregatedSummaryItem[] => {

  const map = new Map<string, AggregatedSummaryItem>();

  tickets.forEach((t) => {
    t.items.forEach((item) => {
      if (activeCourseFilter !== 'ALL' && item.course !== activeCourseFilter) {
        return;
      }
      const key = `${item.name.trim()}__${item.variantName?.trim() || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: item.name,
          variantName: item.variantName,
          course: item.course,
          totalQty: 0,
          pendingQty: 0,
          inPrepQty: 0,
          heldQty: 0,
          readyQty: 0,
          notes: [],
          tables: [],
        });
      }
      const record = map.get(key)!;
      record.totalQty += item.qty;
      if (item.preparationStatus === 'READY') {
        record.readyQty += item.qty;
      } else if (item.preparationStatus === 'HELD') {
        record.heldQty += item.qty;
      } else if (item.preparationStatus === 'IN_PREPARATION') {
        record.inPrepQty += item.qty;
      } else {
        record.pendingQty += item.qty;
      }
      if (item.notes && !record.notes.includes(item.notes)) {
        record.notes.push(item.notes);
      }
      record.tables.push({
        ticketId: t.id,
        itemId: item.id,
        table: t.table,
        qty: item.qty,
        status: item.preparationStatus,
      });
    });
  });

  return Array.from(map.values()).sort(
    (a, b) =>
      b.inPrepQty + b.pendingQty + b.heldQty - (a.inPrepQty + a.pendingQty + a.heldQty)
  );
};

export interface AllDayAggregatedItem {
  key: string;
  productName: string;
  variantName?: string;
  course: CourseType;
  totalNeeded: number;
  totalOrdered: number;
  totalPrepared: number;
  modifiers: Array<{ note: string; count: number }>;
}

/** Barra "all-day": unidades que faltan por preparar de cada plato, con sus modificadores. */
export const aggregateAllDay = (
  tickets: KitchenTicket[],
  activeCourseFilter: 'ALL' | CourseType,
): { items: AllDayAggregatedItem[]; totalNeededCount: number } => {

  const map = new Map<string, AllDayAggregatedItem>();
  let totalNeededCount = 0;

  tickets.forEach((ticket) => {
    ticket.items.forEach((item) => {
      if (activeCourseFilter !== 'ALL' && item.course !== activeCourseFilter) {
        return;
      }
      if (item.preparationStatus !== 'PENDING' && item.preparationStatus !== 'IN_PREPARATION') {
        return;
      }

      const currentPrepared = item.preparedQuantity || 0;
      const needed = Math.max(0, item.qty - currentPrepared);
      if (needed <= 0) return;

      totalNeededCount += needed;
      const key = `${item.name.trim().toLowerCase()}__${(item.variantName || '').trim().toLowerCase()}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          productName: item.name,
          variantName: item.variantName,
          course: item.course,
          totalNeeded: 0,
          totalOrdered: 0,
          totalPrepared: 0,
          modifiers: [],
        });
      }

      const entry = map.get(key)!;
      entry.totalNeeded += needed;
      entry.totalOrdered += item.qty;
      entry.totalPrepared += currentPrepared;

      if (item.notes && item.notes.trim().length > 0) {
        const noteText = item.notes.trim();
        const existingMod = entry.modifiers.find(
          (m) => m.note.toLowerCase() === noteText.toLowerCase()
        );
        if (existingMod) {
          existingMod.count += needed;
        } else {
          entry.modifiers.push({ note: noteText, count: needed });
        }
      }
    });
  });

  const items = Array.from(map.values()).sort((a, b) => b.totalNeeded - a.totalNeeded);
  return {
    items,
    totalNeededCount,
  };
};
