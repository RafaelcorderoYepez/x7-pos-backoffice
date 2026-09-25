import React from 'react';
import type { KitchenTicket } from './KitchenMonitorView';

export interface ThermalTicketPayload {
  stationName: string;
  stationNumber?: number;
  printerName: string;
  reason: string;
  tickets: KitchenTicket[];
  emittedAt: string;
}

interface ThermalTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: ThermalTicketPayload | null;
}

export const ThermalTicketModal: React.FC<ThermalTicketModalProps> = ({
  isOpen,
  onClose,
  payload,
}) => {
  if (!isOpen || !payload) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden animate-fade-in">
      <div className="relative w-full max-w-md bg-[#18191e] border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-zinc-800 to-zinc-900 border-b border-zinc-700">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-amber-400 text-xl">print</span>
            <div>
              <div
                className="text-sm font-black uppercase tracking-wider !text-white"
                style={{ color: '#ffffff', fontSize: '14px', lineHeight: '1.2' }}
              >
                Thermal Printer Fallback
              </div>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                Hardware redirection simulation: {payload.printerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Realistic Thermal Receipt Paper Container */}
        <div
          className="p-6 bg-[#121316] overflow-y-auto max-h-[65vh] no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div
            id="kds-thermal-receipt"
            className="w-72 mx-auto bg-[#fffdfa] text-zinc-900 font-mono text-xs p-5 shadow-2xl relative border-t-4 border-b-4 border-dashed border-zinc-400 rounded-sm my-1"
            style={{
              fontFamily: '"Courier New", Courier, monospace',
              lineHeight: '1.35',
            }}
          >
            {/* Cut-edge styling header */}
            <div className="text-center border-b border-dashed border-zinc-500 pb-3 mb-3">
              <div className="font-black text-sm tracking-tighter">*** X7 POS KITCHEN ***</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-red-700 mt-0.5">
                THERMAL FALLBACK DISPATCH
              </div>
              <div className="text-[11px] font-semibold mt-1">PRINTER: {payload.printerName}</div>
              <div className="text-[9px] text-zinc-600">
                DATE: {payload.emittedAt}
              </div>
            </div>

            {/* Station and Reason Warning Banner */}
            <div className="bg-zinc-200 p-2 rounded mb-3 text-center border border-zinc-400">
              <div className="font-extrabold text-[11px] text-zinc-900 uppercase">
                STATION: {payload.stationName}
              </div>
              <div className="text-[10px] text-red-700 font-bold mt-0.5">
                CAUSE: {payload.reason}
              </div>
            </div>

            {/* Ticket Breakdown */}
            {payload.tickets.length === 0 ? (
              <div className="text-center py-4 text-zinc-500 text-[11px] italic">
                No active tickets in queue for this fallback.
              </div>
            ) : (
              <div className="space-y-4">
                {payload.tickets.map((t, idx) => (
                  <div key={t.id || idx} className="border-b border-dashed border-zinc-400 pb-3">
                    <div className="flex justify-between items-baseline font-black text-xs border-b border-zinc-300 pb-1 mb-1.5">
                      <span>TICKET #{t.id}</span>
                      <span className="bg-zinc-900 text-white px-1.5 py-0.2 rounded text-[10px]">
                        TBL {t.table}
                      </span>
                    </div>
                    <div className="text-[9px] text-zinc-600 mb-1 flex justify-between">
                      <span>SRV: {t.server || 'Server 1'}</span>
                      <span className="uppercase font-bold text-red-600">{t.priority}</span>
                    </div>

                    {/* Order items */}
                    <div className="space-y-1 my-2">
                      {t.items.map((item) => (
                        <div key={item.id} className="flex items-start justify-between text-[11px]">
                          <div className="flex-1 pr-2">
                            <span className="font-bold text-zinc-950">{item.qty}x </span>
                            <span className="font-semibold text-zinc-900">{item.name}</span>
                            {item.variantName && (
                              <div className="text-[9px] text-zinc-600 pl-3">
                                ({item.variantName})
                              </div>
                            )}
                            {item.notes && (
                              <div className="text-[9px] font-bold text-red-800 pl-3">
                                * {item.notes}
                              </div>
                            )}
                          </div>
                          <span className="text-[9px] text-zinc-500 uppercase">{item.course.slice(0, 4)}</span>
                        </div>
                      ))}
                    </div>

                    {t.orderNotes && (
                      <div className="bg-amber-100 p-1.5 rounded text-[9px] font-semibold text-amber-900 mt-1.5 border border-amber-300">
                        NOTE: {t.orderNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Footer Notice */}
            <div className="text-center pt-3 text-[9px] text-zinc-600 border-t border-dashed border-zinc-500 mt-3 pb-1">
              <div className="font-bold text-zinc-800">*** AUTO-REDIRECT PROTOCOL ACTIVE ***</div>
              <div className="text-[8px] text-zinc-500 mt-0.5">X7 POS Dynamic Station Resiliency Engine</div>
              <div className="text-zinc-400 font-mono text-[9px] mt-2">--------------------------------</div>
              <div className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mt-0.5">
                *** END OF BACKUP TICKET ***
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-3">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Simulated spool ready</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <span className="material-symbols-outlined text-sm">print</span>
              <span>Print Ticket</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
