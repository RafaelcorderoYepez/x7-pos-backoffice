import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface OnlineStoreFormData {
  id?: number;
  merchant_id?: number;
  merchantName?: string;
  subdomain: string;
  theme: string;
  currency: string;
  timezone: string;
  is_active: boolean;
  status?: 'active' | 'deleted';
  offline_message?: string;
}

export interface OnlineStoreSetupDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: OnlineStoreFormData | null;
  onClose: () => void;
  onSubmit: (data: OnlineStoreFormData) => Promise<void>;
}

const COMMON_THEMES = [
  {
    id: 'default',
    name: 'Default Classic',
    tag: 'Standard',
    desc: 'Clean storefront design with bold institutional typography and high-conversion catalog grid.',
    previewBg: 'bg-[#fef9f1]',
    badgeBg: 'bg-[#ae001a] text-white',
  },
  {
    id: 'modern-dark',
    name: 'Modern Dark',
    tag: 'Nightlife & Grill',
    desc: 'Sleek dark zinc palette with high-contrast highlights crafted for steakhouses, clubs, and upscale bars.',
    previewBg: 'bg-[#18181b]',
    badgeBg: 'bg-zinc-800 text-zinc-100',
  },
  {
    id: 'bistro-light',
    name: 'Bistro Light',
    tag: 'Cafe & Bakery',
    desc: 'Warm terracotta tones and rounded cards ideal for artisanal cafes, bakeries, and brunch spots.',
    previewBg: 'bg-[#fff7ed]',
    badgeBg: 'bg-amber-700 text-white',
  },
  {
    id: 'minimalist',
    name: 'Minimalist Clean',
    tag: 'Editorial',
    desc: 'Generous whitespace with refined sans-serif typefaces focused on product artistry.',
    previewBg: 'bg-[#fafafa]',
    badgeBg: 'bg-zinc-600 text-white',
  },
  {
    id: 'sunset-warmth',
    name: 'Sunset Warmth',
    tag: 'Artisan Dining',
    desc: 'Earthy amber gradients crafted for pizzerias, trattorias, and craft beverage spots.',
    previewBg: 'bg-[#fefce8]',
    badgeBg: 'bg-yellow-700 text-white',
  },
];

const COMMON_CURRENCIES = [
  { code: 'USD', label: 'USD - United States Dollar ($)', symbol: '$' },
  { code: 'EUR', label: 'EUR - Euro (€)', symbol: '€' },
  { code: 'DOP', label: 'DOP - Dominican Peso (RD$)', symbol: 'RD$' },
  { code: 'CAD', label: 'CAD - Canadian Dollar ($)', symbol: 'CA$' },
  { code: 'GBP', label: 'GBP - British Pound (£)', symbol: '£' },
  { code: 'CLP', label: 'CLP - Chilean Peso ($)', symbol: 'CLP$' },
  { code: 'MXN', label: 'MXN - Mexican Peso ($)', symbol: 'MX$' },
  { code: 'BRL', label: 'BRL - Brazilian Real (R$)', symbol: 'R$' },
  { code: 'COP', label: 'COP - Colombian Peso ($)', symbol: 'COL$' },
];

const COMMON_TIMEZONES = [
  { zone: 'America/New_York', label: 'Eastern Time (US) — America/New_York' },
  { zone: 'America/Chicago', label: 'Central Time (US) — America/Chicago' },
  { zone: 'America/Denver', label: 'Mountain Time (US) — America/Denver' },
  { zone: 'America/Los_Angeles', label: 'Pacific Time (US) — America/Los_Angeles' },
  { zone: 'America/Santo_Domingo', label: 'Dominican Republic — America/Santo_Domingo' },
  { zone: 'America/Santiago', label: 'Chile Time — America/Santiago' },
  { zone: 'America/Mexico_City', label: 'Mexico Central — America/Mexico_City' },
  { zone: 'America/Bogota', label: 'Colombia Time — America/Bogota' },
  { zone: 'America/Sao_Paulo', label: 'Brazil Time — America/Sao_Paulo' },
  { zone: 'Europe/Madrid', label: 'Central Europe (Spain) — Europe/Madrid' },
  { zone: 'Europe/London', label: 'United Kingdom (GMT/BST) — Europe/London' },
  { zone: 'UTC', label: 'Universal Coordinated Time — UTC' },
];

const TIMEZONE_DEFAULT_CURRENCY: Record<string, string> = {
  'America/Santo_Domingo': 'DOP',
  'America/Santiago': 'CLP',
  'America/Mexico_City': 'MXN',
  'America/Bogota': 'COP',
  'America/Sao_Paulo': 'BRL',
  'Europe/Madrid': 'EUR',
  'Europe/London': 'GBP',
  'America/New_York': 'USD',
  'America/Chicago': 'USD',
  'America/Denver': 'USD',
  'America/Los_Angeles': 'USD',
};

export const OnlineStoreSetupDrawer: React.FC<OnlineStoreSetupDrawerProps> = ({
  isOpen,
  mode,
  initialData,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <OnlineStoreSetupDrawerContent
      key={`${mode}-${initialData?.id ?? 'new'}`}
      mode={mode}
      initialData={initialData}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
};

interface ContentProps {
  mode: 'create' | 'edit';
  initialData?: OnlineStoreFormData | null;
  onClose: () => void;
  onSubmit: (data: OnlineStoreFormData) => Promise<void>;
}

const OnlineStoreSetupDrawerContent: React.FC<ContentProps> = ({
  mode,
  initialData,
  onClose,
  onSubmit,
}) => {
  const [subdomain, setSubdomain] = useState<string>(initialData?.subdomain || '');
  const [theme, setTheme] = useState<string>(initialData?.theme || 'default');
  const [currency, setCurrency] = useState<string>(initialData?.currency || 'USD');
  const [timezone, setTimezone] = useState<string>(initialData?.timezone || 'America/New_York');
  const [isActive, setIsActive] = useState<boolean>(initialData?.is_active ?? true);
  const [offlineMessage, setOfflineMessage] = useState<string>(
    initialData?.offline_message ||
      'We are currently updating our digital catalog. Online ordering is paused. Please check back shortly!'
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  // Subdomain normalization: lowercase, alphanumeric and hyphens
  const handleSubdomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const normalized = raw
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 100); // Enforce character length limit <= 100
    setSubdomain(normalized);
    setErrorMessage(null);
  };

  // Smart regional alignment: updating timezone auto-suggests corresponding primary currency
  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
    const suggestedCurrency = TIMEZONE_DEFAULT_CURRENCY[newTimezone];
    if (suggestedCurrency) {
      setCurrency(suggestedCurrency);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanSubdomain = subdomain.trim().replace(/^-+|-+$/g, '');
    if (!cleanSubdomain) {
      setErrorMessage('Subdomain is required and must contain alphanumeric characters.');
      return;
    }

    // Acceptance Criteria: Data Length Enforcement
    if (cleanSubdomain.length > 100) {
      setErrorMessage('Subdomain cannot exceed 100 characters.');
      return;
    }

    if (theme.length > 100) {
      setErrorMessage('Theme identifier cannot exceed 100 characters.');
      return;
    }

    if (currency.length > 10) {
      setErrorMessage('Currency code cannot exceed 10 characters.');
      return;
    }

    if (timezone.length > 50) {
      setErrorMessage('Timezone cannot exceed 50 characters.');
      return;
    }

    const dnsRegex = /^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$/;
    if (!dnsRegex.test(cleanSubdomain)) {
      setErrorMessage('Subdomain must be DNS-compliant (alphanumeric, no leading or trailing hyphens).');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        id: initialData?.id,
        merchant_id: initialData?.merchant_id,
        merchantName: initialData?.merchantName,
        subdomain: cleanSubdomain,
        theme: theme.trim() || 'default',
        currency: currency.trim() || 'USD',
        timezone: timezone.trim() || 'America/New_York',
        is_active: isActive,
        status: initialData?.status || 'active',
        offline_message: offlineMessage.trim(),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save online store. Please check the fields.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTheme = COMMON_THEMES.find((t) => t.id === theme) || COMMON_THEMES[0];

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-hidden font-sans">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Side Drawer Container (Pinned flush to right edge) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-drawer-title"
        className="fixed top-0 right-0 bottom-0 z-10 w-full max-w-lg bg-[#fcfbfa] shadow-2xl flex flex-col border-l border-[#e8e2d8] text-left overflow-hidden animate-slide-in"
      >
        {/* Drawer Header */}
        <div className="bg-[#1c1b16] px-6 py-5 flex items-center justify-between shrink-0 border-b border-[#32312b]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#ae001a] flex items-center justify-center text-white shadow-xs shrink-0">
              <span className="material-symbols-outlined text-2xl select-none" style={{ color: '#ffffff' }}>storefront</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="store-drawer-title"
                  style={{ color: '#ffffff' }}
                  className="text-base font-black text-white !text-white uppercase tracking-wider leading-tight"
                >
                  {mode === 'create' ? 'Provision Storefront' : 'Storefront Setup & Theme'}
                </h2>
                <span
                  style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold whitespace-nowrap"
                >
                  {mode === 'create' ? 'NEW TENANT' : `#STR-${initialData?.id ?? ''}`}
                </span>
              </div>
              <p
                style={{ color: '#a1a1aa' }}
                className="text-xs !text-zinc-400 mt-0.5"
              >
                Online Ordering Tenant Workspace
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 ml-2"
            title="Close drawer"
          >
            <span className="material-symbols-outlined text-xl select-none" style={{ color: '#ffffff' }}>close</span>
          </button>
        </div>

        {/* Drawer Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
              <span className="material-symbols-outlined text-base text-[#ae001a] shrink-0 mt-0.5">
                error
              </span>
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* 1. Merchant Context Association */}
          <div className="bg-white p-4 rounded-xl border border-[#e8e2d8] shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1d1c17]">
                Merchant Tenant Binding
              </span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                Auto-Selected
              </span>
            </div>
            <p className="text-[11px] text-[#5f5e5e]">
              Storefront provisioning is automatically bounded to the authenticated business account context.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <div className="w-8 h-8 rounded-full bg-[#fef9f1] border border-[#e8e2d8] flex items-center justify-center text-[#ae001a] font-bold text-xs">
                M
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#1d1c17]">
                  {initialData?.merchantName || 'Authenticated Merchant Workspace'}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  ID: #{initialData?.merchant_id || 1} · Role: Tenant Owner
                </span>
              </div>
            </div>
          </div>

          {/* 2. Subdomain Input & Live URL Routing */}
          <div className="bg-white p-4 rounded-xl border border-[#e8e2d8] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="drawer-subdomain-input" className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17]">
                Store Subdomain <span className="text-[#ae001a]">*</span>
              </label>
              <span className="text-[10px] font-mono text-zinc-500">
                {subdomain.length} / 100 chars
              </span>
            </div>
            <p className="text-[11px] text-[#5f5e5e]">
              DNS RFC 1123 normalized routing slug. Only lowercase letters, numbers, and hyphens.
            </p>

            <div className="flex items-center rounded-lg border border-[#e8e2d8] bg-white overflow-hidden focus-within:border-[#ae001a] focus-within:ring-1 focus-within:ring-[#ae001a] transition-all">
              <span className="px-3 text-xs font-semibold text-zinc-500 bg-zinc-50 border-r border-[#e8e2d8] select-none py-2.5">
                https://
              </span>
              <input
                id="drawer-subdomain-input"
                type="text"
                required
                maxLength={100}
                value={subdomain}
                onChange={handleSubdomainChange}
                placeholder="my-bistro-store"
                disabled={isSubmitting}
                className="flex-1 px-3 py-2 text-sm font-bold text-[#1d1c17] bg-white placeholder-zinc-400 outline-none"
              />
              <span className="px-3 text-xs font-bold text-zinc-600 bg-zinc-50 border-l border-[#e8e2d8] select-none py-2.5">
                .x7pos.com
              </span>
            </div>

            {/* Live DNS Context Preview Card */}
            <div className="p-3 rounded-lg bg-[#fef9f1] border border-[#e8e2d8] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="material-symbols-outlined text-base text-[#ae001a] shrink-0">
                  language
                </span>
                <span className="font-mono text-zinc-700 text-[11px] truncate">
                  Public Storefront: <strong className="text-[#1d1c17]">https://{subdomain || 'your-store'}.x7pos.com</strong>
                </span>
              </div>
              <span className="text-[9.5px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                DNS Routing
              </span>
            </div>
          </div>

          {/* 3. Visual Theme Selector */}
          <div className="bg-white p-4 rounded-xl border border-[#e8e2d8] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="drawer-theme-select" className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17]">
                Visual Theme Selector
              </label>
              <span className="text-[10px] font-mono text-zinc-500">
                {theme.length} / 100 chars
              </span>
            </div>
            <p className="text-[11px] text-[#5f5e5e]">
              Template styling applied across customer order catalog, navigation headers, and hero banners.
            </p>

            <select
              id="drawer-theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2.5 rounded-lg border border-[#e8e2d8] bg-white text-sm font-bold text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none cursor-pointer"
            >
              {COMMON_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.tag})
                </option>
              ))}
            </select>

            {/* Active Theme Preview Badge & Details */}
            <div className="p-3.5 rounded-lg border border-[#e8e2d8] bg-zinc-50 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${selectedTheme.badgeBg}`}>
                    {selectedTheme.name}
                  </span>
                  <span className="text-[11px] font-bold text-zinc-500">
                    {selectedTheme.tag}
                  </span>
                </div>
                <span className="material-symbols-outlined text-base text-zinc-400">palette</span>
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                {selectedTheme.desc}
              </p>
            </div>
          </div>

          {/* 4. Regional Localization Standards (Timezone & Currency) */}
          <div className="bg-white p-4 rounded-xl border border-[#e8e2d8] shadow-xs space-y-3">
            <span className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17]">
              Regional Localization Standards
            </span>
            <p className="text-[11px] text-[#5f5e5e]">
              IANA timezone schedule compliance and ISO currency formatting.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Timezone (First / Top) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="drawer-timezone-select" className="text-[11px] font-bold uppercase text-[#1d1c17]">
                    Timezone (IANA)
                  </label>
                  <span className="text-[9.5px] font-mono text-zinc-500">max 50</span>
                </div>
                <select
                  id="drawer-timezone-select"
                  value={timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 rounded-lg border border-[#e8e2d8] bg-white text-xs font-semibold text-[#1d1c17] focus:border-[#ae001a] outline-none cursor-pointer"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.zone} value={tz.zone}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Currency Code (Second / Bottom) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="drawer-currency-select" className="text-[11px] font-bold uppercase text-[#1d1c17]">
                    Currency Code (ISO)
                  </label>
                  <span className="text-[9.5px] font-mono text-zinc-500">max 10</span>
                </div>
                <select
                  id="drawer-currency-select"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 rounded-lg border border-[#e8e2d8] bg-white text-xs font-bold text-[#1d1c17] focus:border-[#ae001a] outline-none cursor-pointer"
                >
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 5. Public Visibility Switch (is_active) */}
          <div className="bg-white p-4 rounded-xl border border-[#e8e2d8] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1d1c17]">
                Public Storefront Visibility Switch
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'}`} />
                <span>{isActive ? 'Published & Live' : 'Maintenance Mode'}</span>
              </span>
            </div>

            <p className="text-[11px] text-[#5f5e5e]">
              Immediate status toggle. Flipping this switch instantly enables or disables customer order placement on the public domain.
            </p>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-zinc-50 border border-[#e8e2d8]">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-[#1d1c17]">
                  {isActive ? 'Store Ordering Open (Live)' : 'Store Ordering Paused (Offline)'}
                </span>
                <p className="text-[11px] text-[#5f5e5e]">
                  {isActive
                    ? 'Customers can browse menu and submit live checkout payments.'
                    : 'Customer requests will render the offline landing banner below.'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive(!isActive)}
                disabled={isSubmitting}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                  isActive ? 'bg-[#10b981]' : 'bg-zinc-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Public Storefront Maintenance Mode Banner Preview */}
            {!isActive && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                  <span className="material-symbols-outlined text-lg text-amber-700">construction</span>
                  <span>Store Currently Offline — Public Customer Landing Banner</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  When offline, requests to <code className="font-mono bg-white/60 px-1 py-0.5 rounded text-amber-900">https://{subdomain || 'store'}.x7pos.com</code> render this notice to customers while preserving full administrative backoffice access.
                </p>

                <div className="space-y-1">
                  <label htmlFor="drawer-offline-message" className="text-[10.5px] font-bold uppercase text-amber-900">
                    Custom Maintenance Message:
                  </label>
                  <textarea
                    id="drawer-offline-message"
                    rows={2}
                    value={offlineMessage}
                    onChange={(e) => setOfflineMessage(e.target.value)}
                    placeholder="Enter offline notice shown to customers..."
                    className="w-full p-2.5 text-xs bg-white border border-amber-300 rounded-lg text-zinc-800 placeholder-zinc-400 outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                  />
                </div>

                {/* Simulated Customer Landing Screen Box */}
                <div className="p-3.5 bg-white rounded-lg border border-amber-300 shadow-2xs space-y-1.5 text-center">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 mx-auto">
                    <span className="material-symbols-outlined text-lg">coffee</span>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                    {subdomain ? `${subdomain.toUpperCase()} · Currently Offline` : 'Storefront Currently Offline'}
                  </h4>
                  <p className="text-[11px] text-zinc-600 italic">
                    &ldquo;{offlineMessage}&rdquo;
                  </p>
                </div>
              </div>
            )}
          </div>

        </form>

        {/* Drawer Fixed Footer */}
        <div className="bg-white px-6 py-4 border-t border-[#e8e2d8] flex items-center justify-between shrink-0 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-lg border border-[#e8e2d8] text-xs font-bold uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-lg bg-[#ae001a] hover:bg-[#d2272f] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2 shadow-xs shrink-0 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">
                  {mode === 'create' ? 'add_business' : 'save'}
                </span>
                <span>{mode === 'create' ? 'Provision Storefront' : 'Save Changes'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
