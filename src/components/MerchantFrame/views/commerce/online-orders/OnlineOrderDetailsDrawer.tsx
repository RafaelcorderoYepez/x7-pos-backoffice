import React, { useState } from 'react';
import { SideDrawer } from '../../../shared/SideDrawer';
import { ModalFormError } from '../../../shared/AppModal';

export interface OnlineOrderKitchenStation {
  id: number;
  name: string;
}

export interface OnlineOrderKitchenTicket {
  id: number;
  stationId?: number | null;
  priority?: number;
  businessStatus?: string;
  station?: OnlineOrderKitchenStation | null;
}

export interface KitchenStationOption {
  id: number;
  name: string;
  stationType?: string;
  displayOrder?: number;
  stationNumber?: number;
}

export interface OnlineOrderCustomer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
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
  kitchenOrders?: OnlineOrderKitchenTicket[];
}

interface OnlineOrderDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  order: OnlineOrderDetailData | null;
  kitchenStations?: KitchenStationOption[];
  onAcceptOrder?: (orderId: number, stationId?: number) => Promise<void>;
  onCancelOrder?: (orderId: number) => Promise<void>;
  onTransitionStatus?: (
    orderId: number,
    nextStatus: OnlineOrderDetailData['fulfillmentStatus']
  ) => Promise<void>;
  onUpdatePaymentStatus?: (
    orderId: number,
    nextPaymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
  ) => Promise<void>;
  onEditOrder?: (order: OnlineOrderDetailData) => void;
}

export const isOnlineOrderEditable = (
  order?: { fulfillmentStatus?: string } | null
): boolean => {
  if (!order || !order.fulfillmentStatus) return false;
  return order.fulfillmentStatus === 'received' || order.fulfillmentStatus === 'accepted';
};

export const OnlineOrderDetailsDrawer: React.FC<OnlineOrderDetailsDrawerProps> = ({
  isOpen,
  onClose,
  order,
  kitchenStations = [],
  onAcceptOrder,
  onCancelOrder,
  onTransitionStatus,
  onUpdatePaymentStatus,
  onEditOrder,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  // Active / selected kitchen station
  const currentKitchenStationId =
    order?.kitchenOrders?.[0]?.stationId ??
    order?.kitchenOrders?.[0]?.station?.id ??
    null;

  const currentKitchenStationName =
    order?.kitchenOrders?.[0]?.station?.name ??
    kitchenStations.find((s) => s.id === currentKitchenStationId)?.name ??
    null;

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
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 bg-[#faf8f5]">
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
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1" title="Payment registered and synchronized with POS">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                PAID
              </span>
            )}
            {order.paymentStatus === 'pending' && (
              <div className="flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  UNPAID
                </span>
                {onUpdatePaymentStatus && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleAction(() => onUpdatePaymentStatus(order.id, 'paid'))}
                    className="px-2 py-0.5 rounded text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer inline-flex items-center gap-0.5 shadow-2xs"
                    title="Mark payment as PAID (syncs with POS)"
                  >
                    <span className="material-symbols-outlined text-[13px]">check</span>
                    Mark as Paid
                  </button>
                )}
              </div>
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

          {/* Kitchen / KDS Synchronization State */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8c857b] font-bold uppercase tracking-wider">
              KDS Kitchen:
            </span>
            {order.fulfillmentStatus === 'received' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-gray-50 text-gray-600 border border-gray-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">hourglass_empty</span>
                Not in Kitchen
              </span>
            )}
            {order.fulfillmentStatus === 'accepted' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">soup_kitchen</span>
                Queued in KDS
              </span>
            )}
            {(order.fulfillmentStatus === 'in_preparation' ||
              order.fulfillmentStatus === 'in_kitchen') && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] animate-spin">skillet</span>
                Cooking on Line
              </span>
            )}
            {(order.fulfillmentStatus === 'ready' ||
              order.fulfillmentStatus === 'ready_for_pickup' ||
              order.fulfillmentStatus === 'out_for_delivery') && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Kitchen Ready
              </span>
            )}
            {order.fulfillmentStatus === 'completed' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-green-50 text-green-800 border border-green-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">verified</span>
                Dispatched
              </span>
            )}
            {order.fulfillmentStatus === 'cancelled' && (
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">cancel</span>
                Cancelled
              </span>
            )}
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
            <div className="text-xs text-[#5f5e5e] mt-0.5 font-mono">
              Phone: {order.customer?.phone || 'No phone provided'}
            </div>
            {order.customer?.address && (
              <div className="text-xs text-[#5f5e5e] mt-0.5 font-mono">
                Address: {order.customer.address}{order.customer.city ? `, ${order.customer.city}` : ''}
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

        {/* Special Instructions Notes - Prominently Highlighted */}
        {order.notes ? (
          <div className="bg-amber-100/90 border-2 border-amber-500 rounded-xl p-4 shadow-xs flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-lg">speaker_notes</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-amber-800">priority_high</span>
                <span>CUSTOMER INSTRUCTIONS / KITCHEN NOTES</span>
              </div>
              <p className="text-xs font-bold text-amber-950 mt-1.5 italic whitespace-pre-wrap bg-white/80 p-2.5 rounded-lg border border-amber-300 shadow-2xs">
                "{order.notes}"
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white p-3 rounded-lg border border-[#e8e2d8] text-xs text-[#8c857b] flex items-center gap-2 italic">
            <span className="material-symbols-outlined text-sm text-[#8c857b]">speaker_notes_off</span>
            <span>No customer special instructions provided for this order.</span>
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
      <div className="bg-white p-4 border-t border-[#e8e2d8] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="h-10 px-4 border border-[#e8e2d8] rounded font-semibold text-xs text-[#1d1c17] hover:bg-[#f8f5ee] transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center"
          >
            Close
          </button>

          {/* Print Kitchen Receipt button */}
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="h-10 px-3.5 border border-[#d5cfc4] rounded font-bold text-xs text-[#1d1c17] hover:bg-[#f8f5ee] hover:border-[#ae001a] hover:text-[#ae001a] transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-2xs"
            title="Print Kitchen Expedite Receipt"
          >
            <span className="material-symbols-outlined text-[17px]">print</span>
            <span>Print Receipt</span>
          </button>

          {/* Edit Order button - only in permitted fulfillment stages */}
          {onEditOrder && isOnlineOrderEditable(order) && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditOrder(order);
              }}
              className="h-10 px-3.5 border border-[#d5cfc4] rounded font-bold text-xs text-[#1d1c17] hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-2xs"
              title="Edit online order parameters"
            >
              <span className="material-symbols-outlined text-[17px]">edit</span>
              <span>Edit Order</span>
            </button>
          )}
        </div>

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

          {order.fulfillmentStatus === 'received' && onTransitionStatus && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() =>
                handleAction(() => onTransitionStatus(order.id, 'in_preparation'))
              }
              className="h-10 px-4 rounded text-white text-xs font-bold uppercase tracking-wider bg-amber-600 hover:bg-amber-700 transition-all inline-flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Accept and start preparation in kitchen immediately"
            >
              <span className="material-symbols-outlined text-base">skillet</span>
              {isProcessing ? 'Updating...' : 'START PREPARATION'}
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
                onClick={() =>
                  handleAction(() =>
                    onTransitionStatus(
                      order.id,
                      order.type === 'delivery'
                        ? 'out_for_delivery'
                        : 'ready_for_pickup'
                    )
                  )
                }
                className="h-10 px-5 rounded text-white text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 transition-all inline-flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Mark order ready for pickup or delivery (syncs KDS as completed)"
              >
                <span className="material-symbols-outlined text-base">notifications_active</span>
                {isProcessing
                  ? 'Updating...'
                  : order.type === 'delivery'
                  ? 'MARK READY FOR DELIVERY'
                  : 'MARK READY FOR PICKUP'}
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

      {/* Kitchen Receipt Thermal Slip Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #kitchen-printable-ticket, #kitchen-printable-ticket * {
                visibility: visible !important;
              }
              #kitchen-printable-ticket {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 80mm !important;
                margin: 0 auto !important;
                padding: 8px !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
                color: black !important;
              }
            }
          `}</style>
          <div className="bg-white rounded-2xl shadow-2xl border border-[#e8e2d8] max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-[#222222] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ae001a]">print</span>
                <span className="text-sm font-bold uppercase tracking-wider">
                  Kitchen Receipt Preview
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Printable Thermal Receipt Container */}
            <div className="p-6 overflow-y-auto flex-1 bg-[#f7f5f0]">
              <div
                id="kitchen-printable-ticket"
                className="bg-white border-2 border-dashed border-zinc-400 p-6 rounded shadow-sm text-black font-mono text-xs space-y-4"
              >
                {/* Header */}
                <div className="text-center border-b border-dashed border-zinc-400 pb-3 space-y-1">
                  <div className="text-sm font-black tracking-widest uppercase text-black">
                    *** KITCHEN EXPEDITE TICKET ***
                  </div>
                  <div className="text-xs font-bold text-black">
                    {order.store?.subdomain ? `${order.store.subdomain}.x7pos.com` : 'ONLINE STORE'} (Store #{order.storeId})
                  </div>
                  <div className="text-sm font-black text-black">
                    ONLINE ORDER #{order.id}
                  </div>
                  {order.orderId ? (
                    <div className="text-xs font-bold text-black">
                      POS BIND: #ORD-{order.orderId}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-600 font-bold">
                      POS BIND: PENDING INJECTION
                    </div>
                  )}
                </div>

                {/* Meta Info */}
                <div className="grid gap-x-2 gap-y-1.5 text-[11px] border-b border-dashed border-zinc-400 pb-3">
                  <div>
                    <span className="text-zinc-600 font-bold">PLACED:</span>{' '}
                    <span className="font-bold text-black">{formatTimestamp(order.placedAt || order.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600 font-bold">TYPE:</span>{' '}
                    <span className="font-black uppercase border border-black px-1.5 py-0.5 rounded text-black bg-zinc-100">
                      {order.type}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-600 font-bold">CUSTOMER:</span>{' '}
                    <span className="font-bold text-black">{order.customer?.name || `Customer #${order.customerId}`}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600 font-bold">PHONE:</span>{' '}
                    <span className="font-bold text-black">{order.customer?.phone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600 font-bold">PAYMENT:</span>{' '}
                    <span className="font-bold text-black uppercase">{order.paymentStatus || 'PENDING'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600 font-bold">STATUS:</span>{' '}
                    <span className="font-bold text-black uppercase">{order.fulfillmentStatus?.replace(/_/g, ' ') || 'RECEIVED'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600 font-bold">KITCHEN STATION:</span>{' '}
                    <span className="font-bold text-black uppercase">
                      {currentKitchenStationName || 'HOT LINE (DEFAULT)'}
                    </span>
                  </div>
                  {order.type === 'delivery' && (
                    <div className="col-span-2 text-black">
                      <span className="text-zinc-600 font-bold">DELIVERY ADDR:</span>{' '}
                      <span className="font-bold">
                        {order.customer?.address
                          ? `${order.customer.address}${order.customer.city ? `, ${order.customer.city}` : ''}`
                          : '—'}
                      </span>
                    </div>
                  )}
                  {order.scheduledAt && (
                    <div className="col-span-2 text-black font-bold">
                      SCHEDULED: {formatTimestamp(order.scheduledAt)}
                    </div>
                  )}
                </div>

                {/* PROMINENT SPECIAL NOTES DISPLAY (THERMAL MONOCHROME COMPLIANT) */}
                {order.notes ? (
                  <div className="border-2 border-black bg-white text-black p-2.5 my-2 space-y-1 font-mono">
                    <div className="text-[11px] font-black uppercase tracking-wider text-black flex items-center justify-between border-b border-black pb-1">
                      <span>*** CUSTOMER INSTRUCTIONS / NOTES ***</span>
                      <span className="font-bold">[!]</span>
                    </div>
                    <div className="text-xs font-bold uppercase p-1 text-black whitespace-pre-wrap">
                      "{order.notes}"
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-500 italic text-center py-1">
                    (No special customer instructions)
                  </div>
                )}

                {/* Items Table */}
                <div className="border-t border-dashed border-zinc-400 pt-3 space-y-2">
                  <div className="flex justify-between font-bold text-[11px] text-zinc-600 border-b border-zinc-200 pb-1">
                    <span>QTY & ITEM</span>
                    <span>AMOUNT</span>
                  </div>
                  {order.items && order.items.length > 0 ? (
                    order.items.map((it, idx) => (
                      <div key={it.id || idx} className="space-y-0.5">
                        <div className="flex justify-between font-bold text-xs">
                          <span>
                            {it.quantity}x {it.product?.name || `Product #${it.productId}`}
                          </span>
                          <span>{formatCurrency((it.quantity || 1) * (it.unitPrice || 0))}</span>
                        </div>
                        {it.variant && (
                          <div className="text-[10px] text-zinc-600 pl-4">
                            Option: {it.variant.name}
                          </div>
                        )}
                        {it.notes && (
                          <div className="text-[10px] text-black font-bold pl-4">
                            * Note: {it.notes}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-zinc-400 italic py-2">
                      No items listed on order
                    </div>
                  )}
                </div>

                {/* Total Amount */}
                <div className="border-t-2 border-zinc-800 pt-3 flex justify-between items-center text-sm font-black">
                  <span>TOTAL AMOUNT:</span>
                  <span className="text-base">{formatCurrency(order.totalAmount)}</span>
                </div>

                {/* Footer Receipt Bar */}
                <div className="text-center text-[10px] text-zinc-500 border-t border-dashed border-zinc-400 pt-2">
                  <div>Printed via X7POS Commerce Kitchen Dispatch</div>
                  <div>{new Date().toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-white border-t border-[#e8e2d8] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-lg bg-[#ae001a] hover:bg-[#d2272f] text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">print</span>
                <span>Send to Printer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </SideDrawer>
  );
};
