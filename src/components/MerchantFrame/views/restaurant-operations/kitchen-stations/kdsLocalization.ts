/**
 * kdsLocalization.ts
 *
 * Localization Engine, Critical Allergy Detection and
 * Visual Modifier Parser (Additions vs Removals) for KDS.
 *
 * Story X7P-4212: Staff Multi-Language Display Toggle, Modifier Visual Badges & Allergy Alerts
 */

export type KDSLanguage = 'en' | 'es';

export type ModifierCategory = 'allergy' | 'addition' | 'removal' | 'preference' | 'instruction';

export interface ParsedModifierBadge {
  id: string;
  raw: string;
  text: string;
  category: ModifierCategory;
  isAllergy: boolean;
  prefix?: string;
  iconName: string;
  badgeClasses: string;
}

export interface AllergyDetectionResult {
  hasAllergy: boolean;
  allergyTags: string[];
  highestSeverity: 'critical' | 'warning' | 'none';
  matchedKeywords: string[];
  alertBannerText: string;
}

// ====================================================================
// 1. LOCALIZATION DICTIONARY
// ====================================================================

export const DISH_TRANSLATIONS: Record<string, { en: string; es: string }> = {
  'smash burger doble': { en: 'Double Smash Burger', es: 'Double Smash Burger' },
  'smash burger': { en: 'Smash Burger', es: 'Smash Burger' },
  'double smash burger': { en: 'Double Smash Burger', es: 'Double Smash Burger' },
  'tacos al pastor': { en: 'Tacos al Pastor', es: 'Tacos al Pastor' },
  'al pastor tacos': { en: 'Tacos al Pastor', es: 'Tacos al Pastor' },
  'tacos al pastor (3 pcs)': { en: 'Tacos al Pastor (3 pcs)', es: 'Tacos al Pastor (3 pcs)' },
  'al pastor tacos (3 pcs)': { en: 'Tacos al Pastor (3 pcs)', es: 'Tacos al Pastor (3 pcs)' },
  'iced latte': { en: 'Iced Latte', es: 'Iced Latte' },
  'croissant de mantequilla': { en: 'Butter Croissant', es: 'Butter Croissant' },
  'butter croissant': { en: 'Butter Croissant', es: 'Butter Croissant' },
  'classic cheeseburger': { en: 'Classic Cheeseburger', es: 'Classic Cheeseburger' },
  'crispy french fries': { en: 'Crispy French Fries', es: 'Crispy French Fries' },
  'caesar salad': { en: 'Caesar Salad', es: 'Caesar Salad' },
  'grilled chicken sandwich': { en: 'Grilled Chicken Sandwich', es: 'Grilled Chicken Sandwich' },
  'ribeye steak': { en: 'Ribeye Steak', es: 'Ribeye Steak' },
  'margherita pizza': { en: 'Margherita Pizza', es: 'Margherita Pizza' },
  'pepperoni pizza': { en: 'Pepperoni Pizza', es: 'Pepperoni Pizza' },
  'craft beer': { en: 'Craft Beer', es: 'Craft Beer' },
  'sparkling water': { en: 'Sparkling Water', es: 'Sparkling Water' },
  'chocolate lava cake': { en: 'Chocolate Lava Cake', es: 'Chocolate Lava Cake' },
  'chocolate brownie': { en: 'Chocolate Brownie', es: 'Chocolate Brownie' },
};

const COURSE_TRANSLATIONS: Record<string, { en: string; es: string }> = {
  appetizer: { en: 'Appetizer', es: 'Appetizer' },
  beverage: { en: 'Beverage', es: 'Beverage' },
  main_course: { en: 'Main Course', es: 'Main Course' },
  dessert: { en: 'Dessert', es: 'Dessert' },
  drinks: { en: 'Drinks', es: 'Drinks' },
  entree: { en: 'Entree', es: 'Entree' },
};

const UI_STRINGS: Record<string, { en: string; es: string }> = {
  // Actions and command states
  DONE: { en: 'DONE', es: 'DONE' },
  START: { en: 'START', es: 'START' },
  STARTED: { en: 'STARTED', es: 'STARTED' },
  PENDING: { en: 'PENDING', es: 'PENDING' },
  HELD: { en: 'HELD', es: 'HELD' },
  FIRE: { en: 'FIRE', es: 'FIRE' },
  FIRED: { en: 'FIRED', es: 'FIRED' },
  RECALL: { en: 'RECALL', es: 'RECALL' },
  REROUTED: { en: 'REROUTED', es: 'REROUTED' },
  OVERFLOW: { en: 'OVERFLOW', es: 'OVERFLOW' },
  OFFLINE: { en: 'OFFLINE', es: 'OFFLINE' },
  ONLINE: { en: 'ONLINE', es: 'ONLINE' },

  // Alergias y Modificadores
  ALLERGY_ALERT: { en: 'ALLERGY ALERT', es: 'ALLERGY ALERT' },
  SEVERE_ALLERGY: { en: 'SEVERE ALLERGY', es: 'SEVERE ALLERGY' },
  DIETARY_RESTRICTION: { en: 'DIETARY RESTRICTION', es: 'DIETARY RESTRICTION' },
  GLUTEN_FREE: { en: 'GLUTEN-FREE', es: 'GLUTEN-FREE' },
  CELIAC: { en: 'CELIAC', es: 'CELIAC' },
  VEGAN: { en: 'VEGAN', es: 'VEGAN' },
  NO_PEANUTS: { en: 'NO PEANUTS', es: 'NO PEANUTS' },
  DAIRY_FREE: { en: 'DAIRY-FREE', es: 'DAIRY-FREE' },

  // Encabezados y UI
  Table: { en: 'Table', es: 'Table' },
  Ticket: { en: 'Ticket', es: 'Ticket' },
  Course: { en: 'Course', es: 'Course' },
  Pacing_Window: { en: 'Pacing Window:', es: 'Pacing Window:' },
  Auto_Fire: { en: 'Auto-Fire:', es: 'Auto-Fire:' },
  Types: { en: 'Types:', es: 'Types:' },
  All: { en: 'All', es: 'All' },
  Collapse_All: { en: 'Collapse All', es: 'Collapse All' },
  Expand_All: { en: 'Expand All', es: 'Expand All' },
  Special_Instructions: { en: 'Special Instructions', es: 'Special Instructions' },
  Kitchen_Notes: { en: 'Kitchen Notes', es: 'Kitchen Notes' },
  Language_Device_Toggle: {
    en: 'Device Language: English',
    es: 'Device Language: English',
  },
};

const COMMON_MODIFIER_TRANSLATIONS: Array<{ regex: RegExp; en: string; es: string }> = [
  { regex: /severe allergy:?\s*no peanuts/i, en: 'SEVERE ALLERGY: NO PEANUTS', es: 'SEVERE ALLERGY: NO PEANUTS' },
  { regex: /celiac allergy:?\s*100% gluten-free/i, en: 'CELIAC ALLERGY: 100% Gluten-Free', es: 'CELIAC ALLERGY: 100% Gluten-Free' },
  { regex: /dairy allergy:?\s*sub oat milk/i, en: 'DAIRY ALLERGY: Sub Oat Milk', es: 'DAIRY ALLERGY: Sub Oat Milk' },
  { regex: /vegan restriction:?\s*no butter glaze/i, en: 'VEGAN: No Butter Glaze', es: 'VEGAN: No Butter Glaze' },
  { regex: /allergy:?\s*dairy/i, en: 'ALLERGY: DAIRY', es: 'ALLERGY: DAIRY' },
  { regex: /allergy:?\s*peanuts?/i, en: 'ALLERGY: PEANUTS', es: 'ALLERGY: PEANUTS' },
  { regex: /allergy:?\s*celiac/i, en: 'ALLERGY: CELIAC', es: 'ALLERGY: CELIAC' },
  { regex: /allergy:?\s*gluten[- ]free/i, en: 'ALLERGY: GLUTEN-FREE', es: 'ALLERGY: GLUTEN-FREE' },
  { regex: /allergy:?\s*shellfish/i, en: 'ALLERGY: SHELLFISH', es: 'ALLERGY: SHELLFISH' },
  { regex: /gluten[- ]free bun/i, en: 'Gluten-Free Bun', es: 'Gluten-Free Bun' },
  { regex: /corn tortillas only/i, en: 'Corn Tortillas Only', es: 'Corn Tortillas Only' },
  { regex: /sub oat milk/i, en: 'Sub Oat Milk', es: 'Sub Oat Milk' },
  { regex: /no peanuts/i, en: 'No Peanuts', es: 'No Peanuts' },
  { regex: /no onions?/i, en: 'No Onions', es: 'No Onions' },
  { regex: /no cilantro/i, en: 'No Cilantro', es: 'No Cilantro' },
  { regex: /no pickles?/i, en: 'No Pickles', es: 'No Pickles' },
  { regex: /no mayo(?:nnaise)?/i, en: 'No Mayo', es: 'No Mayo' },
  { regex: /no mustard/i, en: 'No Mustard', es: 'No Mustard' },
  { regex: /no sugar/i, en: 'No Sugar', es: 'No Sugar' },
  { regex: /no butter glaze/i, en: 'No Butter Glaze', es: 'No Butter Glaze' },
  { regex: /no whipped cream/i, en: 'No Whipped Cream', es: 'No Whipped Cream' },
  { regex: /(?:add\s+)?extra cheese/i, en: 'Extra Cheese', es: 'Extra Cheese' },
  { regex: /(?:add\s+)?extra bacon/i, en: 'Extra Bacon', es: 'Extra Bacon' },
  { regex: /(?:add\s+)?extra lime/i, en: 'Extra Lime', es: 'Extra Lime' },
  { regex: /(?:add\s+)?extra salsa/i, en: 'Extra Salsa', es: 'Extra Salsa' },
  { regex: /(?:add\s+)?extra ice/i, en: 'Extra Ice', es: 'Extra Ice' },
  { regex: /(?:add\s+)?extra warm/i, en: 'Extra Warm', es: 'Extra Warm' },
  { regex: /(?:add\s+)?extra shot espresso/i, en: 'Extra Espresso Shot', es: 'Extra Espresso Shot' },
  { regex: /(?:add\s+)?extra vanilla syrup/i, en: 'Extra Vanilla Syrup', es: 'Extra Vanilla Syrup' },
  { regex: /well done/i, en: 'Well Done', es: 'Well Done' },
  { regex: /medium rare/i, en: 'Medium Rare', es: 'Medium Rare' },
  { regex: /rare/i, en: 'Rare', es: 'Rare' },
  { regex: /warm and crispy/i, en: 'Warm and Crispy', es: 'Warm and Crispy' },
];

// ====================================================================
// 2. ALLERGY HIGHLIGHT ENGINE
// ====================================================================

const ALLERGY_KEYWORDS = [
  { keyword: 'peanut', tag: 'PEANUTS', severity: 'critical' as const, labelEn: 'PEANUTS', labelEs: 'PEANUTS' },
      { keyword: 'tree nut', tag: 'TREE NUTS', severity: 'critical' as const, labelEn: 'TREE NUTS', labelEs: 'TREE NUTS' },
  { keyword: 'nut', tag: 'NUTS', severity: 'critical' as const, labelEn: 'NUTS', labelEs: 'NUTS' },
    { keyword: 'celiac', tag: 'CELIAC', severity: 'critical' as const, labelEn: 'CELIAC', labelEs: 'CELIAC' },
    { keyword: 'gluten-free', tag: 'GLUTEN-FREE', severity: 'critical' as const, labelEn: 'GLUTEN-FREE', labelEs: 'GLUTEN-FREE' },
  { keyword: 'gluten free', tag: 'GLUTEN-FREE', severity: 'critical' as const, labelEn: 'GLUTEN-FREE', labelEs: 'GLUTEN-FREE' },
      { keyword: 'shellfish', tag: 'SHELLFISH', severity: 'critical' as const, labelEn: 'SHELLFISH', labelEs: 'SHELLFISH' },
      { keyword: 'dairy allergy', tag: 'DAIRY', severity: 'critical' as const, labelEn: 'DAIRY', labelEs: 'DAIRY' },
  { keyword: 'dairy-free', tag: 'DAIRY-FREE', severity: 'warning' as const, labelEn: 'DAIRY-FREE', labelEs: 'DAIRY-FREE' },
    { keyword: 'lactose', tag: 'LACTOSE', severity: 'warning' as const, labelEn: 'LACTOSE', labelEs: 'LACTOSE' },
  { keyword: 'dairy', tag: 'DAIRY', severity: 'critical' as const, labelEn: 'DAIRY', labelEs: 'DAIRY' },
  { keyword: 'severe allergy', tag: 'SEVERE ALLERGY', severity: 'critical' as const, labelEn: 'SEVERE ALLERGY', labelEs: 'SEVERE ALLERGY' },
  { keyword: 'anaphylaxis', tag: 'ANAPHYLAXIS', severity: 'critical' as const, labelEn: 'ANAPHYLAXIS', labelEs: 'ANAPHYLAXIS' },
  { keyword: 'allergy', tag: 'ALLERGY', severity: 'critical' as const, labelEn: 'ALLERGY', labelEs: 'ALLERGY' },
        { keyword: 'vegan', tag: 'VEGAN', severity: 'warning' as const, labelEn: 'VEGAN', labelEs: 'VEGAN' },
  ];

export function detectAllergies(text?: string | null, lang: KDSLanguage = 'en'): AllergyDetectionResult {
  if (!text || !text.trim()) {
    return {
      hasAllergy: false,
      allergyTags: [],
      highestSeverity: 'none',
      matchedKeywords: [],
      alertBannerText: '',
    };
  }

  const lower = text.toLowerCase();
  const matchedTags = new Set<string>();
  const matchedKeywords: string[] = [];
  let highestSeverity: 'critical' | 'warning' | 'none' = 'none';

  for (const item of ALLERGY_KEYWORDS) {
    if (lower.includes(item.keyword)) {
      matchedTags.add(lang === 'es' ? item.labelEs : item.labelEn);
      matchedKeywords.push(item.keyword);
      if (item.severity === 'critical') {
        highestSeverity = 'critical';
      } else if (highestSeverity !== 'critical') {
        highestSeverity = 'warning';
      }
    }
  }

  // If a custom allergy is specified (e.g. "Allergy: Garlic" or "Allergy: Garlic")
  const customAllergyMatches = text.matchAll(/(?:allergy|alergia):\s*([^,;\n]+)/gi);
  for (const match of customAllergyMatches) {
    if (match[1]?.trim()) {
      let specificIngredient = match[1].trim().toUpperCase();
      if (lang === 'es') {
        const lowerIng = specificIngredient.toLowerCase();
        if (lowerIng === 'dairy' || lowerIng === 'milk') specificIngredient = 'DAIRY';
        else if (lowerIng === 'peanut' || lowerIng === 'peanuts' || lowerIng === 'no peanuts') specificIngredient = 'PEANUTS';
        else if (lowerIng === 'celiac') specificIngredient = 'CELIAC';
        else if (lowerIng === 'gluten-free' || lowerIng === 'gluten free') specificIngredient = 'SIN GLUTEN';
        else if (lowerIng === 'shellfish') specificIngredient = 'MARISCOS';
        else if (lowerIng === 'tree nut' || lowerIng === 'tree nuts' || lowerIng === 'nut' || lowerIng === 'nuts') specificIngredient = 'NUECES';
        else if (lowerIng === 'vegan') specificIngredient = 'VEGANO';
        else if (lowerIng === 'egg' || lowerIng === 'eggs') specificIngredient = 'HUEVO';
        else if (lowerIng === 'fish') specificIngredient = 'PESCADO';
        else if (lowerIng === 'soy') specificIngredient = 'SOJA';
        else if (lowerIng.startsWith('no ')) specificIngredient = `SIN ${specificIngredient.slice(3).trim()}`;
      }
      matchedTags.delete('ALLERGY');
      matchedTags.delete('ALERGIA');
      matchedTags.add(specificIngredient);
      highestSeverity = 'critical';
    }
  }

  // Tag normalization for matchedTags
  if (lang === 'es') {
    if (matchedTags.has('DAIRY')) {
      matchedTags.delete('DAIRY');
      matchedTags.add('DAIRY');
    }
    if (matchedTags.has('PEANUTS') || matchedTags.has('PEANUT') || matchedTags.has('NO PEANUTS')) {
      matchedTags.delete('PEANUTS');
      matchedTags.delete('PEANUT');
      matchedTags.delete('NO PEANUTS');
      matchedTags.add('PEANUTS');
    }
    if (matchedTags.has('CELIAC')) {
      matchedTags.delete('CELIAC');
      matchedTags.add('CELIAC');
    }
    if (matchedTags.has('GLUTEN-FREE')) {
      matchedTags.delete('GLUTEN-FREE');
      matchedTags.add('SIN GLUTEN');
    }
    if (matchedTags.has('SHELLFISH')) {
      matchedTags.delete('SHELLFISH');
      matchedTags.add('MARISCOS');
    }
    if (matchedTags.has('TREE NUTS') || matchedTags.has('NUTS')) {
      matchedTags.delete('TREE NUTS');
      matchedTags.delete('NUTS');
      matchedTags.add('NUECES');
    }
  }

  // Intelligent Allergen Deduplication & Consolidation:
  // 1. Unify Celiac and Gluten-Free
  const hasCeliac = matchedTags.has('CELIAC');
  const hasGlutenFree = matchedTags.has(lang === 'es' ? 'SIN GLUTEN' : 'GLUTEN-FREE') || matchedTags.has(lang === 'es' ? 'SIN TACC' : 'GLUTEN-FREE');
  if (hasCeliac && hasGlutenFree) {
    matchedTags.delete('CELIAC');
    matchedTags.delete(lang === 'es' ? 'SIN GLUTEN' : 'GLUTEN-FREE');
    matchedTags.delete(lang === 'es' ? 'SIN TACC' : 'GLUTEN-FREE');
    matchedTags.add('CELIAC / GLUTEN-FREE');
  }

  // 2. Unify Peanuts & Nuts
  const hasPeanut = matchedTags.has('PEANUTS');
  const hasTreeNut = matchedTags.has(lang === 'es' ? 'FRUTOS SECOS' : 'TREE NUTS');
  const hasNut = matchedTags.has(lang === 'es' ? 'NUECES' : 'NUTS');
  if (hasPeanut && (hasTreeNut || hasNut)) {
    matchedTags.delete('PEANUTS');
    matchedTags.delete(lang === 'es' ? 'FRUTOS SECOS' : 'TREE NUTS');
    matchedTags.delete(lang === 'es' ? 'NUECES' : 'NUTS');
    matchedTags.add('PEANUTS & NUTS');
  } else if (hasPeanut && lower.includes('peanut')) {
    // If only peanut was specified, remove spurious 'NUTS'
    if (!lower.includes('tree nut') && !lower.includes('nueces') && !lower.includes('nut ')) {
      matchedTags.delete(lang === 'es' ? 'NUECES' : 'NUTS');
    }
  }

  // 3. Remove generic tags ('ALLERGY', 'SEVERE ALLERGY') if specific allergens identified
  const concreteCount = Array.from(matchedTags).filter(
    (t) =>
      t !== 'ALLERGY' &&
      t !== 'ALERGIA' &&
      t !== 'SEVERE ALLERGY' &&
      t !== 'ALERGIA SEVERA'
  ).length;

  if (concreteCount > 0) {
    matchedTags.delete('ALLERGY');
    matchedTags.delete('ALERGIA');
    matchedTags.delete('SEVERE ALLERGY');
    matchedTags.delete('ALERGIA SEVERA');
  }

  const hasAllergy = matchedTags.size > 0;
  const tagList = Array.from(matchedTags);

  let alertBannerText = '';
  if (hasAllergy) {
    const prefix = highestSeverity === 'critical'
      ? (lang === 'es' ? 'ALERGIA' : 'ALLERGY')
      : (lang === 'es' ? 'DIETA' : 'DIET');
    alertBannerText = `${prefix}: ${tagList.join(', ')}`;
  }

  return {
    hasAllergy,
    allergyTags: tagList,
    highestSeverity,
    matchedKeywords,
    alertBannerText,
  };
}

// ====================================================================
// 3. MODIFIER PARSING ENGINE
// ====================================================================

export function parseItemModifiers(
  rawNotes?: string | null,
  lang: KDSLanguage = 'en'
): ParsedModifierBadge[] {
  if (!rawNotes || !rawNotes.trim()) return [];

  // Split by newlines, commas, bullet points, or semicolons
  const rawSegments = rawNotes
    .split(/[\n,;•|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return rawSegments.map((segment, idx) => {
    const lower = segment.toLowerCase();
    const allergyDetection = detectAllergies(segment, lang);

    // 1. Caso: Alergia
    if (allergyDetection.hasAllergy) {
      let localizedText = segment;
      for (const t of COMMON_MODIFIER_TRANSLATIONS) {
        if (t.regex.test(segment)) {
          localizedText = lang === 'es' ? t.es : t.en;
          break;
        }
      }
      return {
        id: `mod-allergy-${idx}-${segment.slice(0, 8)}`,
        raw: segment,
        text: localizedText.toUpperCase(),
        category: 'allergy',
        isAllergy: true,
        iconName: 'warning',
        badgeClasses:
          'bg-red-950/90 text-red-100 border-2 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse font-black uppercase tracking-wider',
      };
    }

    // 2. Case: Addition (+ / Extra / Add / With)
    const isAddition =
      segment.startsWith('+') ||
      lower.startsWith('extra ') ||
      lower.startsWith('add ') ||
      lower.startsWith('con ') ||
      lower.includes('extra ') ||
      lower.startsWith('agregar ');

    if (isAddition) {
      let localizedText = segment;
      for (const t of COMMON_MODIFIER_TRANSLATIONS) {
        if (t.regex.test(segment)) {
          localizedText = lang === 'es' ? t.es : t.en;
          break;
        }
      }
      // Ensure clean text without redundant '+' prefix and normalize to "Extra"
      let cleanText = localizedText.replace(/^\+\s*/, '').trim();
      const lowerClean = cleanText.toLowerCase();
      if (lowerClean.startsWith('add extra ')) {
        cleanText = `Extra ${cleanText.slice(10).trim()}`;
      } else if (lowerClean.startsWith('add ')) {
        cleanText = `Extra ${cleanText.slice(4).trim()}`;
      } else if (lowerClean.startsWith('agregar ')) {
        cleanText = `Extra ${cleanText.slice(8).trim()}`;
      } else if (!lowerClean.startsWith('extra ') && !lowerClean.startsWith('con ')) {
        cleanText = `Extra ${cleanText}`;
      }
      return {
        id: `mod-add-${idx}`,
        raw: segment,
        text: cleanText,
        category: 'addition',
        isAllergy: false,
        prefix: '+',
        iconName: 'add_circle',
        badgeClasses:
          'bg-emerald-950/80 text-emerald-300 border border-emerald-500/70 font-bold shadow-sm',
      };
    }

    // 3. Case: Removal (- / No / Without / Remove)
    const isRemoval =
      segment.startsWith('-') ||
      lower.startsWith('no ') ||
      lower.startsWith('without ') ||
      lower.startsWith('sin ') ||
      lower.startsWith('quitar ');

    if (isRemoval) {
      let localizedText = segment;
      for (const t of COMMON_MODIFIER_TRANSLATIONS) {
        if (t.regex.test(segment)) {
          localizedText = lang === 'es' ? t.es : t.en;
          break;
        }
      }
      // Ensure clean text without redundant '-' prefix
      let cleanText = localizedText.replace(/^-\s*/, '').trim();
      if (lang === 'es' && cleanText.toLowerCase().startsWith('no ')) {
        cleanText = `Sin ${cleanText.slice(3).trim()}`;
      } else if (lang === 'es' && cleanText.toLowerCase().startsWith('without ')) {
        cleanText = `Sin ${cleanText.slice(8).trim()}`;
      }
      return {
        id: `mod-rem-${idx}`,
        raw: segment,
        text: cleanText,
        category: 'removal',
        isAllergy: false,
        prefix: '-',
        iconName: 'do_not_disturb_on',
        badgeClasses:
          'bg-rose-950/80 text-rose-300 border border-rose-500/70 font-bold shadow-sm',
      };
    }

    // 4. Case: Special instruction / Cooking temperature / Note
    let localizedText = segment;
    for (const t of COMMON_MODIFIER_TRANSLATIONS) {
      if (t.regex.test(segment)) {
        localizedText = lang === 'es' ? t.es : t.en;
        break;
      }
    }

    return {
      id: `mod-inst-${idx}`,
      raw: segment,
      text: localizedText,
      category: 'instruction',
      isAllergy: false,
      iconName: 'tune',
      badgeClasses:
        'bg-amber-950/60 text-amber-300 border border-amber-500/50 font-medium shadow-sm',
    };
  });
}

// ====================================================================
// 4. REACTIVE TRANSLATION UTILITIES
// ====================================================================

export function getLocalizedDishName(originalName: string, lang: KDSLanguage = 'en'): string {
  if (!originalName) return '';
  const lower = originalName.toLowerCase().trim();
  if (DISH_TRANSLATIONS[lower]) {
    return DISH_TRANSLATIONS[lower][lang];
  }
  return originalName;
}

export function getLocalizedCourse(course: string, lang: KDSLanguage = 'en'): string {
  if (!course) return course;
  const lower = course.toLowerCase().trim();
  if (COURSE_TRANSLATIONS[lower]) {
    return COURSE_TRANSLATIONS[lower][lang];
  }
  return course.toUpperCase();
}

export function getLocalizedUIString(key: string, lang: KDSLanguage = 'en'): string {
  if (UI_STRINGS[key]) {
    return UI_STRINGS[key][lang];
  }
  return key;
}

export function getDeviceLanguage(stationId?: number | string | null): KDSLanguage {
  if (typeof window === 'undefined') return 'en';
  try {
    const key = stationId ? `kds_device_lang_${stationId}` : 'kds_device_lang_default';
    const stored = localStorage.getItem(key) || localStorage.getItem('kds_device_lang_global');
    if (stored === 'es' || stored === 'en') {
      return stored;
    }
  } catch {
    // ignore localStorage access error
  }
  return 'en';
}

export function getLocalizedVariantName(variantName?: string | null, lang: KDSLanguage = 'en'): string {
  if (!variantName) return '';
  const trimmed = variantName.trim();
  if (!trimmed || trimmed.toLowerCase() === 'estándar' || trimmed.toLowerCase() === 'standard') return '';
  if (lang === 'es') {
    const lower = trimmed.toLowerCase();
    if (lower === 'small') return 'Small';
    if (lower === 'medium') return 'Medium';
    if (lower === 'large') return 'Large';
  }
  return trimmed;
}

export function setDeviceLanguage(lang: KDSLanguage, stationId?: number | string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const key = stationId ? `kds_device_lang_${stationId}` : 'kds_device_lang_default';
    localStorage.setItem(key, lang);
    localStorage.setItem('kds_device_lang_global', lang);
  } catch {
    // ignorar error
  }
}

/**
 * Extracts and cleans actual kitchen instructions from order or item notes,
 * discriminating and discarding the ticket/table reference ("poo", "Table 4", "Table 1", etc.)
 * preventing spurious non-instruction text from displaying.
 */
export function extractCleanKitchenInstruction(
  notes?: string | null,
  tableName?: string | null
): string | null {
  if (!notes || !notes.trim()) return null;
  let text = notes.trim();

  // 1. Remove routing and contingency suffixes or flags from the system
  text = text
    .replace(/\|\s*\[(?:Auto-)?Rerouted[^\]]*\]/gi, '')
    .replace(/\[(?:Auto-)?Rerouted[^\]]*\]/gi, '')
    .trim();

  if (!text) return null;

  // 2. If note matches table or ticket reference, it is not an instruction
  if (tableName && tableName.trim()) {
    const rawTable = tableName.trim();
    const lowerTable = rawTable.toLowerCase();
    const tableWithoutPrefix = lowerTable.replace(/^(?:table|mesa)\s+/i, '').trim();

    const lowerText = text.toLowerCase();
    const textWithoutPrefix = lowerText.replace(/^(?:table|mesa)\s+/i, '').trim();

    if (
      lowerText === lowerTable ||
      textWithoutPrefix === tableWithoutPrefix ||
      lowerText === `table ${tableWithoutPrefix}` ||
      lowerText === `mesa ${tableWithoutPrefix}` ||
      lowerText === `ticket #${tableWithoutPrefix}` ||
      lowerText === `#ko-${tableWithoutPrefix}`
    ) {
      return null;
    }

    // 3. If note is formatted as "[TicketRef] • [Instruction]", remove reference segment
    if (text.includes('•')) {
      const parts = text.split('•').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        const firstLower = parts[0].toLowerCase();
        const firstWithoutPrefix = firstLower.replace(/^(?:table|mesa)\s+/i, '').trim();

        if (
          firstLower === lowerTable ||
          firstWithoutPrefix === tableWithoutPrefix ||
          firstLower.startsWith('station #') ||
          firstLower.startsWith('station #')
        ) {
          parts.shift();
          // If next segment is station reference, discard if applicable
          if (parts.length > 0 && /^(?:station)\s*#[^•]*/i.test(parts[0])) {
            parts.shift();
          }
          text = parts.join(' • ').trim();
        }
      }
    }
  }

  // 4. Discard remaining table prefixes such as "Table 4 • " or "Table 4 • "
  text = text.replace(/^(?:table|mesa)\s+\S+\s*•\s*/i, '').trim();

  if (!text) return null;
  if (tableName && text.toLowerCase() === tableName.trim().toLowerCase()) return null;

  return text;
}


// Nombres de estación habituales traducidos para la pantalla en español.
export const getLocalizedStationName = (name: string, lang: 'en' | 'es'): string => {
  if (lang !== 'es') return name;
  const n = name.trim().toLowerCase();
  if (n.includes('hot line')) return 'Línea Caliente y Parrilla';
  if (n.includes('cold prep')) return 'Preparación Fría y Ensaladas';
  if (n.includes('main bar')) return 'Bar Principal y Bebidas';
  if (n.includes('desserts') || n.includes('bakery')) return 'Postres y Panadería';
  if (n.includes('expo')) return 'Expo y Control de Calidad';
  return name;
};
