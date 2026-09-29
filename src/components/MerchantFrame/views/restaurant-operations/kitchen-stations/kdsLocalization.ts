/**
 * kdsLocalization.ts
 *
 * Motor de Localización (EN / ES), Detección de Alergias Críticas y
 * Parseo Visual de Modificadores (Adiciones vs Remociones) para KDS.
 *
 * Historia X7P-4212: Staff Multi-Language Display Toggle, Modifier Visual Badges & Allergy Alerts
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
// 1. DICCIONARIO BILINGÜE (INGLÉS ⇋ ESPAÑOL)
// ====================================================================

const DISH_TRANSLATIONS: Record<string, { en: string; es: string }> = {
  'smash burger doble': { en: 'Double Smash Burger', es: 'Smash Burger Doble' },
  'smash burger': { en: 'Smash Burger', es: 'Hamburguesa Smash' },
  'double smash burger': { en: 'Double Smash Burger', es: 'Smash Burger Doble' },
  'tacos al pastor': { en: 'Al Pastor Tacos', es: 'Tacos al Pastor' },
  'al pastor tacos': { en: 'Al Pastor Tacos', es: 'Tacos al Pastor' },
  'iced latte': { en: 'Iced Latte', es: 'Latte Helado' },
  'croissant de mantequilla': { en: 'Butter Croissant', es: 'Croissant de Mantequilla' },
  'butter croissant': { en: 'Butter Croissant', es: 'Croissant de Mantequilla' },
  'classic cheeseburger': { en: 'Classic Cheeseburger', es: 'Hamburguesa Clásica con Queso' },
  'crispy french fries': { en: 'Crispy French Fries', es: 'Papas Fritas Crujientes' },
  'caesar salad': { en: 'Caesar Salad', es: 'Ensalada César' },
  'grilled chicken sandwich': { en: 'Grilled Chicken Sandwich', es: 'Sándwich de Pollo a la Plancha' },
  'ribeye steak': { en: 'Ribeye Steak', es: 'Ojo de Bife / Bife de Chorizo' },
  'margherita pizza': { en: 'Margherita Pizza', es: 'Pizza Margarita' },
  'pepperoni pizza': { en: 'Pepperoni Pizza', es: 'Pizza de Pepperoni' },
  'craft beer': { en: 'Craft Beer', es: 'Cerveza Artesanal' },
  'sparkling water': { en: 'Sparkling Water', es: 'Agua con Gas' },
  'chocolate lava cake': { en: 'Chocolate Lava Cake', es: 'Volcán de Chocolate' },
  'chocolate brownie': { en: 'Chocolate Brownie', es: 'Brownie de Chocolate' },
};

const COURSE_TRANSLATIONS: Record<string, { en: string; es: string }> = {
  appetizer: { en: 'Appetizer', es: 'Entrada' },
  beverage: { en: 'Beverage', es: 'Bebida' },
  main_course: { en: 'Main Course', es: 'Plato Principal' },
  dessert: { en: 'Dessert', es: 'Postre' },
  drinks: { en: 'Drinks', es: 'Bebidas' },
  entree: { en: 'Entrée', es: 'Plato Fuerte' },
};

const UI_STRINGS: Record<string, { en: string; es: string }> = {
  // Acciones y estados de comandas
  DONE: { en: 'DONE', es: 'LISTO' },
  START: { en: 'START', es: 'INICIAR' },
  STARTED: { en: 'STARTED', es: 'EN COCCIÓN' },
  PENDING: { en: 'PENDING', es: 'PENDIENTE' },
  HELD: { en: 'HELD', es: 'RETENIDO' },
  FIRE: { en: 'FIRE', es: 'A FUEGO' },
  FIRED: { en: 'FIRED', es: 'EN FUEGO' },
  RECALL: { en: 'RECALL', es: 'RECUPERAR' },
  REROUTED: { en: 'REROUTED', es: 'RE-ENRUTADO' },
  OVERFLOW: { en: 'OVERFLOW', es: 'SOBRECUPO' },
  OFFLINE: { en: 'OFFLINE', es: 'SIN CONEXIÓN' },
  ONLINE: { en: 'ONLINE', es: 'EN LÍNEA' },

  // Alergias y Modificadores
  ALLERGY_ALERT: { en: 'ALLERGY ALERT', es: 'ALERTA DE ALERGIA' },
  SEVERE_ALLERGY: { en: 'SEVERE ALLERGY', es: 'ALERGIA SEVERA' },
  DIETARY_RESTRICTION: { en: 'DIETARY RESTRICTION', es: 'RESTRICCIÓN DIETARIA' },
  GLUTEN_FREE: { en: 'GLUTEN-FREE', es: 'SIN GLUTEN' },
  CELIAC: { en: 'CELIAC', es: 'CELÍACO' },
  VEGAN: { en: 'VEGAN', es: 'VEGANO' },
  NO_PEANUTS: { en: 'NO PEANUTS', es: 'SIN MANÍ' },
  DAIRY_FREE: { en: 'DAIRY-FREE', es: 'SIN LÁCTEOS' },

  // Encabezados y UI
  Table: { en: 'Table', es: 'Mesa' },
  Ticket: { en: 'Ticket', es: 'Comanda' },
  Course: { en: 'Course', es: 'Tiempo' },
  Pacing_Window: { en: 'Pacing Window:', es: 'Ritmo de Cocina:' },
  Auto_Fire: { en: 'Auto-Fire:', es: 'Disparo Automático:' },
  Types: { en: 'Types:', es: 'Tipos:' },
  All: { en: 'All', es: 'Todos' },
  Collapse_All: { en: 'Collapse All', es: 'Colapsar Todo' },
  Expand_All: { en: 'Expand All', es: 'Expandir Todo' },
  Special_Instructions: { en: 'Special Instructions', es: 'Instrucciones Especiales' },
  Kitchen_Notes: { en: 'Kitchen Notes', es: 'Notas de Cocina' },
  Language_Device_Toggle: {
    en: 'Device Language: English (Click for Spanish)',
    es: 'Idioma de Pantalla: Español (Clic para Inglés)',
  },
};

const COMMON_MODIFIER_TRANSLATIONS: Array<{ regex: RegExp; en: string; es: string }> = [
  { regex: /severe allergy:?\s*no peanuts/i, en: 'SEVERE ALLERGY: NO PEANUTS', es: 'ALERGIA SEVERA: SIN MANÍ' },
  { regex: /celiac allergy:?\s*100% gluten-free/i, en: 'CELIAC ALLERGY: 100% Gluten-Free', es: 'ALERGIA CELÍACO: 100% Sin Gluten' },
  { regex: /dairy allergy:?\s*sub oat milk/i, en: 'DAIRY ALLERGY: Sub Oat Milk', es: 'ALERGIA LÁCTEOS: Cambiar a Leche de Avena' },
  { regex: /vegan restriction:?\s*no butter glaze/i, en: 'VEGAN: No Butter Glaze', es: 'VEGANO: Sin Glaseado de Manteca' },
  { regex: /allergy:?\s*dairy/i, en: 'ALLERGY: DAIRY', es: 'ALERGIA: LÁCTEOS' },
  { regex: /allergy:?\s*peanuts?/i, en: 'ALLERGY: PEANUTS', es: 'ALERGIA: MANÍ' },
  { regex: /allergy:?\s*celiac/i, en: 'ALLERGY: CELIAC', es: 'ALERGIA: CELÍACO' },
  { regex: /allergy:?\s*gluten[- ]free/i, en: 'ALLERGY: GLUTEN-FREE', es: 'ALERGIA: SIN GLUTEN' },
  { regex: /allergy:?\s*shellfish/i, en: 'ALLERGY: SHELLFISH', es: 'ALERGIA: MARISCOS' },
  { regex: /gluten[- ]free bun/i, en: 'Gluten-Free Bun', es: 'Pan Sin Gluten' },
  { regex: /corn tortillas only/i, en: 'Corn Tortillas Only', es: 'Solo Tortillas de Maíz' },
  { regex: /sub oat milk/i, en: 'Sub Oat Milk', es: 'Leche de Avena' },
  { regex: /no peanuts/i, en: 'No Peanuts', es: 'Sin Maní' },
  { regex: /no onions?/i, en: 'No Onions', es: 'Sin Cebolla' },
  { regex: /no cilantro/i, en: 'No Cilantro', es: 'Sin Cilantro' },
  { regex: /no pickles?/i, en: 'No Pickles', es: 'Sin Pepinillos' },
  { regex: /no mayo(?:nnaise)?/i, en: 'No Mayo', es: 'Sin Mayonesa' },
  { regex: /no mustard/i, en: 'No Mustard', es: 'Sin Mostaza' },
  { regex: /no sugar/i, en: 'No Sugar', es: 'Sin Azúcar' },
  { regex: /no butter glaze/i, en: 'No Butter Glaze', es: 'Sin Glaseado de Manteca' },
  { regex: /no whipped cream/i, en: 'No Whipped Cream', es: 'Sin Crema Batida' },
  { regex: /(?:add\s+)?extra cheese/i, en: 'Extra Cheese', es: 'Extra Queso' },
  { regex: /(?:add\s+)?extra bacon/i, en: 'Extra Bacon', es: 'Extra Panceta/Bacon' },
  { regex: /(?:add\s+)?extra lime/i, en: 'Extra Lime', es: 'Extra Limón' },
  { regex: /(?:add\s+)?extra salsa/i, en: 'Extra Salsa', es: 'Extra Salsa' },
  { regex: /(?:add\s+)?extra ice/i, en: 'Extra Ice', es: 'Extra Hielo' },
  { regex: /(?:add\s+)?extra warm/i, en: 'Extra Warm', es: 'Bien Caliente' },
  { regex: /(?:add\s+)?extra shot espresso/i, en: 'Extra Espresso Shot', es: 'Shot Extra de Espresso' },
  { regex: /(?:add\s+)?extra vanilla syrup/i, en: 'Extra Vanilla Syrup', es: 'Extra Jarabe de Vainilla' },
  { regex: /well done/i, en: 'Well Done', es: 'Bien Cocido' },
  { regex: /medium rare/i, en: 'Medium Rare', es: 'A Punto / Término Medio' },
  { regex: /rare/i, en: 'Rare', es: 'Jugoso' },
  { regex: /warm and crispy/i, en: 'Warm and Crispy', es: 'Tibio y Crujiente' },
];

// ====================================================================
// 2. DETECCIÓN DE ALERGIAS (ALLERGY HIGHLIGHT ENGINE)
// ====================================================================

const ALLERGY_KEYWORDS = [
  { keyword: 'peanut', tag: 'PEANUTS', severity: 'critical' as const, labelEn: 'PEANUTS', labelEs: 'MANÍ' },
  { keyword: 'maní', tag: 'PEANUTS', severity: 'critical' as const, labelEn: 'PEANUTS', labelEs: 'MANÍ' },
  { keyword: 'cacahuate', tag: 'PEANUTS', severity: 'critical' as const, labelEn: 'PEANUTS', labelEs: 'MANÍ' },
  { keyword: 'tree nut', tag: 'TREE NUTS', severity: 'critical' as const, labelEn: 'TREE NUTS', labelEs: 'FRUTOS SECOS' },
  { keyword: 'nut', tag: 'NUTS', severity: 'critical' as const, labelEn: 'NUTS', labelEs: 'NUECES' },
  { keyword: 'nueces', tag: 'NUTS', severity: 'critical' as const, labelEn: 'NUTS', labelEs: 'NUECES' },
  { keyword: 'celiac', tag: 'CELIAC', severity: 'critical' as const, labelEn: 'CELIAC', labelEs: 'CELÍACO' },
  { keyword: 'celíaco', tag: 'CELIAC', severity: 'critical' as const, labelEn: 'CELIAC', labelEs: 'CELÍACO' },
  { keyword: 'gluten-free', tag: 'GLUTEN-FREE', severity: 'critical' as const, labelEn: 'GLUTEN-FREE', labelEs: 'SIN GLUTEN' },
  { keyword: 'gluten free', tag: 'GLUTEN-FREE', severity: 'critical' as const, labelEn: 'GLUTEN-FREE', labelEs: 'SIN GLUTEN' },
  { keyword: 'sin gluten', tag: 'GLUTEN-FREE', severity: 'critical' as const, labelEn: 'GLUTEN-FREE', labelEs: 'SIN GLUTEN' },
  { keyword: 'tacc', tag: 'GLUTEN-FREE', severity: 'critical' as const, labelEn: 'GLUTEN-FREE', labelEs: 'SIN TACC' },
  { keyword: 'shellfish', tag: 'SHELLFISH', severity: 'critical' as const, labelEn: 'SHELLFISH', labelEs: 'MARISCOS' },
  { keyword: 'mariscos', tag: 'SHELLFISH', severity: 'critical' as const, labelEn: 'SHELLFISH', labelEs: 'MARISCOS' },
  { keyword: 'crustáceo', tag: 'SHELLFISH', severity: 'critical' as const, labelEn: 'SHELLFISH', labelEs: 'CRUSTÁCEOS' },
  { keyword: 'dairy allergy', tag: 'DAIRY', severity: 'critical' as const, labelEn: 'DAIRY', labelEs: 'LÁCTEOS' },
  { keyword: 'dairy-free', tag: 'DAIRY-FREE', severity: 'warning' as const, labelEn: 'DAIRY-FREE', labelEs: 'SIN LÁCTEOS' },
  { keyword: 'sin lácteo', tag: 'DAIRY-FREE', severity: 'warning' as const, labelEn: 'DAIRY-FREE', labelEs: 'SIN LÁCTEOS' },
  { keyword: 'lactose', tag: 'LACTOSE', severity: 'warning' as const, labelEn: 'LACTOSE', labelEs: 'LACTOSA' },
  { keyword: 'dairy', tag: 'DAIRY', severity: 'critical' as const, labelEn: 'DAIRY', labelEs: 'LÁCTEOS' },
  { keyword: 'severe allergy', tag: 'SEVERE ALLERGY', severity: 'critical' as const, labelEn: 'SEVERE ALLERGY', labelEs: 'ALERGIA SEVERA' },
  { keyword: 'anaphylaxis', tag: 'ANAPHYLAXIS', severity: 'critical' as const, labelEn: 'ANAPHYLAXIS', labelEs: 'ANAFILAXIA' },
  { keyword: 'allergy', tag: 'ALLERGY', severity: 'critical' as const, labelEn: 'ALLERGY', labelEs: 'ALERGIA' },
  { keyword: 'alergia', tag: 'ALLERGY', severity: 'critical' as const, labelEn: 'ALLERGY', labelEs: 'ALERGIA' },
  { keyword: 'alérgica', tag: 'ALLERGY', severity: 'critical' as const, labelEn: 'ALLERGY', labelEs: 'ALERGIA' },
  { keyword: 'alérgico', tag: 'ALLERGY', severity: 'critical' as const, labelEn: 'ALLERGY', labelEs: 'ALERGIA' },
  { keyword: 'vegan', tag: 'VEGAN', severity: 'warning' as const, labelEn: 'VEGAN', labelEs: 'VEGANO' },
  { keyword: 'vegano', tag: 'VEGAN', severity: 'warning' as const, labelEn: 'VEGAN', labelEs: 'VEGANO' },
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

  // Si se especifica una alergia personalizada (ej. "Allergy: Garlic" o "Alergia: Ajo")
  const customAllergyMatches = text.matchAll(/(?:allergy|alergia):\s*([^,;\n]+)/gi);
  for (const match of customAllergyMatches) {
    if (match[1]?.trim()) {
      let specificIngredient = match[1].trim().toUpperCase();
      if (lang === 'es') {
        const lowerIng = specificIngredient.toLowerCase();
        if (lowerIng === 'dairy' || lowerIng === 'milk') specificIngredient = 'LÁCTEOS';
        else if (lowerIng === 'peanut' || lowerIng === 'peanuts' || lowerIng === 'no peanuts') specificIngredient = 'MANÍ';
        else if (lowerIng === 'celiac') specificIngredient = 'CELÍACO';
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

  // Normalización de idioma en matchedTags si lang === 'es'
  if (lang === 'es') {
    if (matchedTags.has('DAIRY')) {
      matchedTags.delete('DAIRY');
      matchedTags.add('LÁCTEOS');
    }
    if (matchedTags.has('PEANUTS') || matchedTags.has('PEANUT') || matchedTags.has('NO PEANUTS')) {
      matchedTags.delete('PEANUTS');
      matchedTags.delete('PEANUT');
      matchedTags.delete('NO PEANUTS');
      matchedTags.add('MANÍ');
    }
    if (matchedTags.has('CELIAC')) {
      matchedTags.delete('CELIAC');
      matchedTags.add('CELÍACO');
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

  // Deduplicación y Consolidación Inteligente de Alérgenos:
  // 1. Unificar Celíaco y Sin Gluten
  const hasCeliac = matchedTags.has(lang === 'es' ? 'CELÍACO' : 'CELIAC');
  const hasGlutenFree = matchedTags.has(lang === 'es' ? 'SIN GLUTEN' : 'GLUTEN-FREE') || matchedTags.has(lang === 'es' ? 'SIN TACC' : 'GLUTEN-FREE');
  if (hasCeliac && hasGlutenFree) {
    matchedTags.delete(lang === 'es' ? 'CELÍACO' : 'CELIAC');
    matchedTags.delete(lang === 'es' ? 'SIN GLUTEN' : 'GLUTEN-FREE');
    matchedTags.delete(lang === 'es' ? 'SIN TACC' : 'GLUTEN-FREE');
    matchedTags.add(lang === 'es' ? 'CELÍACO / SIN GLUTEN' : 'CELIAC / GLUTEN-FREE');
  }

  // 2. Unificar Maní y Frutos Secos / Nueces (y evitar match espurio de 'nut' dentro de 'peanut')
  const hasPeanut = matchedTags.has(lang === 'es' ? 'MANÍ' : 'PEANUTS');
  const hasTreeNut = matchedTags.has(lang === 'es' ? 'FRUTOS SECOS' : 'TREE NUTS');
  const hasNut = matchedTags.has(lang === 'es' ? 'NUECES' : 'NUTS');
  if (hasPeanut && (hasTreeNut || hasNut)) {
    matchedTags.delete(lang === 'es' ? 'MANÍ' : 'PEANUTS');
    matchedTags.delete(lang === 'es' ? 'FRUTOS SECOS' : 'TREE NUTS');
    matchedTags.delete(lang === 'es' ? 'NUECES' : 'NUTS');
    matchedTags.add(lang === 'es' ? 'MANÍ / NUECES' : 'PEANUTS & NUTS');
  } else if (hasPeanut && lower.includes('peanut')) {
    // Si solo decía peanut, remover 'NUTS' espurio
    if (!lower.includes('tree nut') && !lower.includes('nueces') && !lower.includes('nut ')) {
      matchedTags.delete(lang === 'es' ? 'NUECES' : 'NUTS');
    }
  }

  // 3. Eliminar etiquetas genéricas ("ALERGIA", "ALERGIA SEVERA") si ya hay alérgenos concretos identificados
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
// 3. PARSER DE MODIFICADORES (MODIFIER PARSING ENGINE)
// ====================================================================

export function parseItemModifiers(
  rawNotes?: string | null,
  lang: KDSLanguage = 'en'
): ParsedModifierBadge[] {
  if (!rawNotes || !rawNotes.trim()) return [];

  // Dividir por saltos de línea, comas, viñetas o punto y coma
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

    // 2. Caso: Adición (+ / Extra / Add / Con)
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
      // Garantizar texto limpio sin prefijo '+' redundante y normalizar a "Extra "
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

    // 3. Caso: Remoción (- / No / Without / Sin / Quitar)
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
      // Garantizar texto limpio sin prefijo '-' redundante
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

    // 4. Caso: Instrucción especial / Temperatura de cocción / Nota
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
// 4. MÉTODOS DE TRADUCCIÓN REACTIVA
// ====================================================================

export function getLocalizedDishName(originalName: string, _lang: KDSLanguage = 'en'): string {
  // Los nombres de los productos se mantienen tal cual aparecen en la base de datos (requerimiento de cocina)
  return originalName || '';
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
    // ignorar error de acceso a localStorage
  }
  return 'en';
}

export function getLocalizedVariantName(variantName?: string | null, _lang: KDSLanguage = 'en'): string {
  if (!variantName) return '';
  const trimmed = variantName.trim();
  if (!trimmed || trimmed.toLowerCase() === 'estándar' || trimmed.toLowerCase() === 'standard') return '';
  // Las variantes se mantienen tal cual aparecen en la base de datos
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
 * Extrae y limpia las instrucciones de cocina reales de las notas de la orden o ítem,
 * discriminando y descartando la referencia de ticket/mesa ("poo", "Table 4", "Mesa 1", etc.)
 * para que no se muestre falsamente como instrucción de cocina.
 */
export function extractCleanKitchenInstruction(
  notes?: string | null,
  tableName?: string | null
): string | null {
  if (!notes || !notes.trim()) return null;
  let text = notes.trim();

  // 1. Eliminar sufijos o marcas de enrutamiento y contingencia del sistema
  text = text
    .replace(/\|\s*\[(?:Auto-)?Rerouted[^\]]*\]/gi, '')
    .replace(/\[(?:Auto-)?Rerouted[^\]]*\]/gi, '')
    .trim();

  if (!text) return null;

  // 2. Si la nota coincide exactamente con el identificador de mesa / ticket reference, no es una instrucción
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

    // 3. Si la nota viene compuesta como "[TicketRef] • [Instrucción]", remover el segmento de referencia
    if (text.includes('•')) {
      const parts = text.split('•').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        const firstLower = parts[0].toLowerCase();
        const firstWithoutPrefix = firstLower.replace(/^(?:table|mesa)\s+/i, '').trim();

        if (
          firstLower === lowerTable ||
          firstWithoutPrefix === tableWithoutPrefix ||
          firstLower.startsWith('station #') ||
          firstLower.startsWith('estación #')
        ) {
          parts.shift();
          // Si el siguiente segmento era estación ("Station #KST-1..."), descartarlo también si aplica
          if (parts.length > 0 && /^(?:station|estación)\s*#[^•]*/i.test(parts[0])) {
            parts.shift();
          }
          text = parts.join(' • ').trim();
        }
      }
    }
  }

  // 4. Descartar prefijos de mesa restantes tipo "Table 4 • " o "Mesa 4 • "
  text = text.replace(/^(?:table|mesa)\s+\S+\s*•\s*/i, '').trim();

  if (!text) return null;
  if (tableName && text.toLowerCase() === tableName.trim().toLowerCase()) return null;

  return text;
}

