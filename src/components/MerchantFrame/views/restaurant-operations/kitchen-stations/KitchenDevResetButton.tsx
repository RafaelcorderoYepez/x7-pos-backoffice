import React, { useState, useEffect } from 'react';
import { getAccessToken, getStoredUser } from '../../../../../lib/auth-storage';
import { clearOfflineData } from '../../../../../lib/kds-offline-sync';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface KitchenDevResetButtonProps {
  onResetComplete?: () => void;
}

export const KitchenDevResetButton: React.FC<KitchenDevResetButtonProps> = ({ onResetComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
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
      localStorage.getItem('x7_kds_dev_tools') === 'true'
    );
  });

  useEffect(() => {
    // Atajo de teclado secreto: Ctrl + Shift + D para alternar visibilidad
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsVisible((prev) => {
          const next = !prev;
          localStorage.setItem('x7_kds_dev_tools', String(next));
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isVisible) return null;

  const handleAction = async (mode: 'seed' | 'clear' | 'simple' | 'multi' | 'multi2') => {
    setLoading(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-orders/reset-test-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || 'Error executing kitchen reset');
      }

      const data = await res.json();
      void clearOfflineData();
      setStatusType('success');
      setStatusMessage(
        data.message ||
          (mode === 'simple'
            ? '2 Simple Orders Seeded!'
            : mode === 'multi'
            ? '1 Multi-Course Order Seeded!'
            : mode === 'multi2'
            ? '2 Multi-Course Orders Seeded!'
            : mode === 'seed'
            ? '8 Test Orders Seeded!'
            : 'All Orders Cleared!')
      );

      // Notificar a toda la aplicación para recarga reactiva
      window.dispatchEvent(new CustomEvent('x7_kds_data_reset', { detail: { mode } }));
      if (onResetComplete) {
        onResetComplete();
      }

      // Auto cerrar tras 1.5 segundos
      setTimeout(() => {
        setIsOpen(false);
        setStatusMessage(null);
        setStatusType(null);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset kitchen data';
      setStatusType('error');
      setStatusMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 select-none font-sans">
      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-56 bg-[#1a1b20] border border-zinc-700/80 rounded-xl shadow-2xl p-2.5 text-white animate-fade-in backdrop-blur-md">
          {/* Feedback message */}
          {statusMessage && (
            <div
              className={`mb-2 p-1.5 rounded-md text-[10px] font-bold flex items-center gap-1.5 ${
                statusType === 'success'
                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                  : 'bg-red-950/70 text-red-300 border border-red-500/40'
              }`}
            >
              <span className="material-symbols-outlined text-xs">
                {statusType === 'success' ? 'check_circle' : 'error'}
              </span>
              <span className="truncate">{statusMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleAction('simple')}
              className="w-full py-1.5 px-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold tracking-wide flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
                {loading ? 'refresh' : 'lunch_dining'}
              </span>
              <span>{loading ? 'Generating...' : 'Reset (2 Simple Orders)'}</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleAction('multi')}
              className="w-full py-1.5 px-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold tracking-wide flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
                {loading ? 'refresh' : 'dinner_dining'}
              </span>
              <span>{loading ? 'Generating...' : 'Reset (1 Multi-Course)'}</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleAction('multi2')}
              className="w-full py-1.5 px-2 bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-500 hover:to-purple-600 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold tracking-wide flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
                {loading ? 'refresh' : 'dinner_dining'}
              </span>
              <span>{loading ? 'Generating...' : 'Reset (2 Multi-Course)'}</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleAction('seed')}
              className="w-full py-1.5 px-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold tracking-wide flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
                {loading ? 'refresh' : 'restart_alt'}
              </span>
              <span>{loading ? 'Generating...' : 'Reset (8 Orders)'}</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleAction('clear')}
              className="w-full py-1.5 px-2 bg-zinc-800/90 hover:bg-red-950/70 hover:border-red-500/50 disabled:opacity-50 text-zinc-300 hover:text-red-200 border border-zinc-700/70 rounded-lg text-[10px] font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-xs text-red-400">delete_sweep</span>
              <span>Clear All (0)</span>
            </button>
          </div>

          {/* Footer note */}
          <p className="mt-2 text-[10px] text-zinc-400 text-center font-mono">
            Ctrl+Shift+D
          </p>
        </div>
      )}

      {/* Floating Circular Action Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="KDS Dev Tools (Ctrl+Shift+D)"
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 cursor-pointer border ${
          isOpen
            ? 'bg-[#ae001a] text-white border-white scale-105 shadow-[#ae001a]/50 ring-2 ring-[#ae001a]/30'
            : 'bg-[#1c1d22] hover:bg-[#282930] text-zinc-300 hover:text-white border-zinc-700 hover:border-zinc-400 hover:scale-105 active:scale-95'
        }`}
      >
        <span className="material-symbols-outlined text-lg">construction</span>
      </button>
    </div>
  );
};
