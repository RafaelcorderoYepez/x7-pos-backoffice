import React, { useState, useEffect } from 'react';
import { getAccessToken, getStoredUser } from '../../../../../lib/auth-storage';
import { AppModal, ModalFormFooter, ModalFormError } from '../../../shared/AppModal';

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

const PRESET_CUSTOMERS = [
  { id: 1, name: 'Carlos Mendoza', email: 'carlos.mendoza@email.com', phone: '+1 555-0192' },
  { id: 2, name: 'Sofia Valenzuela', email: 'sofia.v@email.com', phone: '+1 555-0144' },
  { id: 3, name: 'Mateo Silva', email: 'mateo.silva@email.com', phone: '+1 555-0187' },
  { id: 4, name: 'Valentina Rojas', email: 'v.rojas@email.com', phone: '+1 555-0123' },
  { id: 5, name: 'Andres Morales', email: 'andres.m@email.com', phone: '+1 555-0165' },
];

const PRESET_PRODUCTS = [
  { id: 7, name: 'Crispy Calamari', price: 14.5, defaultQty: 1 },
  { id: 3, name: 'Chocolate Lava Cake', price: 8.5, defaultQty: 1 },
  { id: 2, name: 'Craft Lemonade', price: 4.0, defaultQty: 0 },
  { id: 1, name: 'Fresh Orange Juice', price: 5.0, defaultQty: 0 },
  { id: 4, name: 'New York Cheesecake', price: 7.5, defaultQty: 0 },
];

const QUICK_NOTES = [
  'Leave at front desk / concierge',
  'Please do not ring the doorbell',
  'Sauces & dressings on the side',
  'Call upon arrival',
  'No plastic utensils',
];

export const OnlineOrdersDevSimulator: React.FC<OnlineOrdersDevSimulatorProps> = ({
  onComplete,
  stores = [],
}) => {
  // Menu Popover state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);

  // Modal form state
  const [selectedStoreId, setSelectedStoreId] = useState<number>(() => stores[0]?.id || 1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [orderType, setOrderType] = useState<'delivery' | 'pickup' | 'dine_in'>('delivery');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid');
  const [notes, setNotes] = useState<string>('Test order simulated from Backoffice.');
  const [quantities, setQuantities] = useState<Record<number, number>>({
    7: 1,
    3: 1,
  });
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

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

  // 1. Direct standard API creation helper
  const createOrderViaStandardApi = async (
    type: 'delivery' | 'pickup' | 'dine_in',
    orderNotes: string
  ) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const targetStoreId = stores[0]?.id || selectedStoreId || 1;
    const randomCust = PRESET_CUSTOMERS[Math.floor(Math.random() * PRESET_CUSTOMERS.length)];

    const res = await fetch(`${API_BASE}/online-orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storeId: targetStoreId,
        customerId: randomCust.id,
        type,
        paymentStatus: 'paid',
        notes: orderNotes,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error creating order');
    }

    const orderJson = await res.json();
    const orderId = orderJson.data?.id || orderJson.id;

    if (orderId) {
      const items = [
        { productId: 7, quantity: 2, notes: 'Extra crispy' },
        { productId: 3, quantity: 1, notes: 'Warm' },
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

  // 2. Fast reset or seed actions
  const handleAction = async (
    mode: 'simple' | 'delivery' | 'pickup' | 'dine_in' | 'seed' | 'clear'
  ) => {
    setLoading(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      let done = false;
      try {
        const res = await fetch(`${API_BASE}/online-orders/reset-test-data`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ mode }),
        });

        if (res.ok) {
          const data = await res.json();
          if (mode === 'clear') {
            await fetch(`${API_BASE}/kitchen-orders/reset-test-data`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ mode: 'clear' }),
            }).catch(() => {});
          }
          setStatusType('success');
          setStatusMessage(data.message || 'Action completed successfully!');
          done = true;
        }
      } catch {
        // Fallback to client flow
      }

      if (!done) {
        if (mode === 'clear') {
          const listRes = await fetch(`${API_BASE}/online-orders?limit=50`, { headers });
          if (listRes.ok) {
            const listData = await listRes.json();
            const orders = listData.data || listData.items || listData || [];
            for (const o of orders) {
              await fetch(`${API_BASE}/online-orders/${o.id}`, { method: 'DELETE', headers }).catch(() => {});
            }
          }
          await fetch(`${API_BASE}/kitchen-orders/reset-test-data`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ mode: 'clear' }),
          }).catch(() => {});
          setStatusType('success');
          setStatusMessage('Test orders and KDS cleared successfully!');
        } else if (mode === 'seed') {
          const orderTypes: ('delivery' | 'pickup' | 'dine_in')[] = ['delivery', 'pickup', 'dine_in'];
          for (let i = 0; i < 3; i++) {
            await createOrderViaStandardApi(
              orderTypes[i],
              `Test order #${i + 1} for dispatch flow validation.`
            );
          }
          setStatusType('success');
          setStatusMessage('Test orders generated successfully!');
        } else {
          const t = mode === 'simple' ? 'delivery' : mode;
          const note =
            t === 'delivery'
              ? '⚡ Quick Delivery order (1-Click). Leave at front desk.'
              : t === 'pickup'
              ? '⚡ Quick Pickup order (1-Click). Counter pickup.'
              : '⚡ Quick Dine-in QR order (1-Click). Table #4.';

          await createOrderViaStandardApi(t, note);
          setStatusType('success');
          setStatusMessage(`Quick ${t.toUpperCase()} order created in RECEIVED state!`);
        }
      }

      onComplete?.();

      setTimeout(() => {
        setIsMenuOpen(false);
        setStatusMessage(null);
        setStatusType(null);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setStatusType('error');
      setStatusMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  // 3. Modal Form Submit
  const handleModalSubmit = async () => {
    setModalSubmitting(true);
    setModalError(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const targetStoreId = selectedStoreId || stores[0]?.id || 1;

      // 1. Create Main Online Order
      const orderRes = await fetch(`${API_BASE}/online-orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId: targetStoreId,
          customerId: selectedCustomerId,
          type: orderType,
          paymentStatus,
          notes,
        }),
      });

      if (!orderRes.ok) {
        const errJson = await orderRes.json().catch(() => ({}));
        throw new Error(errJson.message || `Error creating order (HTTP ${orderRes.status})`);
      }

      const orderData = await orderRes.json();
      const newOrderId = orderData.data?.id || orderData.id;

      // 2. Attach selected items
      const selectedProductIds = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([id]) => Number(id));

      for (const prodId of selectedProductIds) {
        const qty = quantities[prodId] || 1;
        const prod = PRESET_PRODUCTS.find((p) => p.id === prodId);
        try {
          await fetch(`${API_BASE}/online-order-items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              onlineOrderId: newOrderId,
              productId: prodId,
              quantity: qty,
              notes: `Simulated: ${prod?.name}`,
            }),
          });
        } catch {
          // ignore non-fatal line failure
        }
      }

      setIsModalOpen(false);
      onComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create test order';
      setModalError(msg);
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleQtyChange = (productId: number, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const calculateTotal = () => {
    return PRESET_PRODUCTS.reduce((acc, p) => {
      const qty = quantities[p.id] || 0;
      return acc + qty * p.price;
    }, 0);
  };

  return (
    <>
      {/* Floating Action Button & Menu Popover */}
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
                onClick={() => void handleAction('seed')}
                className="w-full py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 rounded-lg text-[11px] font-semibold tracking-wide flex items-center justify-between transition-all cursor-pointer active:scale-95"
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-emerald-400">playlist_add</span>
                  <span>Seed 3 Orders (All Types)</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">×3</span>
              </button>

              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="w-full py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-[11px] font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-sm text-zinc-400">tune</span>
                <span>Customize Order (Modal)</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleAction('clear')}
                className="w-full py-1.5 px-2 bg-zinc-800/90 hover:bg-red-950/70 hover:border-red-500/50 disabled:opacity-50 text-zinc-300 hover:text-red-200 border border-zinc-700/70 rounded-lg text-[10px] font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-xs text-red-400">delete_sweep</span>
                <span>Clear Orders & KDS (0)</span>
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

      {/* Embedded Customize Order Modal */}
      {isModalOpen && (
        <AppModal
          title="Simulate Online Order"
          subtitle="DEVELOPMENT & DISPATCH TESTING TOOL"
          onClose={() => setIsModalOpen(false)}
          closeDisabled={modalSubmitting}
          maxWidth="max-w-2xl"
        >
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto font-sans text-xs">
            {modalError && <ModalFormError message={modalError} />}

            {/* Target Store & Customer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#1d1c17] mb-1">
                  Target Storefront
                </label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-xs bg-white focus:outline-none focus:border-[#ae001a]"
                >
                  {stores.length > 0 ? (
                    stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subdomain}.x7pos.com (Store #{s.id})
                      </option>
                    ))
                  ) : (
                    <option value={1}>bistro.x7pos.com (Store #1)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1d1c17] mb-1">
                  Customer Profile
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-xs bg-white focus:outline-none focus:border-[#ae001a]"
                >
                  {PRESET_CUSTOMERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Order Type & Payment Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#1d1c17] mb-1">
                  Order Type / Channel
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['delivery', 'pickup', 'dine_in'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOrderType(t)}
                      className={`py-2 px-1 text-center font-bold uppercase rounded border text-[11px] transition-colors cursor-pointer ${
                        orderType === t
                          ? 'bg-[#ae001a] text-white border-[#ae001a]'
                          : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-[#faf8f5]'
                      }`}
                    >
                      {t.replace('_', '-')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1d1c17] mb-1">
                  Payment Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('paid')}
                    className={`py-2 px-1 font-bold uppercase rounded border text-[11px] transition-colors cursor-pointer ${
                      paymentStatus === 'paid'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-[#faf8f5]'
                    }`}
                  >
                    Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('pending')}
                    className={`py-2 px-1 font-bold uppercase rounded border text-[11px] transition-colors cursor-pointer ${
                      paymentStatus === 'pending'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-[#faf8f5]'
                    }`}
                  >
                    Unpaid
                  </button>
                </div>
              </div>
            </div>

            {/* Product Items Picker */}
            <div className="border border-[#e8e2d8] rounded p-3 bg-white space-y-2">
              <div className="font-bold text-xs text-[#1d1c17] uppercase tracking-wider mb-1">
                Order Items & Quantity
              </div>
              <div className="divide-y divide-[#f2ede5]">
                {PRESET_PRODUCTS.map((p) => {
                  const qty = quantities[p.id] || 0;
                  return (
                    <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-[#1d1c17]">{p.name}</div>
                        <div className="text-[11px] text-[#8c857b] font-mono">${p.price.toFixed(2)} each</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(p.id, -1)}
                          disabled={qty === 0}
                          className="w-6 h-6 rounded border border-[#e8e2d8] flex items-center justify-center font-bold text-xs disabled:opacity-30 hover:bg-[#faf8f5] cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-5 text-center font-mono font-bold">{qty}</span>
                        <button
                          type="button"
                          onClick={() => handleQtyChange(p.id, 1)}
                          className="w-6 h-6 rounded border border-[#e8e2d8] flex items-center justify-center font-bold text-xs hover:bg-[#faf8f5] cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 border-t border-[#e8e2d8] flex justify-between font-bold text-xs">
                <span>Estimated Subtotal:</span>
                <span className="font-mono text-[#ae001a]">${calculateTotal().toFixed(2)}</span>
              </div>
            </div>

            {/* Special Instructions Notes */}
            <div>
              <label className="block text-xs font-semibold text-[#1d1c17] mb-1">
                Customer Instructions / Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-xs focus:outline-none focus:border-[#ae001a]"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {QUICK_NOTES.map((qn, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNotes(qn)}
                    className="text-[10px] px-2 py-0.5 rounded bg-[#f2ede5] hover:bg-[#e8e2d8] text-[#1d1c17] transition-colors cursor-pointer"
                  >
                    + {qn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ModalFormFooter
            onCancel={() => setIsModalOpen(false)}
            onSubmit={handleModalSubmit}
            isSubmitting={modalSubmitting}
            submitLabel="Inject Simulated Order"
            submittingLabel="Creating Order..."
          />
        </AppModal>
      )}
    </>
  );
};

export default OnlineOrdersDevSimulator;
