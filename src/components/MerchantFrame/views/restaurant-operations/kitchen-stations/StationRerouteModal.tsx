import React, { useState } from 'react';
import { getAccessToken } from '../../../../../lib/auth-storage';
import type { BackendKitchenStation, KitchenTicket } from './KitchenMonitorView';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export interface StationRerouteStatus {
  stationId: number;
  stationName: string;
  stationNumber: number;
  stationType: string;
  displayMode: string;
  backupStationId: number | null;
  backupStationName: string | null;
  maxActiveTicketsCapacity: number;
  activeTicketsCount: number;
  isCapacityOverflow: boolean;
  devicesCount: number;
  onlineDevicesCount: number;
  isDevicesOffline: boolean;
  printerName: string | null;
  autoRerouteOnOffline: boolean;
  autoRerouteOnCapacity: boolean;
  fallbackAction: string;
  isFallbackActive: boolean;
  fallbackReason: 'DEVICES_OFFLINE' | 'CAPACITY_OVERFLOW' | 'NONE';
}

interface StationRerouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  stations: BackendKitchenStation[];
  initialStationId?: number | 'ALL';
  rerouteStatuses: StationRerouteStatus[];
  onConfigSaved: () => void;
  onRerouteExecuted: () => void;
  onOpenThermalPrint: (payload: {
    stationName: string;
    stationNumber?: number;
    printerName: string;
    reason: string;
    tickets: KitchenTicket[];
    emittedAt: string;
  }) => void;
  activeTickets: KitchenTicket[];
}

export const StationRerouteModal: React.FC<StationRerouteModalProps> = ({
  isOpen,
  onClose,
  stations,
  initialStationId,
  rerouteStatuses,
  onConfigSaved,
  onRerouteExecuted,
  onOpenThermalPrint,
  activeTickets,
}) => {
  const [selectedStationId, setSelectedStationId] = useState<number>(() => {
    if (typeof initialStationId === 'number') return initialStationId;
    return stations[0]?.id || 6;
  });

  const currentStatus = rerouteStatuses.find((s) => s.stationId === selectedStationId);
  const selectedStationObj = stations.find((s) => s.id === selectedStationId);

  const [editedBackupStationId, setEditedBackupStationId] = useState<number | null | undefined>(undefined);
  const backupStationId = editedBackupStationId !== undefined ? editedBackupStationId : (currentStatus?.backupStationId ?? null);

  const [editedCapacityLimit, setEditedCapacityLimit] = useState<number | undefined>(undefined);
  const capacityLimit = editedCapacityLimit !== undefined ? editedCapacityLimit : (currentStatus?.maxActiveTicketsCapacity ?? 15);

  const [editedAutoOffline, setEditedAutoOffline] = useState<boolean | undefined>(undefined);
  const autoOfflineReroute = editedAutoOffline !== undefined ? editedAutoOffline : (currentStatus?.autoRerouteOnOffline ?? true);

  const [editedAutoCapacity, setEditedAutoCapacity] = useState<boolean | undefined>(undefined);
  const autoCapacityReroute = editedAutoCapacity !== undefined ? editedAutoCapacity : (currentStatus?.autoRerouteOnCapacity ?? true);

  const [editedFallbackAction, setEditedFallbackAction] = useState<string | undefined>(undefined);
  const fallbackAction = editedFallbackAction !== undefined ? editedFallbackAction : (currentStatus?.fallbackAction || 'BACKUP_STATION');

  const [editedPrinterName, setEditedPrinterName] = useState<string | undefined>(undefined);
  const printerName = editedPrinterName !== undefined ? editedPrinterName : (currentStatus?.printerName || '');

  const [saving, setSaving] = useState<boolean>(false);
  const [rerouting, setRerouting] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const handleSelectStation = (id: number) => {
    setSelectedStationId(id);
    setEditedBackupStationId(undefined);
    setEditedCapacityLimit(undefined);
    setEditedAutoOffline(undefined);
    setEditedAutoCapacity(undefined);
    setEditedFallbackAction(undefined);
    setEditedPrinterName(undefined);
  };

  if (!isOpen) return null;

  const otherStations = stations.filter((s) => s.id !== selectedStationId);

  const handleSaveConfig = async () => {
    setSaving(true);
    setFeedbackMessage(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-station/${selectedStationId}/reroute-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          backupStationId,
          maxActiveTicketsCapacity: capacityLimit,
          autoRerouteOnOffline: autoOfflineReroute,
          autoRerouteOnCapacity: autoCapacityReroute,
          fallbackAction,
          printerName: printerName.trim() || null,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json();
        throw new Error(errorJson.message || 'Failed to update rerouting configuration');
      }

      setFeedbackMessage({
        text: 'Configuration successfully updated & live policies applied.',
        type: 'success',
      });
      onConfigSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error updating configuration';
      setFeedbackMessage({ text: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyReroute = async () => {
    setRerouting(true);
    setFeedbackMessage(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-station/${selectedStationId}/reroute-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          targetStationId: backupStationId || undefined,
          reason: 'Manual Emergency Load Balancing & Station Reroute',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || 'Failed to reroute orders');
      }

      const resData = await res.json();
      setFeedbackMessage({
        text: resData.message || `Rerouted orders to secondary station successfully!`,
        type: 'success',
      });

      // If thermal fallback is configured or requested, offer ticket preview
      if (resData.thermalPrinted || fallbackAction === 'THERMAL_PRINTER' || fallbackAction === 'BOTH') {
        const stationTickets = activeTickets.filter(
          (t) => t.stationId === selectedStationId || t.stationName === selectedStationObj?.name
        );
        onOpenThermalPrint({
          stationName: selectedStationObj?.name || `Station #${selectedStationId}`,
          stationNumber: currentStatus?.stationNumber,
          printerName: printerName || 'Local Kitchen Receipt Printer',
          reason: 'Manual Station Redirection / Fallback Active',
          tickets: stationTickets.length > 0 ? stationTickets : activeTickets.slice(0, 3),
          emittedAt: new Date().toLocaleTimeString(),
        });
      }

      onRerouteExecuted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute reroute';
      setFeedbackMessage({ text: msg, type: 'error' });
    } finally {
      setRerouting(false);
    }
  };

  const handleTestThermalPrint = () => {
    const stationTickets = activeTickets.filter(
      (t) => t.stationId === selectedStationId || t.stationName === selectedStationObj?.name
    );
    onOpenThermalPrint({
      stationName: selectedStationObj?.name || `Station #${selectedStationId}`,
      stationNumber: currentStatus?.stationNumber,
      printerName: printerName || 'Local Thermal Printer',
      reason: 'Manual Test Hardware Fallback Spool',
      tickets: stationTickets.length > 0 ? stationTickets : activeTickets.slice(0, 3),
      emittedAt: new Date().toLocaleTimeString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-hidden animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#16171c] border border-zinc-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-zinc-800 to-zinc-900 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <span className="material-symbols-outlined text-2xl">alt_route</span>
            </div>
            <div>
              <div
                className="text-base font-black uppercase tracking-wider"
                style={{ color: '#ffffff', fontSize: '15px', lineHeight: '1.2' }}
              >
                Station Fallback &amp; Load Balancing Rules
              </div>
              <p className="text-xs text-zinc-400 font-medium mt-0.5">
                Hardware failure auto-reroute (&gt;60s offline) &amp; queue overload redirection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div
          className="p-6 space-y-6 overflow-y-auto max-h-[75vh] no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* Station Selector Bar */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">
              SELECT PREPARATION STATION TO CONFIGURE:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {stations.map((st) => {
                const stStatus = rerouteStatuses.find((s) => s.stationId === st.id);
                const isSelected = st.id === selectedStationId;
                const hasAlert = stStatus?.isFallbackActive;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectStation(st.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-zinc-800 border-amber-500 shadow-md ring-1 ring-amber-500'
                        : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {hasAlert && (
                      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-[#16171c] animate-ping" />
                    )}
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">
                      Station #{st.display_order ?? st.id}
                    </div>
                    <div className="text-xs font-black text-white truncate">{st.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-[9px] font-semibold">
                      {stStatus?.isDevicesOffline ? (
                        <span className="text-red-400">Offline &gt;60s</span>
                      ) : (
                        <span className="text-emerald-400">Online</span>
                      )}
                      <span>•</span>
                      <span>{stStatus?.activeTicketsCount ?? 0} tkts</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Real-Time Live Status Card */}
          {currentStatus && (
            <div
              className={`p-4 rounded-2xl border transition-all ${
                currentStatus.isFallbackActive
                  ? 'bg-red-950/30 border-red-500/50 shadow-lg'
                  : 'bg-zinc-900/60 border-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-xl ${
                      currentStatus.isFallbackActive ? 'text-red-400 animate-pulse' : 'text-emerald-400'
                    }`}
                  >
                    {currentStatus.isFallbackActive ? 'error' : 'check_circle'}
                  </span>
                  <span className="text-xs font-black uppercase text-white tracking-wider">
                    LIVE STATION HEALTH: {currentStatus.stationName}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Device Status Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                      currentStatus.isDevicesOffline
                        ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {currentStatus.isDevicesOffline
                      ? `🚨 HARDWARE OFFLINE (${currentStatus.onlineDevicesCount}/${currentStatus.devicesCount} devices)`
                      : `🟢 HARDWARE ONLINE (${currentStatus.onlineDevicesCount}/${currentStatus.devicesCount})`}
                  </span>

                  {/* Queue Capacity Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                      currentStatus.isCapacityOverflow
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-bounce'
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    }`}
                  >
                    QUEUE: {currentStatus.activeTicketsCount} / {currentStatus.maxActiveTicketsCapacity}
                  </span>
                </div>
              </div>

              {currentStatus.isFallbackActive && (
                <div className="p-2.5 rounded-xl bg-red-900/40 border border-red-500/50 text-red-200 text-xs font-medium flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-400 text-base">warning</span>
                  <span>
                    <strong>ACTIVE TRIGGER: </strong>
                    {currentStatus.fallbackReason === 'DEVICES_OFFLINE'
                      ? 'All display terminals offline > 60 seconds. Auto-reroute engaged.'
                      : 'Active orders queue capacity limit breached. Dynamic load balancing engaged.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Feedback Toast */}
          {feedbackMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                feedbackMessage.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
                  : 'bg-red-950/50 border-red-500/60 text-red-300'
              }`}
            >
              <span className="material-symbols-outlined text-base">
                {feedbackMessage.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <span>{feedbackMessage.text}</span>
            </div>
          )}

          {/* Form Configuration Container */}
          <div className="bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800 space-y-5">
            {/* Row 1: Backup Station & Capacity Limit */}
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              {/* 1. Backup Station */}
              <div className="flex-1 w-full min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-amber-400">sync_alt</span>
                  Secondary Backup Station:
                </label>
                <select
                  value={backupStationId ?? ''}
                  onChange={(e) => setEditedBackupStationId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-colors block cursor-pointer"
                  style={{ width: '100%' }}
                >
                  <option value="">-- No Backup Assigned --</option>
                  {otherStations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} (Station #{st.display_order ?? st.id})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-400 mt-1 leading-normal">
                  Target screen where tickets redirect when hardware fails or limit is breached.
                </p>
              </div>

              {/* 2. Capacity Limit Threshold */}
              <div className="flex-1 w-full min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-amber-400">speed</span>
                  Queue Capacity Threshold (Tickets):
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditedCapacityLimit(Math.max(1, capacityLimit - 1))}
                    className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-black text-base flex items-center justify-center border border-zinc-700 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={capacityLimit}
                    onChange={(e) => setEditedCapacityLimit(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-2 text-center text-xs font-black text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setEditedCapacityLimit(capacityLimit + 1)}
                    className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-black text-base flex items-center justify-center border border-zinc-700 cursor-pointer"
                  >
                    +
                  </button>
                  <span className="text-xs text-zinc-400 font-semibold">Active tickets</span>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1 leading-normal">
                  Triggers Amber Overflow banner &amp; load balancing redirect when breached.
                </p>
              </div>
            </div>

            {/* Row 2: Fallback Action Protocol */}
            <div className="w-full">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-amber-400">tune</span>
                Fallback Action Protocol:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'BACKUP_STATION',
                    label: 'Secondary Station Only',
                    desc: 'Route to backup prep display screen',
                    icon: 'desktop_windows',
                  },
                  {
                    id: 'THERMAL_PRINTER',
                    label: 'Thermal Printer Fallback',
                    desc: 'Print local kitchen paper tickets',
                    icon: 'print',
                  },
                  {
                    id: 'BOTH',
                    label: 'Both Screen & Printer',
                    desc: 'Route to secondary station AND print thermal ticket',
                    icon: 'dynamic_feed',
                  },
                ].map((act) => {
                  const isAct = fallbackAction === act.id;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setEditedFallbackAction(act.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isAct
                          ? 'bg-amber-500/20 border-amber-500 text-white ring-1 ring-amber-500'
                          : 'bg-zinc-800/80 border-zinc-700/80 hover:border-zinc-600 text-zinc-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`material-symbols-outlined text-lg ${
                            isAct ? 'text-amber-400' : 'text-zinc-400'
                          }`}
                        >
                          {act.icon}
                        </span>
                        <span className="text-xs font-black uppercase tracking-wide text-white">
                          {act.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400">{act.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 3: Thermal Printer Name & Autonomous Toggles */}
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              {/* 4. Thermal Printer Name */}
              <div className="flex-1 w-full min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-amber-400">receipt_long</span>
                  Local Thermal Printer Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kitchen Printer 1 (Grill)"
                  value={printerName}
                  onChange={(e) => setEditedPrinterName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-colors block"
                  style={{ width: '100%' }}
                />
                <p className="text-[10px] text-zinc-400 mt-1 leading-normal">
                  Hardware spool target for paper fallback receipts when screen fails.
                </p>
              </div>

              {/* 5. Autonomous Toggles */}
              <div className="flex-1 w-full min-w-0 space-y-3">
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-1.5">
                  Autonomous Redirection Toggles:
                </label>

                {/* Toggle 1: Offline > 60s */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 cursor-pointer hover:bg-zinc-800 transition-colors">
                  <div className="pr-3">
                    <div className="text-xs font-bold text-white">Auto-Reroute on Hardware Failure</div>
                    <div className="text-[10px] text-zinc-400">Trigger if all station terminals offline &gt;60s</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoOfflineReroute}
                    onChange={(e) => setEditedAutoOffline(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                  />
                </label>

                {/* Toggle 2: Capacity Limit */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 cursor-pointer hover:bg-zinc-800 transition-colors">
                  <div className="pr-3">
                    <div className="text-xs font-bold text-white">Dynamic Capacity Load Balancing</div>
                    <div className="text-[10px] text-zinc-400">Auto-route new tickets when queue limit breached</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoCapacityReroute}
                    onChange={(e) => setEditedAutoCapacity(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Quick Manual Emergency Actions */}
          <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-red-400">bolt</span>
                Manual Emergency Operations
              </div>
              <div className="text-[10px] text-zinc-400">
                Immediately balance station workload or trigger thermal spool
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleEmergencyReroute}
                disabled={rerouting || !backupStationId}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md ${
                  rerouting || !backupStationId
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white cursor-pointer active:scale-95'
                }`}
                title={!backupStationId ? 'Please assign a backup station first' : 'Reroute active tickets now'}
              >
                <span className="material-symbols-outlined text-sm">
                  {rerouting ? 'hourglass_top' : 'forward_to_inbox'}
                </span>
                <span>{rerouting ? 'Rerouting...' : 'Reroute Active Tickets'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestThermalPrint}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-sm text-amber-400">print</span>
                <span>Test Thermal Ticket</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-3">
          <div className="text-[11px] text-zinc-500">
            Rules apply immediately to incoming kitchen orders and sync with POS.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={saving}
              className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
