import React, { useState } from 'react';
import { SideDrawer } from '../../../shared/SideDrawer';
import { ModalFormError } from '../../../shared/AppModal';

export interface OnlineOrderCustomer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

export interface OnlineOrderStore {
  id: number;
  subdomain: string;
}

export interface OnlineOrderMasterPos {
  id: number;
  status?: string;
}

export interface OnlineOrderItemDetail {
  id: number;
  productId: number;
  variantId?: number | null;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
  modifiers?: unknown;
  product?: {
    id: number;
    name: string;
    sku?: string;
    basePrice?: number;
  };
  variant?: {
    id: number;
    name: string;
    price?: number;
    sku?: string;
  } | null;
}

export interface OnlineOrderDetailData {
  id: number;
  merchantId: number;
  storeId: number;
  orderId: number | null;
  customerId: number;
  status: 'active' | 'deleted';
  type: 'delivery' | 'pickup' | 'dine_in';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  fulfillmentStatus:
    | 'received'
    | 'accepted'
    | 'in_preparation'
    | 'in_kitchen'
    | 'ready'
    | 'ready_for_pickup'
    | 'out_for_delivery'
    | 'completed'
    | 'cancelled';
  placedAt?: string | null;
  scheduledAt?: string | null;
  acceptedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  totalAmount: number;
  notes?: string | null;
  customer?: OnlineOrderCustomer;
  store?: OnlineOrderStore;
  order?: OnlineOrderMasterPos | null;
  items?: OnlineOrderItemDetail[];
}

interface OnlineOrderDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  order: OnlineOrderDetailData | null;
  onAcceptOrder?: (orderId: number) => Promise<void>;
  onCancelOrder?: (orderId: number) => Promise<void>;
  onTransitionStatus?: (
    orderId: number,
    nextStatus: OnlineOrderDetailData['fulfillmentStatus']
  ) => Promise<void>;
}

export const OnlineOrderDetailsDrawer: React.FC<OnlineOrderDetailsDrawerProps> = ({
  isOpen,
  onClose,
  order,
  onAcceptOrder,
  onCancelOrder,
  onTransitionStatus,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const formatCurrency = (val?: number | null) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(val || 0);
  };

  const formatTimestamp = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  const handleAction = async (actionFn: () => Promise<void>) => {
    try {
      setIsProcessing(true);
      setActionError(null);
      await actionFn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setActionError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const isCancelled = order.fulfillmentStatus === 'cancelled';
  const isCompleted = order.fulfillmentStatus === 'completed';

  return (
    <SideDrawer
      title={`Order Inspection #ONL-${order.id}`}
      subtitle={order.store?.subdomain ? `${order.store.subdomain}.x7pos.com` : 'ONLINE ORDERS DISPATCH'}
      onClose={onClose}
      closeDisabled={isProcessing}
      maxWidth={680}
    >
      {/* Action Error Banner */}
      {actionError && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <ModalFormError message={actionError} />
        </div>
      )}

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#faf8f5]">
        {/* 1. Status Badges Bar */}
        <div className="bg-white p-4 rounded border border-[#e8e2d8] shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Order Type */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8c857b] font-bold uppercase tracking-wider">
              Type:
            </span>
            {order.type === 'delivery' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">local_shipping</span>
                Delivery
              </span>
            )}
            {order.type === 'pickup' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">takeout_dining</span>
                Pickup
              </span>
            )}
            {order.type === 'dine_in' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-purple-50 text-purple-800 border border-purple-200 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">restaurant</span>
                Dine-In (QR)
              </span>
            )}
          </div>

          {/* Payment Status */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8c857b] font-bold uppercase tracking-wider">
              Payment:
            </span>
            {order.paymentStatus === 'paid' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                PAID
              </span>
            )}
            {order.paymentStatus === 'pending' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                UNPAID
              </span>
            )}
            {(order.paymentStatus === 'failed' || order.paymentStatus === 'refunded') && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-red-50 text-red-800 border border-red-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {order.paymentStatus.toUpperCase()}
              </span>
            )}
          </div>

          {/* Fulfillment Status */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8c857b] font-bold uppercase tracking-wider">
              Fulfillment:
            </span>
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold uppercase border flex items-center gap-1 ${
                order.fulfillmentStatus === 'received'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : order.fulfillmentStatus === 'accepted'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : order.fulfillmentStatus === 'in_preparation' ||
                    order.fulfillmentStatus === 'in_kitchen'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : order.fulfillmentStatus === 'ready' ||
                    order.fulfillmentStatus === 'ready_for_pickup' ||
                    order.fulfillmentStatus === 'out_for_delivery'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : order.fulfillmentStatus === 'completed'
                  ? 'bg-green-50 text-green-800 border-green-300'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {order.fulfillmentStatus === 'received'
                  ? 'inbox'
                  : order.fulfillmentStatus === 'accepted'
                  ? 'task_alt'
                  : order.fulfillmentStatus === 'in_preparation' ||
                    order.fulfillmentStatus === 'in_kitchen'
                  ? 'skillet'
                  : order.fulfillmentStatus === 'ready' ||
                    order.fulfillmentStatus === 'ready_for_pickup' ||
                    order.fulfillmentStatus === 'out_for_delivery'
                  ? 'notifications_active'
                  : order.fulfillmentStatus === 'completed'
                  ? 'verified'
                  : 'cancel'}
              </span>
              {order.fulfillmentStatus.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
        </div>

        {/* 2. Customer & Store Context */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Customer Profile Card */}
          <div className="bg-white p-4 rounded border border-[#e8e2d8] shadow-xs">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#8c857b] uppercase tracking-wider mb-2">
              <span className="material-symbols-outlined text-[#ae001a] text-sm">person</span>
              Customer Profile
            </div>
            <div className="font-bold text-[#1d1c17] text-sm font-sans">
              {order.customer?.name || `Customer #${order.customerId}`}
            </div>
            <div className="text-xs text-[#5f5e5e] mt-1 font-mono">
              {order.customer?.email || 'No email provided'}
            </div>
            {order.customer?.phone && (
              <div className="text-xs text-[#5f5e5e] mt-0.5 font-mono">
                Phone: {order.customer.phone}
              </div>
            )}
          </div>

          {/* Storefront Context Card */}
          <div className="bg-white p-4 rounded border border-[#e8e2d8] shadow-xs">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#8c857b] uppercase tracking-wider mb-2">
              <span className="material-symbols-outlined text-[#ae001a] text-sm">storefront</span>
              Storefront Context
            </div>
            <div className="font-bold text-[#1d1c17] text-sm font-sans">
              Store #{order.storeId}
            </div>
            <div className="text-xs text-[#5f5e5e] mt-1 font-mono">
              Subdomain: {order.store?.subdomain ? `${order.store.subdomain}.x7pos.com` : '—'}
            </div>
            <div className="text-xs text-[#8c857b] mt-0.5">
              Scheduled:{' '}
              <span className="font-medium text-[#1d1c17]">
                {formatTimestamp(order.scheduledAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Special Instructions Notes */}
        {order.notes && (
          <div className="bg-amber-50/70 border border-amber-200 rounded p-3.5 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-700 text-lg shrink-0 mt-0.5">
              speaker_notes
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
                Customer Instructions / Notes:
              </div>
              <p className="text-xs text-amber-950 mt-1 italic whitespace-pre-wrap">
                "{order.notes}"
              </p>
            </div>
          </div>
        )}

        {/* 3. Milestone Timeline */}
        <div className="bg-white p-4 rounded border border-[#e8e2d8] shadow-xs">
          <div className="text-[11px] font-bold text-[#8c857b] uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Fulfillment Timeline</span>
            <span className="font-mono text-[11px] text-[#ae001a] font-normal">
              Auto-timestamped
            </span>
          </div>

          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#e8e2d8]">
            {/* Milestone 1: Placed */}
            <div className="relative flex items-start justify-between text-xs">
              <div className="absolute -left-6 top-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border-2 border-emerald-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-[11px] font-bold">check</span>
              </div>
              <div>
                <div className="font-bold text-[#1d1c17]">1. Order Placed on Web</div>
                <div className="text-[#8c857b] text-[11px]">
                  Submitted via digital storefront
                </div>
              </div>
              <div className="font-mono text-[11px] text-[#5f5e5e] whitespace-nowrap">
                {formatTimestamp(order.placedAt || order.createdAt)}
              </div>
            </div>

            {/* Milestone 2: Accepted / Injected */}
            <div className="relative flex items-start justify-between text-xs">
              <div
                className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                  order.acceptedAt || order.orderId
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-500'
                    : 'bg-white text-slate-400 border-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-[11px] font-bold">
                  {order.acceptedAt || order.orderId ? 'check' : 'radio_button_unchecked'}
                </span>
              </div>
              <div>
                <div className="font-bold text-[#1d1c17] flex items-center gap-1.5">
                  <span>2. Accepted & Injected into POS</span>
                  {order.orderId && (
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      #ORD-{order.orderId}
                    </span>
                  )}
                </div>
                <div className="text-[#8c857b] text-[11px]">
                  {order.orderId
                    ? 'POS order created and mirrored to kitchen (KDS)'
                    : 'Awaiting dispatcher confirmation'}
                </div>
              </div>
              <div className="font-mono text-[11px] text-[#5f5e5e] whitespace-nowrap">
                {formatTimestamp(order.acceptedAt)}
              </div>
            </div>

            {/* Milestone 3: Ready */}
            <div className="relative flex items-start justify-between text-xs">
              <div
                className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                  order.readyAt
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-500'
                    : 'bg-white text-slate-400 border-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-[11px] font-bold">
                  {order.readyAt ? 'check' : 'radio_button_unchecked'}
                </span>
              </div>
              <div>
                <div className="font-bold text-[#1d1c17]">
                  3. Kitchen Ready / Dispatch Stage
                </div>
                <div className="text-[#8c857b] text-[11px]">
                  {order.type === 'delivery'
                    ? 'Bagged and ready for dispatch'
                    : 'Ready for customer pickup'}
                </div>
              </div>
              <div className="font-mono text-[11px] text-[#5f5e5e] whitespace-nowrap">
                {formatTimestamp(order.readyAt)}
              </div>
            </div>

            {/* Milestone 4: Completed */}
            <div className="relative flex items-start justify-between text-xs">
              <div
                className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                  order.completedAt
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-500'
                    : 'bg-white text-slate-400 border-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-[11px] font-bold">
                  {order.completedAt ? 'check' : 'radio_button_unchecked'}
                </span>
              </div>
              <div>
                <div className="font-bold text-[#1d1c17]">4. Completed & Fulfilled</div>
                <div className="text-[#8c857b] text-[11px]">
                  Delivered or handed over to customer
                </div>
              </div>
              <div className="font-mono text-[11px] text-[#5f5e5e] whitespace-nowrap">
                {formatTimestamp(order.completedAt)}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Itemized Product Breakdown */}
        <div className="bg-white rounded border border-[#e8e2d8] shadow-xs overflow-hidden">
          <div className="bg-[#f8f5ee] px-4 py-3 border-b border-[#e8e2d8] flex items-center justify-between">
            <div className="text-xs font-bold text-[#1d1c17] uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ae001a] text-sm">
                lunch_dining
              </span>
              <span>Order Items ({order.items?.length || 0})</span>
            </div>
            <span className="text-xs font-mono font-bold text-[#ae001a]">
              Total: {formatCurrency(order.totalAmount)}
            </span>
          </div>

          {order.items && order.items.length > 0 ? (
            <div className="divide-y divide-[#f2ede5]">
              {order.items.map((item, idx) => {
                const lineSubtotal = (item.quantity || 1) * (item.unitPrice || 0);
                return (
                  <div key={item.id || idx} className="p-4 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded bg-[#222222] text-white font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                        {item.quantity}×
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-[#1d1c17] truncate">
                          {item.product?.name || `Product #${item.productId}`}
                        </div>
                        {item.variant && (
                          <div className="text-[11px] text-purple-700 font-medium">
                            Option: {item.variant.name}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-[11px] text-[#8c857b] italic mt-0.5">
                            Note: {item.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-4 font-mono">
                      <div className="font-bold text-[#1d1c17]">
                        {formatCurrency(lineSubtotal)}
                      </div>
                      <div className="text-[10px] text-[#8c857b]">
                        {formatCurrency(item.unitPrice)} each
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-[#8c857b] italic">
              No line items loaded for this online order record.
            </div>
          )}

          {/* Grand Total */}
          <div className="bg-[#fcfcfb] p-4 border-t border-[#e8e2d8] flex justify-between items-center text-sm font-bold">
            <span className="text-[#5f5e5e] uppercase tracking-wider text-[11px] font-sans">
              Grand Total (Taxes & Fees Included)
            </span>
            <span className="text-lg font-mono text-[#1d1c17]">
              {formatCurrency(order.totalAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* Standardized Drawer Footer */}
      <div className="bg-white p-4 border-t border-[#e8e2d8] flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="h-10 px-4 border border-[#e8e2d8] rounded font-semibold text-xs text-[#1d1c17] hover:bg-[#f8f5ee] transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center"
        >
          Close
        </button>

        <div className="flex items-center gap-2.5">
          {/* Cancel Button: Only allowed prior to POS injection (when RECEIVED) */}
          {order.fulfillmentStatus === 'received' && onCancelOrder && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleAction(() => onCancelOrder(order.id))}
              className="h-10 px-4 text-xs font-bold text-red-700 hover:text-red-800 hover:bg-red-50 border border-red-200 rounded transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center"
            >
              {isProcessing ? 'Processing...' : 'Cancel Order'}
            </button>
          )}

          {/* State Transition Triggers */}
          {order.fulfillmentStatus === 'received' && onAcceptOrder && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleAction(() => onAcceptOrder(order.id))}
              className="h-10 px-5 rounded text-white text-xs font-bold uppercase tracking-wider bg-[#ae001a] hover:bg-[#d2272f] transition-all inline-flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              {isProcessing ? 'Accepting...' : 'ACCEPT ORDER'}
            </button>
          )}

          {order.fulfillmentStatus === 'accepted' && onTransitionStatus && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() =>
                handleAction(() => onTransitionStatus(order.id, 'in_preparation'))
              }
              className="h-10 px-5 rounded text-white text-xs font-bold uppercase tracking-wider bg-amber-600 hover:bg-amber-700 transition-all inline-flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">skillet</span>
              {isProcessing ? 'Updating...' : 'START PREPARATION'}
            </button>
          )}

          {(order.fulfillmentStatus === 'in_preparation' ||
            order.fulfillmentStatus === 'in_kitchen') &&
            onTransitionStatus && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleAction(() => onTransitionStatus(order.id, 'ready'))}
                className="h-10 px-5 rounded text-white text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 transition-all inline-flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">notifications_active</span>
                {isProcessing ? 'Updating...' : 'MARK READY FOR DISPATCH'}
              </button>
            )}

          {(order.fulfillmentStatus === 'ready' ||
            order.fulfillmentStatus === 'ready_for_pickup' ||
            order.fulfillmentStatus === 'out_for_delivery') &&
            onTransitionStatus && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  handleAction(() => onTransitionStatus(order.id, 'completed'))
                }
                className="h-10 px-5 rounded text-white text-xs font-bold uppercase tracking-wider bg-green-600 hover:bg-green-700 transition-all inline-flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">verified</span>
                {isProcessing ? 'Completing...' : 'COMPLETE ORDER'}
              </button>
            )}
        </div>
      </div>
    </SideDrawer>
  );
};
