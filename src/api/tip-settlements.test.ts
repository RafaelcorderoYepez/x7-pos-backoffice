import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchTipSettlements,
  createTipSettlement,
  updateTipSettlementStatus,
  formatSettlementCurrency,
  formatSettlementDateTime,
  calculateTipSettlementsSummaryMetrics,
} from './tip-settlements';
import type { TipSettlement } from '../types/tip-settlements';

const sampleSettlements: TipSettlement[] = [
  {
    id: 501,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 101,
    shift_id: 401,
    order_id: 5012,
    total_amount: 150.75,
    settlement_method: 'CASH',
    status: 'SETTLED',
    settled_at: '2026-09-14T18:30:00.000Z',
    settled_by: 88,
  },
  {
    id: 502,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 102,
    shift_id: 401,
    total_amount: 215.5,
    settlement_method: 'PAYROLL',
    status: 'SETTLED',
    settled_at: '2026-09-14T19:00:00.000Z',
    settled_by: 88,
  },
  {
    id: 503,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 101,
    shift_id: 402,
    total_amount: 88.0,
    settlement_method: 'BANK_TRANSFER',
    status: 'SETTLED',
    settled_at: '2026-09-15T10:00:00.000Z',
    settled_by: 88,
  },
  {
    id: 504,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 103,
    total_amount: 90.0,
    settlement_method: 'CASH',
    status: 'PENDING',
  },
  {
    id: 505,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 104,
    total_amount: 45.0,
    settlement_method: 'PAYROLL',
    status: 'PENDING',
  },
  {
    id: 506,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 105,
    total_amount: 100.0,
    settlement_method: 'CASH',
    status: 'CANCELLED',
  },
];

describe('tip-settlements API & Helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('formats currency correctly', () => {
    expect(formatSettlementCurrency(150.75)).toBe('$150.75');
    expect(formatSettlementCurrency(0)).toBe('$0.00');
    expect(formatSettlementCurrency(1234.5)).toBe('$1,234.50');
  });

  it('formats execution timestamp correctly into YYYY-MM-DD HH:mm:ss format', () => {
    const formatted = formatSettlementDateTime('2026-09-14T18:30:00.000Z');
    expect(formatted).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(formatSettlementDateTime(null)).toBe('Pending Execution');
    expect(formatSettlementDateTime(undefined)).toBe('Pending Execution');
  });

  it('calculates summary metrics accurately', () => {
    const metrics = calculateTipSettlementsSummaryMetrics(sampleSettlements);
    expect(metrics.totalCount).toBe(6);
    expect(metrics.settledCount).toBe(3);
    expect(metrics.pendingCount).toBe(2);
    expect(metrics.cancelledCount).toBe(1);
    expect(metrics.totalSettledAmount).toBe(150.75 + 215.5 + 88.0);
    expect(metrics.cashAmount).toBe(150.75);
    expect(metrics.payrollAmount).toBe(215.5);
    expect(metrics.bankTransferAmount).toBe(88.0);
  });

  it('fetches settlements via API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleSettlements,
    } as Response);

    const result = await fetchTipSettlements({
      company_id: 'cmp-01',
      merchant_id: 'mch-01',
      collaborator_id: 101,
      shift_id: 401,
    });
    expect(result).toEqual(sampleSettlements);
  });

  it('updates settlement status to SETTLED', async () => {
    const mockUpdated = { ...sampleSettlements[3], status: 'SETTLED', settled_by: 88, settled_at: new Date().toISOString() };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    } as Response);

    const updated = await updateTipSettlementStatus(504, 'SETTLED', 88, 'Manually settled by admin');
    expect(updated.status).toBe('SETTLED');
    expect(updated.settled_by).toBe(88);
  });

  it('creates new settlement record', async () => {
    const mockCreated = { id: 507, collaborator_id: 102, shift_id: 403, total_amount: 95.0, settlement_method: 'CASH', status: 'PENDING' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCreated,
    } as Response);

    const created = await createTipSettlement({
      collaborator_id: 102,
      shift_id: 403,
      total_amount: 95.0,
      settlement_method: 'CASH',
      settled_by: 88,
    });
    expect(created.id).toBe(507);
    expect(created.total_amount).toBe(95.0);
  });
});
