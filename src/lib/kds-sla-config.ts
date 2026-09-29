import { useState, useEffect, useCallback } from 'react';

export const KDS_CRITICAL_SLA_STORAGE_KEY = 'x7_kds_critical_sla_mins';
export const DEFAULT_CRITICAL_SLA_MINUTES = 15;

/**
 * Lee el tiempo límite de SLA de cocina configurado en localStorage (en minutos).
 * Si no está configurado o es inválido, retorna el valor por defecto (15 min).
 */
export function getKdsCriticalSlaMinutes(): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_CRITICAL_SLA_MINUTES;
  }
  try {
    const raw = window.localStorage.getItem(KDS_CRITICAL_SLA_STORAGE_KEY);
    if (!raw) return DEFAULT_CRITICAL_SLA_MINUTES;
    const parsed = Number(raw);
    return !isNaN(parsed) && parsed > 0 ? parsed : DEFAULT_CRITICAL_SLA_MINUTES;
  } catch {
    return DEFAULT_CRITICAL_SLA_MINUTES;
  }
}

/**
 * Guarda el tiempo límite de SLA de cocina en localStorage y notifica
 * a todas las vistas abiertas mediante eventos de ventana.
 */
export function setKdsCriticalSlaMinutes(minutes: number): void {
  const safeValue = Math.max(1, Math.min(120, Math.round(minutes)));
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(KDS_CRITICAL_SLA_STORAGE_KEY, String(safeValue));
      window.dispatchEvent(
        new CustomEvent('kds_sla_updated', {
          detail: { criticalSlaMinutes: safeValue },
        })
      );
    } catch (e) {
      console.warn('Failed saving KDS SLA config:', e);
    }
  }
}

/**
 * Hook de React para consumir y actualizar reactivamente el tiempo de SLA
 * de cocina en cualquier vista del Backoffice.
 */
export function useKdsCriticalSla(): [number, (mins: number) => void] {
  const [slaMinutes, setSlaMinutes] = useState<number>(getKdsCriticalSlaMinutes);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ criticalSlaMinutes?: number }>;
      if (custom.detail?.criticalSlaMinutes) {
        setSlaMinutes(custom.detail.criticalSlaMinutes);
      } else {
        setSlaMinutes(getKdsCriticalSlaMinutes());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === KDS_CRITICAL_SLA_STORAGE_KEY) {
        setSlaMinutes(getKdsCriticalSlaMinutes());
      }
    };

    window.addEventListener('kds_sla_updated', handleUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('kds_sla_updated', handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const updateSla = useCallback((mins: number) => {
    setKdsCriticalSlaMinutes(mins);
    setSlaMinutes(Math.max(1, Math.min(120, Math.round(mins))));
  }, []);

  return [slaMinutes, updateSla];
}
