// Domain types for QR Menu management (QRMenu, QRMenuSection, QRMenuItem).
// Aligns with TypeORM backend entity structure and dynamic mobile preview system.

export type QRMenuType = 'Table' | 'Pickup' | 'Delivery';

export type QRMenuStatus = 'active' | 'inactive' | 'archived';

export interface QRMenuDesignTheme {
  id: string; // value stored in design_theme attribute
  name: string;
  category: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardBackground: string;
  textColor: string;
  mutedTextColor: string;
  headerBackground: string;
  badgeStyle: string;
  fontFamily: string;
  tag: string;
}

export interface QRMenu {
  id: number;
  merchant_id: number;
  name: string;
  description: string;
  status: QRMenuStatus;
  design_theme: string;
  qr_type: QRMenuType;
  created_at?: string;
  updated_at?: string;
  merchant?: {
    id: number;
    name: string;
  };
  sections?: QRMenuSection[];
  sections_count?: number;
  items_count?: number;
}

export type QRMenuSectionStatus = 'active' | 'inactive' | 'archived';

export interface QRMenuSection {
  id: number;
  qr_menu_id: number;
  name: string;
  description: string;
  status: string; // 'active' | 'inactive' | 'archived'
  display_order: number;
  items?: QRMenuItem[];
  items_count?: number;
  qrMenu?: QRMenu;
}

export interface CreateQRMenuSectionDto {
  qr_menu_id: number;
  name: string;
  description?: string;
  status: QRMenuSectionStatus | string;
  display_order?: number;
}

export interface UpdateQRMenuSectionDto {
  qr_menu_id?: number;
  name?: string;
  description?: string;
  status?: QRMenuSectionStatus | string;
  display_order?: number;
}

export interface BulkReorderSectionItem {
  id: number;
  display_order: number;
}

export interface BulkReorderSectionsDto {
  qr_menu_id: number;
  sections: BulkReorderSectionItem[];
  sectionIds?: number[];
}

export const QR_MENU_SECTION_STATUSES: QRMenuSectionStatus[] = [
  'active',
  'inactive',
  'archived',
];

export const QR_MENU_SECTION_STATUS_CONFIG: Record<
  QRMenuSectionStatus,
  {
    label: string;
    description: string;
    pillHex: string;
    dotClass: string;
    badgeClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  active: {
    label: 'Active',
    description: 'Visible in Mobile Menu',
    pillHex: '#10b981',
    dotClass: 'bg-[#10b981]',
    badgeClass: 'bg-emerald-500/10 text-[#10b981] border-emerald-500/30',
    textClass: 'text-[#10b981]',
    borderClass: 'border-emerald-300',
  },
  inactive: {
    label: 'Inactive',
    description: 'Hidden from Mobile Menu',
    pillHex: '#f59e0b',
    dotClass: 'bg-[#f59e0b]',
    badgeClass: 'bg-amber-500/10 text-[#f59e0b] border-amber-500/30',
    textClass: 'text-[#f59e0b]',
    borderClass: 'border-amber-300',
  },
  archived: {
    label: 'Archived',
    description: 'Archived Section',
    pillHex: '#ef4444',
    dotClass: 'bg-[#ef4444]',
    badgeClass: 'bg-rose-500/10 text-[#ef4444] border-rose-500/30',
    textClass: 'text-[#ef4444]',
    borderClass: 'border-rose-300',
  },
};

export type QRMenuItemStatus = 'active' | 'inactive' | 'archived';

export interface QRMenuItemProductRef {
  id: number;
  name: string;
  sku?: string;
  basePrice?: number | string;
  price?: number;
  description?: string;
}

export interface QRMenuItemMerchantRef {
  id: number;
  name: string;
}

export interface QRMenuItem {
  id: number;
  merchant_id?: number;
  merchant?: QRMenuItemMerchantRef;
  qr_menu_section_id: number;
  qrMenuSection?: QRMenuSection;
  product_id?: number | null;
  product?: QRMenuItemProductRef | null;
  product_name?: string;
  name?: string;
  description?: string;
  notes?: string;
  image_url?: string;
  price?: number;
  display_order: number;
  is_available?: boolean;
  is_visible?: boolean;
  status: QRMenuItemStatus | string;
  variant_id?: number | null;
  variant_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateQRMenuItemDto {
  merchant_id?: number;
  qr_menu_section_id: number;
  product_id?: number | null;
  name: string;
  description?: string;
  image_url?: string;
  price: number;
  display_order?: number;
  is_available?: boolean;
  status?: QRMenuItemStatus | string;
}

export interface UpdateQRMenuItemDto {
  merchant_id?: number;
  qr_menu_section_id?: number;
  product_id?: number | null;
  name?: string;
  description?: string;
  image_url?: string;
  price?: number;
  display_order?: number;
  is_available?: boolean;
  status?: QRMenuItemStatus | string;
}

export const QR_MENU_ITEM_STATUSES: QRMenuItemStatus[] = [
  'active',
  'inactive',
  'archived',
];

export const QR_MENU_ITEM_STATUS_CONFIG: Record<
  QRMenuItemStatus,
  {
    label: string;
    description: string;
    pillHex: string;
    dotClass: string;
    badgeClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  active: {
    label: 'Published',
    description: 'Active and visible in QR menu',
    pillHex: '#10b981',
    dotClass: 'bg-[#10b981]',
    badgeClass: 'bg-emerald-500/10 text-[#10b981] border-emerald-500/30 font-semibold',
    textClass: 'text-[#10b981]',
    borderClass: 'border-emerald-300',
  },
  inactive: {
    label: 'Hidden',
    description: 'Hidden from customer view',
    pillHex: '#f59e0b',
    dotClass: 'bg-[#f59e0b]',
    badgeClass: 'bg-amber-500/10 text-[#f59e0b] border-amber-500/30 font-semibold',
    textClass: 'text-[#f59e0b]',
    borderClass: 'border-amber-300',
  },
  archived: {
    label: 'Archived',
    description: 'Archived record',
    pillHex: '#ef4444',
    dotClass: 'bg-[#ef4444]',
    badgeClass: 'bg-rose-500/10 text-[#ef4444] border-rose-500/30 font-semibold',
    textClass: 'text-[#ef4444]',
    borderClass: 'border-rose-300',
  },
};

export interface CreateQRMenuDto {
  name: string;
  description: string;
  status: QRMenuStatus;
  design_theme: string;
  qr_type: QRMenuType;
  merchant?: number;
}

export interface UpdateQRMenuDto {
  name?: string;
  description?: string;
  status?: QRMenuStatus;
  design_theme?: string;
  qr_type?: QRMenuType;
  merchant?: number;
}

export interface CloneQRMenuDto {
  source_menu_id: number;
  name: string;
  description?: string;
  status?: QRMenuStatus;
  design_theme?: string;
  qr_type?: QRMenuType;
  merchant_id?: number;
}

export const QR_MENU_TYPES: QRMenuType[] = ['Table', 'Pickup', 'Delivery'];

export const QR_MENU_TYPE_META: Record<
  QRMenuType,
  { label: string; icon: string; description: string; badgeColor: string }
> = {
  Table: {
    label: 'Table Dine-In',
    icon: 'table_restaurant',
    description: 'In-venue scanning for seated dine-in service and table ordering.',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  Pickup: {
    label: 'Curbside & Pickup',
    icon: 'shopping_bag',
    description: 'Counter pickup, takeaway orders, and express to-go scanning.',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  Delivery: {
    label: 'Direct Delivery',
    icon: 'local_shipping',
    description: 'Direct door-to-door delivery ordering for online customers.',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

export const QR_MENU_STATUSES: QRMenuStatus[] = ['active', 'inactive', 'archived'];

export const QR_MENU_STATUS_BADGES: Record<
  QRMenuStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  active: {
    label: 'Active Live',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 font-semibold',
    dotClass: 'bg-emerald-500',
  },
  inactive: {
    label: 'Draft / Inactive',
    badgeClass: 'bg-amber-500/10 text-amber-600 border border-amber-500/30 font-semibold',
    dotClass: 'bg-amber-500',
  },
  archived: {
    label: 'Archived',
    badgeClass: 'bg-rose-500/10 text-rose-600 border border-rose-500/30 font-semibold',
    dotClass: 'bg-rose-500',
  },
};

export const DESIGN_THEMES: QRMenuDesignTheme[] = [
  {
    id: 'Texas Theme',
    name: 'Texas Theme',
    category: 'Steakhouse & Grill',
    description: 'Warm smoked amber, rich charcoal textures, and rustic smokehouse typography.',
    primaryColor: '#b45309', // amber-700
    secondaryColor: '#78350f', // amber-900
    accentColor: '#f59e0b', // amber-500
    backgroundColor: '#fffbeb', // amber-50
    cardBackground: '#ffffff',
    textColor: '#451a03',
    mutedTextColor: '#92400e',
    headerBackground: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
    badgeStyle: 'bg-amber-100 text-amber-900 border-amber-300',
    fontFamily: 'serif',
    tag: 'Rustic Grill',
  },
  {
    id: 'Modern Elegance',
    name: 'Modern Elegance',
    category: 'Fine Dining & Luxe',
    description: 'Champagne gold accents over sleek deep obsidian for luxury dining experiences.',
    primaryColor: '#c59b27', // gold
    secondaryColor: '#0f172a', // slate-900
    accentColor: '#fbbf24', // amber-400
    backgroundColor: '#0b0f17', // obsidian
    cardBackground: '#131b28',
    textColor: '#f8fafc',
    mutedTextColor: '#94a3b8',
    headerBackground: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #c59b27 100%)',
    badgeStyle: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    fontFamily: 'sans-serif',
    tag: 'Haute Cuisine',
  },
  {
    id: 'Midnight Bistro',
    name: 'Midnight Bistro',
    category: 'Bar & Lounge',
    description: 'Electric neon violet highlights on dark mode noir for cocktail bars & nightlife.',
    primaryColor: '#8b5cf6', // violet-500
    secondaryColor: '#4c1d95', // violet-900
    accentColor: '#ec4899', // pink-500
    backgroundColor: '#09090b', // zinc-950
    cardBackground: '#18181b',
    textColor: '#fafafa',
    mutedTextColor: '#a1a1aa',
    headerBackground: 'linear-gradient(135deg, #18181b 0%, #2e1065 50%, #4c1d95 100%)',
    badgeStyle: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    fontFamily: 'sans-serif',
    tag: 'Cocktail Lounge',
  },
  {
    id: 'Emerald Garden',
    name: 'Emerald Garden',
    category: 'Farm-to-Table',
    description: 'Lush botanical emerald and fresh sage tones for organic, healthy, vegan dining.',
    primaryColor: '#059669', // emerald-600
    secondaryColor: '#064e3b', // emerald-900
    accentColor: '#10b981', // emerald-500
    backgroundColor: '#f0fdf4', // emerald-50
    cardBackground: '#ffffff',
    textColor: '#064e3b',
    mutedTextColor: '#047857',
    headerBackground: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
    badgeStyle: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    fontFamily: 'sans-serif',
    tag: 'Organic Fresh',
  },
  {
    id: 'Sunset Coral',
    name: 'Sunset Coral',
    category: 'Casual Beach & Terrace',
    description: 'Sun-kissed warm coral, terracotta, and golden peach for seaside & patio cafes.',
    primaryColor: '#f43f5e', // rose-500
    secondaryColor: '#881337', // rose-900
    accentColor: '#fb7185', // rose-400
    backgroundColor: '#fff1f2', // rose-50
    cardBackground: '#ffffff',
    textColor: '#4c0519',
    mutedTextColor: '#9f1239',
    headerBackground: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)',
    badgeStyle: 'bg-rose-100 text-rose-800 border-rose-300',
    fontFamily: 'sans-serif',
    tag: 'Summer Patio',
  },
  {
    id: 'Tokyo Minimal',
    name: 'Tokyo Minimal',
    category: 'Asian & Contemporary',
    description: 'High-contrast monochromatic clean lines with crimson vermilion focal accents.',
    primaryColor: '#dc2626', // red-600
    secondaryColor: '#18181b', // zinc-900
    accentColor: '#ef4444', // red-500
    backgroundColor: '#fafafa', // zinc-50
    cardBackground: '#ffffff',
    textColor: '#18181b',
    mutedTextColor: '#71717a',
    headerBackground: 'linear-gradient(135deg, #18181b 0%, #27272a 70%, #dc2626 100%)',
    badgeStyle: 'bg-red-50 text-red-700 border-red-200',
    fontFamily: 'sans-serif',
    tag: 'Japanese Pure',
  },
  {
    id: 'Artisan Bakery',
    name: 'Artisan Bakery',
    category: 'Cafe & Patisserie',
    description: 'Soft warm sourdough ivory, golden butter tones, and cozy roast coffee accents.',
    primaryColor: '#d97706', // amber-600
    secondaryColor: '#78350f', // amber-900
    accentColor: '#f59e0b', // amber-500
    backgroundColor: '#fefce8', // yellow-50
    cardBackground: '#ffffff',
    textColor: '#451a03',
    mutedTextColor: '#92400e',
    headerBackground: 'linear-gradient(135deg, #92400e 0%, #d97706 100%)',
    badgeStyle: 'bg-amber-100 text-amber-900 border-amber-300',
    fontFamily: 'serif',
    tag: 'Cozy Cafe',
  },
  {
    id: 'Cyber Fusion',
    name: 'Cyber Fusion',
    category: 'Fast-Casual Tech',
    description: 'Deep digital indigo, cyan laser glow, and vibrant youth-oriented street food style.',
    primaryColor: '#06b6d4', // cyan-500
    secondaryColor: '#1e1b4b', // indigo-950
    accentColor: '#3b82f6', // blue-500
    backgroundColor: '#030712', // gray-950
    cardBackground: '#0f172a',
    textColor: '#f1f5f9',
    mutedTextColor: '#64748b',
    headerBackground: 'linear-gradient(135deg, #1e1b4b 0%, #0e7490 100%)',
    badgeStyle: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    fontFamily: 'sans-serif',
    tag: 'Digital Pop',
  },
];
