import React, { useState } from 'react';

interface KitchenMonitorViewProps {
  onBackToDashboard: () => void;
}

interface TicketItem {
  name: string;
  qty: number;
  notes?: string;
}

interface KitchenTicket {
  id: string;
  table: string;
  timeElapsed: number; // en minutos
  server: string;
  items: TicketItem[];
  priority: 'high' | 'medium' | 'normal';
}

export const KitchenMonitorView: React.FC<KitchenMonitorViewProps> = ({ onBackToDashboard }) => {
  const [tickets, setTickets] = useState<KitchenTicket[]>([
    {
      id: 'T105',
      table: 'Table 14',
      timeElapsed: 12,
      server: 'Sarah T.',
      priority: 'high',
      items: [
        { name: 'Classic Wagyu Burger', qty: 2, notes: 'Medium Rare, No Onions' },
        { name: 'Truffle Mushroom Pizza', qty: 1 },
        { name: 'French Fries', qty: 2 },
      ],
    },
    {
      id: 'T106',
      table: 'Table 8',
      timeElapsed: 8,
      server: 'Sarah T.',
      priority: 'medium',
      items: [
        { name: 'Warm Lava Cake', qty: 2, notes: 'Add Vanilla Ice Cream' },
        { name: 'Espresso', qty: 2 },
      ],
    },
    {
      id: 'T107',
      table: 'Table 21',
      timeElapsed: 3,
      server: 'David L.',
      priority: 'normal',
      items: [
        { name: 'Truffle Mushroom Pizza', qty: 2 },
        { name: 'Napa Cabernet 2018', qty: 1 },
      ],
    },
    {
      id: 'T108',
      table: 'Bar 3',
      timeElapsed: 1,
      server: 'Robert K.',
      priority: 'normal',
      items: [
        { name: 'Classic Wagyu Burger', qty: 1, notes: 'Well Done' },
        { name: 'Local IPA Beer', qty: 1 },
      ],
    },
  ]);

  const handleCompleteTicket = (id: string) => {
    setTickets((prev) => prev.filter((ticket) => ticket.id !== id));
  };

  const getPriorityColors = (priority: KitchenTicket['priority']) => {
    switch (priority) {
      case 'high':
        return {
          border: 'border-red-500',
          badge: 'bg-red-100 text-red-700',
          text: 'text-red-700',
        };
      case 'medium':
        return {
          border: 'border-yellow-500',
          badge: 'bg-yellow-100 text-yellow-700',
          text: 'text-yellow-700',
        };
      case 'normal':
      default:
        return {
          border: 'border-[#e8e2d8]',
          badge: 'bg-[#f1ece4] text-[#222222]',
          text: 'text-secondary',
        };
    }
  };

  return (
    <div className="fixed inset-0 bg-[#14151a] z-50 flex flex-col font-sans text-white">
      {/* KDS Header */}
      <header className="h-16 bg-[#1f2026] border-b border-white/15 px-6 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
          <h1 className="font-sans text-lg font-black tracking-wider flex items-center gap-2" style={{ color: '#ffffff' }}>
            <span>KITCHEN DISPLAY STATION</span>
            <span className="text-[#ae001a] font-black">/</span>
            <span style={{ color: '#ffffff' }}>LIVE KDS MONITOR</span>
          </h1>
        </div>
        <button
          onClick={onBackToDashboard}
          className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#900015] text-white font-bold text-xs uppercase tracking-wider rounded transition-all flex items-center gap-2 cursor-pointer shadow-md"
          style={{ color: '#ffffff' }}
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          <span>BACK TO DASHBOARD</span>
        </button>
      </header>

      {/* KDS Main Grid */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-6 items-start custom-scrollbar">
        {tickets.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center">
            <span className="material-symbols-outlined text-emerald-500 text-6xl">check_circle</span>
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#ffffff' }}>All Orders Cleared!</h2>
              <p className="text-zinc-400 text-sm mt-1">Excellent performance. Kitchen is at 100% preparation rate.</p>
            </div>
            <button
              onClick={onBackToDashboard}
              className="mt-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer"
              style={{ color: '#ffffff' }}
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          tickets.map((ticket) => {
            const pColors = getPriorityColors(ticket.priority);
            return (
              <div
                key={ticket.id}
                className={`w-84 bg-[#1f2026] border-t-4 ${pColors.border} border-x border-b border-zinc-700/60 rounded flex flex-col max-h-[90%] shadow-2xl flex-shrink-0`}
              >
                {/* Ticket Header */}
                <div className="p-4 border-b border-zinc-700/60 flex justify-between items-start bg-[#262730]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-base" style={{ color: '#ffffff' }}>{ticket.table}</h2>
                      <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${pColors.badge}`}>
                        {ticket.priority}
                      </span>
                    </div>
                    <p className="text-xs font-bold mt-1" style={{ color: '#d4d4d8' }}>
                      ID: {ticket.id} • Server: {ticket.server}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-base ${ticket.timeElapsed >= 10 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                      {ticket.timeElapsed}m
                    </p>
                    <p className="text-[10px] uppercase font-extrabold tracking-wider" style={{ color: '#a1a1aa' }}>ELAPSED</p>
                  </div>
                </div>

                {/* Ticket Items List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#1f2026]">
                  {ticket.items.map((item, idx) => (
                    <div key={idx} className="flex gap-3 items-start">
                      <span className="w-6 h-6 bg-red-500/20 text-[#ae001a] border border-red-500/40 rounded flex items-center justify-center font-black text-sm flex-shrink-0">
                        {item.qty}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-extrabold leading-snug" style={{ color: '#ffffff' }}>
                          {item.name}
                        </p>
                        {item.notes && (
                          <p className="text-xs font-bold mt-1 italic" style={{ color: '#fcd34d' }}>
                            * {item.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action button */}
                <button
                  onClick={() => handleCompleteTicket(ticket.id)}
                  className="w-full py-3.5 bg-[#2a2b34] hover:bg-emerald-600 text-white font-extrabold text-xs uppercase tracking-widest transition-colors border-t border-zinc-700/60 flex items-center justify-center gap-2 cursor-pointer shadow-inner"
                  style={{ color: '#ffffff' }}
                >
                  <span className="material-symbols-outlined text-base">done</span>
                  <span>DONE &amp; SERVE</span>
                </button>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
};
export default KitchenMonitorView;
