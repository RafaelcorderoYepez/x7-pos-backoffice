import React, { useState, useEffect } from 'react';
import { getAccessToken, getStoredUser } from '../../../../../lib/auth-storage';

export interface OnlineStoreOption {
  id: number;
  subdomain: string;
  name?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface OnlineOrdersDevSimulatorProps {
  onComplete?: () => void;
  stores?: OnlineStoreOption[];
}

export const OnlineOrdersDevSimulator: React.FC<OnlineOrdersDevSimulatorProps> = ({
  onComplete,
  stores = [],
}) => {
  // Menu Popover state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);

  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    const user = getStoredUser();
    return Boolean(
      import.meta.env.DEV ||
      user?.role === 'merchant_admin' ||
      user?.role === 'super_admin' ||
      user?.role === 'portal_admin' ||
      user?.email?.includes('admin') ||
      localStorage.getItem('x7_online_orders_dev_tools') === 'true'
    );
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setIsVisible((prev) => {
          const next = !prev;
          localStorage.setItem('x7_online_orders_dev_tools', String(next));
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isVisible) return null;

  // Direct standard API creation helper
  const createOrderViaStandardApi = async (
    type: 'delivery' | 'pickup' | 'dine_in',
    orderNotes: string
  ) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    let targetStoreId = stores[0]?.id;
    if (!targetStoreId) {
      try {
        const storeRes = await fetch(`${API_BASE}/online-stores`, { headers });
        if (storeRes.ok) {
          const storeData = await storeRes.json();
          const list = Array.isArray(storeData) ? storeData : storeData.data || [];
          if (list.length > 0) targetStoreId = list[0].id;
        }
      } catch {
        // ignore
      }
    }
    if (!targetStoreId) targetStoreId = 1;

    let targetCustomerId = 1;
    try {
      const custRes = await fetch(`${API_BASE}/customers?limit=5`, { headers });
      if (custRes.ok) {
        const custData = await custRes.json();
        const custList = Array.isArray(custData) ? custData : custData.data || custData.items || [];
        if (custList.length > 0) {
          const pick = custList[Math.floor(Math.random() * custList.length)];
          if (pick?.id) targetCustomerId = pick.id;
        }
      }
    } catch {
      // ignore
    }

    const res = await fetch(`${API_BASE}/online-orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storeId: targetStoreId,
        customerId: targetCustomerId,
        type,
        paymentStatus: 'paid',
        notes: orderNotes,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error creating order (HTTP ${res.status})`);
    }

    const orderJson = await res.json();
    const orderId = orderJson.data?.id || orderJson.id;

    if (orderId) {
      // Find valid product ids
      let p1 = 7;
      let p2 = 3;
      try {
        const prodRes = await fetch(`${API_BASE}/products?limit=5`, { headers });
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          const prodList = Array.isArray(prodData) ? prodData : prodData.data || prodData.items || [];
          if (prodList.length > 0) p1 = prodList[0].id;
          if (prodList.length > 1) p2 = prodList[1].id;
          else p2 = p1;
        }
      } catch {
        // ignore
      }

      const items = [
        { productId: p1, quantity: 2, notes: 'Extra portion' },
        { productId: p2, quantity: 1, notes: 'Artisan beverage' },
      ];
      for (const item of items) {
        try {
          await fetch(`${API_BASE}/online-order-items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              onlineOrderId: orderId,
              productId: item.productId,
              quantity: item.quantity,
              notes: item.notes,
            }),
          });
        } catch {
          // ignore item creation non-fatal error
        }
      }
    }

    return orderId;
  };

  const handleAction = async (mode: 'delivery' | 'pickup' | 'dine_in' | 'clear') => {
    setLoading(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (mode === 'clear') {
        let cleared = false;
        try {
          const res = await fetch(`${API_BASE}/online-orders/reset-test-data`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ mode: 'clear' }),
          });
          if (res.ok) {
            await fetch(`${API_BASE}/kitchen-orders/reset-test-data`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ mode: 'clear' }),
            }).catch(() => {});
            cleared = true;
          }
        } catch {
          // fallback
        }

        if (!cleared) {
          const listRes = await fetch(`${API_BASE}/online-orders?limit=50`, { headers });
          if (listRes.ok) {
            const listData = await listRes.json();
            const orderList = listData.data || listData.items || listData || [];
            for (const o of orderList) {
              await fetch(`${API_BASE}/online-orders/${o.id}`, { method: 'DELETE', headers }).catch(() => {});
            }
          }
          await fetch(`${API_BASE}/kitchen-orders/reset-test-data`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ mode: 'clear' }),
          }).catch(() => {});
        }

        setStatusType('success');
        setStatusMessage('Test orders and KDS cleared successfully!');
      } else {
        const note =
          mode === 'delivery'
            ? '⚡ Quick Delivery order (1-Click). Leave at front desk.'
            : mode === 'pickup'
            ? '⚡ Quick Pickup order (1-Click). Counter pickup.'
            : '⚡ Quick Dine-in QR order (1-Click). Table #4.';

        let done = false;
        let lastError = '';
        try {
          const res = await fetch(`${API_BASE}/online-orders/reset-test-data`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ mode }),
          });
          if (res.ok) {
            const data = await res.json();
            setStatusType('success');
            setStatusMessage(data.message || `Quick ${mode.toUpperCase()} order created!`);
            done = true;
          } else {
            const errJson = await res.json().catch(() => ({}));
            lastError = errJson.message || `Server responded with ${res.status}`;
          }
        } catch (fetchErr) {
          lastError = fetchErr instanceof Error ? fetchErr.message : 'Network error';
        }

        if (!done) {
          try {
            await createOrderViaStandardApi(mode, note);
            setStatusType('success');
            setStatusMessage(`Quick ${mode.toUpperCase()} order created in RECEIVED state!`);
          } catch (stdErr) {
            throw new Error(
              lastError || (stdErr instanceof Error ? stdErr.message : 'Failed to create order'),
              { cause: stdErr }
            );
          }
        }
      }

      onComplete?.();

      setTimeout(() => {
        setIsMenuOpen(false);
        setStatusMessage(null);
        setStatusType(null);
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setStatusType('error');
      setStatusMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {isMenuOpen && (
        <div className="bg-[#1c1d22] border border-zinc-700/80 rounded-xl p-3 shadow-2xl w-64 backdrop-blur-md animate-fade-in font-sans text-xs text-zinc-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-700/60">
            <div className="flex items-center gap-1.5 font-bold text-white tracking-wider text-[11px] uppercase">
              <span className="material-symbols-outlined text-[#ae001a] text-base">construction</span>
              <span>Dev Orders Simulator</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">Ctrl+Shift+O</span>
          </div>

          {/* Notification Banner */}
          {statusMessage && (
            <div
              className={`p-2 mb-2 rounded text-[11px] font-medium leading-tight ${
                statusType === 'success'
                  ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-500/40'
                  : 'bg-red-950/80 text-red-200 border border-red-500/40'
              }`}
            >
              {statusMessage}
            </div>
          )}

          {/* Actions Grid */}
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleAction('delivery')}
              className="w-full py-1.5 px-2 bg-blue-950/50 hover:bg-blue-900/60 disabled:opacity-50 text-blue-200 border border-blue-800/60 rounded-lg text-[11px] font-semibold tracking-wide flex items-center justify-between transition-all cursor-pointer active:scale-95"
            >
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-blue-400">local_shipping</span>
                <span>1-Click Delivery</span>
              </span>
              <span className="text-[10px] font-mono text-blue-300">$23.00</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleAction('pickup')}
              className="w-full py-1.5 px-2 bg-amber-950/50 hover:bg-amber-900/60 disabled:opacity-50 text-amber-200 border border-amber-800/60 rounded-lg text-[11px] font-semibold tracking-wide flex items-center justify-between transition-all cursor-pointer active:scale-95"
            >
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-amber-400">takeout_dining</span>
                <span>1-Click Pickup</span>
              </span>
              <span className="text-[10px] font-mono text-amber-300">$23.00</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleAction('dine_in')}
              className="w-full py-1.5 px-2 bg-purple-950/50 hover:bg-purple-900/60 disabled:opacity-50 text-purple-200 border border-purple-800/60 rounded-lg text-[11px] font-semibold tracking-wide flex items-center justify-between transition-all cursor-pointer active:scale-95"
            >
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-purple-400">restaurant</span>
                <span>1-Click Dine-In QR</span>
              </span>
              <span className="text-[10px] font-mono text-purple-300">$23.00</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleAction('clear')}
              className="w-full py-1.5 px-2 bg-zinc-800/90 hover:bg-red-950/70 hover:border-red-500/50 disabled:opacity-50 text-zinc-300 hover:text-red-200 border border-zinc-700/70 rounded-lg text-[10px] font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-xs text-red-400">delete_sweep</span>
              <span>Clear Orders & KDS</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Wrench Toggle Button */}
      <button
        type="button"
        onClick={() => setIsMenuOpen((prev) => !prev)}
        title="Online Orders Dev Simulator (Ctrl+Shift+O)"
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 cursor-pointer border ${
          isMenuOpen
            ? 'bg-[#ae001a] text-white border-white scale-105 shadow-[#ae001a]/50 ring-2 ring-[#ae001a]/30'
            : 'bg-[#1c1d22] hover:bg-[#282930] text-zinc-300 hover:text-white border-zinc-700 hover:border-zinc-400 hover:scale-105 active:scale-95'
        }`}
      >
        <span className="material-symbols-outlined text-lg">
          {isMenuOpen ? 'close' : 'construction'}
        </span>
      </button>
    </div>
  );
};

export default OnlineOrdersDevSimulator;
