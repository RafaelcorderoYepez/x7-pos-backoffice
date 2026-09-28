import { describe, expect, it } from 'vitest';
// `?raw` (Vite) en vez de node:fs: el tsconfig de la app no carga los tipos de Node.
import featuresTxt from '../../public/Features.txt?raw';
import merchantFrameSource from '../components/MerchantFrame/MerchantFrame.tsx?raw';
import { MODULE_NAV_HUBS, navHubById, navHubForFeature } from './module-nav-hubs';

// Etiquetas EXACTAS de las historias de cada módulo.
const STORY_LABELS: Record<string, { back: string; items: string[] }> = {
  hr: {
    back: 'HR COMMAND HUB',
    items: ['COLLABORATORS', 'COLLABORATORS CONTRACTS', 'COLLABORATORS TIME ENTRIES'],
  },
  'dining-system': {
    back: 'DINING SYSTEM COMMAND HUB',
    items: ['FLOOR PLANS', 'TABLE ASSIGNMENTS', 'TABLE ZONES', 'TABLES'],
  },
  reservations: {
    back: 'RESERVATIONS COMMAND HUB',
    items: [
      'RESERVATION GUESTS',
      'RESERVATION NOTES',
      'RESERVATION STATUS HISTORY',
      'RESERVATION TABLES',
      'RESERVATIONS',
    ],
  },
  'accounts-payable': {
    back: 'ACCOUNTS PAYABLE COMMAND HUB',
    items: [
      'SUPPLIER CREDIT NOTES',
      'SUPPLIER INVOICE ITEMS',
      'SUPPLIER INVOICES',
      'SUPPLIER PAYMENT ITEMS',
      'SUPPLIER PAYMENTS',
      'SUPPLIER PAYMENTS ALLOCATION',
    ],
  },
  payrolls: {
    back: 'PAYROLLS COMMAND HUB',
    items: ['PAYROLL ADJUSTMENTS', 'PAYROLL ENTRIES', 'PAYROLL RUNS', 'PAYROLL TAX DETAIL'],
  },
  pos: {
    back: 'POS COMMAND HUB',
    items: [
      'ORDER DISCOUNTS',
      'ORDER ITEMS',
      'ORDER ITEM MODIFIERS',
      'ORDER PAYMENTS',
      'ORDER TAXES',
      'ORDERS',
    ],
  },
  'cash-drawers': {
    back: 'CASH DRAWERS COMMAND HUB',
    items: [
      'CASH DRAWER HISTORY',
      'CASH DRAWERS',
      'CASH MOVEMENTS',
      'CASH SHIFTS',
      'CASH TRANSACTIONS',
    ],
  },
  'billing-transactions': {
    back: 'BILLING & TRANSACTIONS COMMAND HUB',
    items: ['RECEIPT ITEMS', 'RECEIPTS', 'RECEIPTS TAXES'],
  },
  'financial-engine': {
    back: 'FINANCIAL ENGINE COMMAND HUB',
    items: ['JOURNAL ENTRIES', 'JOURNAL ENTRIES LINES', 'LEDGER ACCOUNTS'],
  },
  'business-partners': {
    back: 'BUSINESS PARTNERS COMMAND HUB',
    items: ['CUSTOMERS', 'SUPPLIERS'],
  },
};

const featuresByApp = (): Map<string, string[]> => {
  const rows = featuresTxt
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line: string) => line.split('|'));
  const map = new Map<string, string[]>();
  for (const [featureId, , appId] of rows) {
    map.set(appId, [...(map.get(appId) ?? []), featureId]);
  }
  return map;
};

describe('module NavHubBars', () => {
  it('covers every module of the stories with the exact labels', () => {
    expect(MODULE_NAV_HUBS.map((h) => h.appId).sort()).toEqual(Object.keys(STORY_LABELS).sort());
    for (const hub of MODULE_NAV_HUBS) {
      expect(hub.hubLabel).toBe(STORY_LABELS[hub.appId].back);
      expect(hub.items.map((i) => i.label)).toEqual(STORY_LABELS[hub.appId].items);
    }
  });

  it('links ALL the 3rd-level options of each application in Features.txt', () => {
    const catalog = featuresByApp();
    for (const hub of MODULE_NAV_HUBS) {
      expect(hub.items.map((i) => i.featureId).sort()).toEqual([...(catalog.get(hub.appId) ?? [])].sort());
    }
  });

  it('marks as live exactly the options MerchantFrame routes to a view', () => {
    const frame = merchantFrameSource;
    for (const hub of MODULE_NAV_HUBS) {
      for (const item of hub.items) {
        expect({ id: item.featureId, live: frame.includes(`activeTab === '${item.featureId}'`) }).toEqual({
          id: item.featureId,
          live: item.live,
        });
      }
    }
  });

  it('resolves a feature to its module and a hub id to its hub', () => {
    expect(navHubForFeature('collaborators-contracts')?.appId).toBe('hr');
    expect(navHubForFeature('receipt-orders')?.hubLabel).toBe('BILLING & TRANSACTIONS COMMAND HUB');
    expect(navHubForFeature('kitchen-stations')).toBeNull(); // el KDS monta su propia barra
    expect(navHubById('pos-hub')?.appId).toBe('pos');
    expect(navHubById('collaborators')).toBeNull();
  });

  it('uses unique hub ids that never collide with a real feature id', () => {
    const hubIds = MODULE_NAV_HUBS.map((h) => h.hubId);
    expect(new Set(hubIds).size).toBe(hubIds.length);
    const allFeatures = [...featuresByApp().values()].flat();
    for (const id of hubIds) expect(allFeatures).not.toContain(id);
  });
});
