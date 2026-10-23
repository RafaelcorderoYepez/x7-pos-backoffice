import React, { useState, useMemo } from 'react';
import { AppModal } from '../../../shared/AppModal';
import type { OnlineOrderDetailData } from './OnlineOrderDetailsDrawer';

interface CancelledOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: OnlineOrderDetailData[];
  onInspectOrder: (order: OnlineOrderDetailData) => void;
  formatCurrency: (amount?: number) => string;
  formatTimestamp: (dateStr?: string) => string;
}

export const CancelledOrdersModal: React.FC<CancelledOrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
  onInspectOrder,
  formatCurrency,
  formatTimestamp,
}) => {
  const [search, setSearch] = useState('');

  const cancelledOrders = useMemo(() => {
    return orders.filter((o) => o.fulfillmentStatus === 'cancelled');
  }, [orders]);

  const calculateOrderTotal = (order: OnlineOrderDetailData): number => {
    if (order.totalAmount && Number(order.totalAmount) > 0) {
      return Number(order.totalAmount);
    }
    if (order.items && order.items.length > 0) {
      return order.items.reduce((sum, item) => {
        const price =
          Number(item.unitPrice) ||
          Number(item.variant?.price) ||
          Number(item.product?.basePrice) ||
          0;
        return sum + price * (item.quantity || 1);
      }, 0);
    }
    return 0;
  };

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return cancelledOrders;
    const q = search.toLowerCase().trim();
    return cancelledOrders.filter((o) => {
      const idStr = `#onl-${o.id}`.toLowerCase();
      const rawId = String(o.id);
      const custName = o.customer?.name?.toLowerCase() || '';
      const custEmail = o.customer?.email?.toLowerCase() || '';
      const notes = o.notes?.toLowerCase() || '';
      const storeSub = o.store?.subdomain?.toLowerCase() || '';
      return (
        idStr.includes(q) ||
        rawId.includes(q) ||
        custName.includes(q) ||
        custEmail.includes(q) ||
        notes.includes(q) ||
        storeSub.includes(q)
      );
    });
  }, [cancelledOrders, search]);

  const totalCancelledAmount = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0);
  }, [filteredOrders]);

  if (!isOpen) return null;

  return (
    <AppModal
      title="Cancelled Orders Archive"
      subtitle="COMMERCE • ONLINE ORDERING SYSTEM"
      titleId="cancelled-orders-archive-title"
      onClose={onClose}
      closeAriaLabel="Close cancelled orders archive"
      size="4xl"
    >
      <div className="flex flex-col max-h-[calc(90vh-70px)] font-sans">
        {/* Subheader / Search & Summary Bar */}
        <div className="bg-[#f7f5f0] px-5 py-3 border-b border-[#e8e2d8] flex items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8c857b] text-sm">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by #ONL-ID, customer, phone, notes..."
              className="w-full h-8 pl-8 pr-8 bg-white border border-[#d5cfc4] rounded text-xs text-[#1d1c17] placeholder-[#8c857b] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#8c857b] hover:text-[#1d1c17]"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-[#5f5e5e] shrink-0">
            <span>
              Orders:{' '}
              <span className="font-bold font-mono text-[#1d1c17]">
                {filteredOrders.length}
              </span>
            </span>
            <span className="text-[#d5cfc4]">•</span>
            <span>
              Total Value:{' '}
              <span className="font-bold font-mono text-[#ae001a]">
                {formatCurrency(totalCancelledAmount)}
              </span>
            </span>
          </div>
        </div>

        {/* Orders List Container */}
        <div className="p-5 overflow-y-auto space-y-3.5 flex-1 bg-white">
          {filteredOrders.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#f2ede5] flex items-center justify-center text-[#8c857b] mb-3">
                <span className="material-symbols-outlined text-2xl">
                  {cancelledOrders.length === 0 ? 'check_circle' : 'search_off'}
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#1d1c17] mb-1">
                {cancelledOrders.length === 0
                  ? 'No Cancelled Orders'
                  : 'No matching cancelled orders'}
              </h4>
              <p className="text-xs text-[#8c857b] max-w-sm mx-auto">
                {cancelledOrders.length === 0
                  ? 'There are currently no cancelled online orders in this merchant account.'
                  : 'Try searching with another keyword, customer name or order number.'}
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const orderTotal = calculateOrderTotal(order);

              return (
                <div
                  key={order.id}
                  className="bg-white border border-[#e8e2d8] hover:border-red-300 rounded p-4 shadow-xs transition-colors flex flex-col gap-3"
                >
                  {/* Top Bar of Card */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-[#f2ede5]">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#1d1c17] text-white font-mono font-bold text-xs tracking-wider">
                        #ONL-{order.id}
                      </span>

                      {/* Type Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          order.type === 'delivery'
                            ? 'bg-blue-100 text-blue-800'
                            : order.type === 'pickup'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {order.type}
                      </span>

                      {/* Store Subdomain */}
                      {order.store?.subdomain && (
                        <span className="text-[11px] font-mono text-[#8c857b]">
                          {order.store.subdomain}.x7pos.com
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#8c857b]">
                        {formatTimestamp(order.placedAt || order.createdAt)}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                        CANCELLED
                      </span>
                    </div>
                  </div>

                  {/* Customer & Info */}
                  <div className="flex items-start justify-between gap-4 flex-wrap text-xs">
                    <div>
                      <div className="font-bold text-[#1d1c17] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[#8c857b]">
                          person
                        </span>
                        <span>{order.customer?.name || 'Walk-in / Guest Customer'}</span>
                      </div>
                      {order.customer?.phone && (
                        <div className="text-[11px] text-[#8c857b] ml-5">
                          {order.customer.phone}
                        </div>
                      )}
                      {order.customer?.email && (
                        <div className="text-[11px] text-[#8c857b] ml-5">
                          {order.customer.email}
                        </div>
                      )}
                    </div>

                    {/* Amount & Items Count */}
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm text-[#1d1c17]">
                        {formatCurrency(orderTotal)}
                      </div>
                      <div className="text-[11px] text-[#8c857b]">
                        {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'items'}
                      </div>
                    </div>
                  </div>

                  {/* Line Items List preview */}
                  {order.items && order.items.length > 0 && (
                    <div className="bg-[#fcfbf9] rounded p-2.5 text-xs text-[#5f5e5e] border border-[#f0ebe1] space-y-1">
                      {order.items.map((item, idx) => {
                        const itemUnitPrice =
                          Number(item.unitPrice) ||
                          Number(item.variant?.price) ||
                          Number(item.product?.basePrice) ||
                          0;

                        return (
                          <div key={idx} className="flex justify-between items-center text-[11px]">
                            <span className="font-medium text-[#1d1c17]">
                              {item.quantity}x {item.product?.name || `Product #${item.productId}`}
                            </span>
                            <span className="font-mono text-[#8c857b]">
                              {itemUnitPrice > 0
                                ? formatCurrency(itemUnitPrice * item.quantity)
                                : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Notes / Reason */}
                  {order.notes && (
                    <div className="flex items-start gap-1.5 bg-amber-50/80 border border-amber-200/60 rounded p-2 text-[11px] text-amber-900">
                      <span className="material-symbols-outlined text-amber-600 text-sm shrink-0 mt-0.5">
                        sticky_note_2
                      </span>
                      <span className="break-words">{order.notes}</span>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onInspectOrder(order);
                        onClose();
                      }}
                      className="px-3.5 py-1.5 bg-[#1d1c17] hover:bg-[#ae001a] text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      <span>Inspect Details</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#f7f5f0] px-5 py-3 border-t border-[#e8e2d8] flex items-center justify-between shrink-0">
          <div className="text-xs text-[#5f5e5e]">
            Showing{' '}
            <span className="font-bold text-[#1d1c17]">
              {filteredOrders.length}
            </span>{' '}
            of{' '}
            <span className="font-bold text-[#1d1c17]">
              {cancelledOrders.length}
            </span>{' '}
            cancelled orders
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-[#d5cfc4] hover:bg-[#f2ede5] text-[#1d1c17] text-xs font-bold rounded transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </AppModal>
  );
};

export default CancelledOrdersModal;
