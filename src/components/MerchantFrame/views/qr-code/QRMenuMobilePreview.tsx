import React, { useState } from 'react';
import type { QRMenuStatus, QRMenuType } from '../../../../types/qr-menu';
import { getThemeConfig } from '../../../../lib/qr-menu';
import { QR_MENU_STATUS_BADGES, QR_MENU_TYPE_META } from '../../../../types/qr-menu';

interface QRMenuMobilePreviewProps {
  name: string;
  description: string;
  design_theme: string;
  qr_type: QRMenuType;
  status: QRMenuStatus;
  sectionsCount?: number;
  itemsCount?: number;
}

export const QRMenuMobilePreview: React.FC<QRMenuMobilePreviewProps> = ({
  name,
  description,
  design_theme,
  qr_type,
  status,
}) => {
  const [activeCategory, setActiveCategory] = useState<number>(0);
  const theme = getThemeConfig(design_theme);
  const typeMeta = QR_MENU_TYPE_META[qr_type] || QR_MENU_TYPE_META.Table;
  const statusMeta = QR_MENU_STATUS_BADGES[status] || QR_MENU_STATUS_BADGES.active;

  const categories = [
    'Chef Specials',
    'Main Entrees',
    'Artisan Drinks',
    'Desserts',
  ];

  const sampleDishes = [
    {
      id: 1,
      title: 'Signature Oak-Smoked Cut',
      desc: 'Prime cut with rosemary sea salt & charred herb butter.',
      price: '$38.00',
      tag: 'Chef Pick',
      img: '🥩',
    },
    {
      id: 2,
      title: 'Truffle Glazed Medallion',
      desc: 'Wild forest mushroom reduction with roasted fingerlings.',
      price: '$32.50',
      tag: 'Popular',
      img: '🍖',
    },
    {
      id: 3,
      title: 'Smoked Craft Infusion',
      desc: 'Aromatic woodchip smoke with orange peel & bitters.',
      price: '$16.00',
      tag: 'New',
      img: '🥃',
    },
  ];

  return (
    <div className="flex flex-col items-center">
      {/* Device Frame */}
      <div
        className="w-[320px] h-[640px] rounded-[42px] p-3 shadow-2xl relative border-[6px] border-slate-800 bg-slate-900 flex flex-col overflow-hidden select-none transition-all duration-300"
        style={{
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
        }}
      >
        {/* Dynamic Island / Speaker Notch */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-30 flex items-center justify-between px-3">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700/50" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse" />
        </div>

        {/* Screen Bezel Container */}
        <div
          className="w-full h-full rounded-[32px] overflow-hidden flex flex-col relative transition-colors duration-300"
          style={{
            backgroundColor: theme.backgroundColor,
            color: theme.textColor,
            fontFamily: theme.fontFamily === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif',
          }}
        >
          {/* Mobile Status Bar */}
          <div className="pt-2 px-6 pb-1 flex justify-between items-center text-[11px] font-semibold tracking-tight z-20 shrink-0 opacity-80">
            <span>9:41</span>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[12px]">signal_cellular_alt</span>
              <span className="material-symbols-outlined text-[12px]">wifi</span>
              <span className="material-symbols-outlined text-[12px]">battery_full</span>
            </div>
          </div>

          {/* Scrollable Screen Content */}
          <div className="flex-1 overflow-y-auto no-scrollbar pb-16">
            {/* Header Hero Banner with Dynamic Theme Styling */}
            <div
              className="p-5 pt-4 text-white relative overflow-hidden transition-all duration-300 shadow-md"
              style={{ background: theme.headerBackground }}
            >
              {/* Background ambient pattern */}
              <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />

              <div className="flex items-center justify-between mb-3 relative z-10">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/25 backdrop-blur-sm border border-white/20">
                  {theme.name}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
                    status === 'active'
                      ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/40'
                      : status === 'inactive'
                      ? 'bg-amber-500/30 text-amber-100 border border-amber-400/40'
                      : 'bg-rose-500/30 text-rose-100 border border-rose-400/40'
                  }`}
                >
                  {statusMeta.label}
                </span>
              </div>

              {/* Menu Title */}
              <h2
                className="text-lg font-bold leading-tight mb-1 line-clamp-2 drop-shadow-sm !text-white"
                style={{ color: '#ffffff' }}
              >
                {name.trim() || 'Menu Name'}
              </h2>

              {/* Menu Description */}
              <p
                className="text-[11px] leading-relaxed mb-3 !text-white/90"
                style={{ color: 'rgba(255, 255, 255, 0.9)' }}
              >
                {description.trim() || 'Public menu overview will appear here for customers scanning the QR code.'}
              </p>

              {/* QR Type Pill */}
              <div className="flex items-center gap-1.5 inline-flex bg-black/30 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/15 text-[11px]">
                <span className="material-symbols-outlined text-[13px]">{typeMeta.icon}</span>
                <span className="font-medium">{typeMeta.label}</span>
              </div>
            </div>

            {/* Category Navigation Pills */}
            <div className="px-3 pt-3 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {categories.map((cat, idx) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(idx)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 border ${
                    activeCategory === idx
                      ? 'shadow-sm text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: activeCategory === idx ? theme.primaryColor : theme.cardBackground,
                    borderColor: activeCategory === idx ? theme.primaryColor : 'rgba(150, 150, 150, 0.2)',
                    color: activeCategory === idx ? '#ffffff' : theme.textColor,
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu Items Showcase */}
            <div className="px-3 pt-1 space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold tracking-wide uppercase opacity-75">
                  {categories[activeCategory]}
                </span>
                <span className="text-[10px] opacity-50">3 items</span>
              </div>

              {sampleDishes.map((dish) => (
                <div
                  key={dish.id}
                  className="p-2.5 rounded-xl border transition-all duration-200 flex gap-2.5 items-center shadow-xs"
                  style={{
                    backgroundColor: theme.cardBackground,
                    borderColor: 'rgba(150, 150, 150, 0.15)',
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-xl shrink-0 border"
                    style={{
                      backgroundColor: theme.backgroundColor,
                      borderColor: 'rgba(150, 150, 150, 0.1)',
                    }}
                  >
                    {dish.img}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className="text-[12px] font-semibold truncate leading-tight">
                        {dish.title}
                      </h4>
                      <span
                        className="text-[11px] font-bold shrink-0"
                        style={{ color: theme.primaryColor }}
                      >
                        {dish.price}
                      </span>
                    </div>
                    <p className="text-[10px] opacity-75 line-clamp-1 leading-snug">
                      {dish.desc}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span
                        className="text-[9px] px-1.5 py-0.2 rounded font-medium"
                        style={{
                          backgroundColor: `${theme.primaryColor}15`,
                          color: theme.primaryColor,
                        }}
                      >
                        {dish.tag}
                      </span>
                      <button
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white transition-opacity hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        Add +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Sticky Mobile Order Bar */}
          <div
            className="absolute bottom-0 inset-x-0 p-3 backdrop-blur-md border-t flex items-center justify-between z-20"
            style={{
              backgroundColor: `${theme.cardBackground}ea`,
              borderColor: 'rgba(150, 150, 150, 0.15)',
            }}
          >
            <div>
              <div className="text-[9px] uppercase tracking-wider opacity-60">Order Summary</div>
              <div className="text-[12px] font-bold">2 items • $54.00</div>
            </div>
            <button
              className="px-3.5 py-1.5 rounded-xl text-[11px] font-bold text-white shadow-sm flex items-center gap-1 active:scale-95 transition-all"
              style={{
                backgroundColor: theme.primaryColor,
              }}
            >
              <span>View Cart</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Preview Caption */}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 font-medium">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>Live Customer Mobile Preview ({theme.name})</span>
      </div>
    </div>
  );
};
