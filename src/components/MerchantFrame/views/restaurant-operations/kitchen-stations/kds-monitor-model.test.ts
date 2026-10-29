import { describe, expect, it } from 'vitest';
import {
  aggregateAllDay,
  aggregateSummary,
  isActiveKitchenOrder,
  mapKitchenOrderToTicket,
  mapKitchenStation,
  type KitchenTicket,
  type TicketItem,
} from './kds-monitor-model';

const NOW = Date.parse('2026-10-22T12:00:00Z');

describe('mapKitchenOrderToTicket', () => {
  it('builds the ticket from a backend order', () => {
    const ticket = mapKitchenOrderToTicket(
      {
        id: 501,
        createdAt: '2026-10-22T11:45:00Z',
        order: { diningTable: { name: '4' }, waiter_name: 'Ana' },
        station: { id: 2, name: 'Grill' },
        priority: 2,
        kitchenOrderItems: [
          { id: 9001, productName: 'Burger', quantity: 2, preparedQuantity: 1, preparationStatus: 'in_preparation', course: 'main_course' },
        ],
      },
      NOW,
    );

    expect(ticket).toMatchObject({
      id: 'KO-501',
      backendOrderId: 501,
      table: 'Table 4',
      timeElapsed: 15,
      server: 'Ana',
      stationName: 'Grill',
      stationId: 2,
      priority: 'urgent',
    });
    expect(ticket.items).toEqual([
      expect.objectContaining({ id: 9001, name: 'Burger', qty: 2, preparedQuantity: 1, course: 'MAIN_COURSE', preparationStatus: 'IN_PREPARATION' }),
    ]);
  });

  it('takes the table from the notes when the order has no table, and falls back to the ticket id', () => {
    expect(mapKitchenOrderToTicket({ id: 1, notes: 'Table 9 • no onions' }, NOW).table).toBe('Table 9');
    expect(mapKitchenOrderToTicket({ id: 2 }, NOW).table).toBe('Ticket #KO-2');
  });

  it('counts down held items to their hold time, or to the default for the priority', () => {
    const ticket = mapKitchenOrderToTicket(
      {
        id: 3,
        priority: 1,
        items: [
          { id: 1, preparationStatus: 'held', holdUntil: '2026-10-22T12:02:00Z' },
          { id: 2, preparationStatus: 'held' },
        ],
      },
      NOW,
    );
    expect(ticket.items.map((i) => i.holdRemainingSeconds)).toEqual([120, 7 * 60]);
  });
});

describe('isActiveKitchenOrder', () => {
  it('drops completed, cancelled and deleted orders', () => {
    expect(isActiveKitchenOrder({ businessStatus: 'started' })).toBe(true);
    expect(isActiveKitchenOrder({ businessStatus: 'completed' })).toBe(false);
    expect(isActiveKitchenOrder({ businessStatus: 'cancelled' })).toBe(false);
    expect(isActiveKitchenOrder({ status: 'deleted' })).toBe(false);
  });
});

describe('mapKitchenStation', () => {
  it('accepts camelCase and snake_case fields and fills defaults', () => {
    expect(mapKitchenStation({ id: '4', name: 'Bar', display_mode: 'SUMMARY' })).toMatchObject({
      id: 4,
      name: 'Bar',
      displayMode: 'SUMMARY',
      display_mode: 'SUMMARY',
      displayOrder: 4,
      maxActiveTicketsCapacity: 15,
      fallbackAction: 'BACKUP_STATION',
      isActive: true,
    });
    expect(mapKitchenStation({ id: 5, name: 'Grill' }).displayMode).toBe('GRID');
  });
});

const item = (overrides: Partial<TicketItem>): TicketItem => ({
  id: 1,
  name: 'Burger',
  qty: 1,
  course: 'MAIN_COURSE',
  preparationStatus: 'PENDING',
  ...overrides,
});

const ticket = (id: string, table: string, items: TicketItem[]): KitchenTicket => ({
  id,
  table,
  timeElapsed: 0,
  server: 'Kitchen Staff',
  priority: 'normal',
  items,
});

describe('aggregateSummary', () => {
  const tickets = [
    ticket('KO-1', 'Table 1', [item({ id: 1, preparationStatus: 'READY' }), item({ id: 2, name: 'Soup', course: 'APPETIZER' })]),
    ticket('KO-2', 'Table 2', [item({ id: 3, qty: 2, preparationStatus: 'IN_PREPARATION' }), item({ id: 4, preparationStatus: 'HELD' })]),
  ];

  it('groups units by dish and counts them per status, busiest batch first', () => {
    const [burger, soup] = aggregateSummary(tickets, 'ALL');
    expect(burger).toMatchObject({ name: 'Burger', totalQty: 4, readyQty: 1, inPrepQty: 2, heldQty: 1, pendingQty: 0 });
    expect(burger.tables.map((t) => t.itemId)).toEqual([1, 3, 4]);
    expect(soup).toMatchObject({ name: 'Soup', totalQty: 1, pendingQty: 1 });
  });

  it('only counts the selected course', () => {
    expect(aggregateSummary(tickets, 'APPETIZER').map((b) => b.name)).toEqual(['Soup']);
  });
});

describe('aggregateAllDay', () => {
  it('sums what is still to prepare, ignoring held and ready units', () => {
    const result = aggregateAllDay(
      [
        ticket('KO-1', 'Table 1', [
          item({ id: 1, qty: 3, preparedQuantity: 1, notes: 'No onions' }),
          item({ id: 2, preparationStatus: 'READY' }),
        ]),
        ticket('KO-2', 'Table 2', [
          item({ id: 3, name: 'burger ', notes: 'no onions' }),
          item({ id: 4, preparationStatus: 'HELD' }),
        ]),
      ],
      'ALL',
    );

    expect(result.totalNeededCount).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ totalNeeded: 3, totalOrdered: 4, totalPrepared: 1 });
    expect(result.items[0].modifiers).toEqual([{ note: 'No onions', count: 3 }]);
  });
});
