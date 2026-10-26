import type { KDSLanguage } from './kdsLocalization';
import type { CourseType, KitchenTicket } from './kds-monitor-model';

// Presentación del monitor KDS: cuenta atrás, colores por prioridad y textos por tiempo de servicio.

export const formatCountdown = (seconds?: number) => {
  if (seconds === undefined || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const getPriorityBadge = (priority: KitchenTicket['priority'], lang: KDSLanguage) => {
  const isEs = lang === 'es';
  switch (priority) {
    case 'vip':
      return {
        border: 'border-fuchsia-500',
        badge: 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/50 font-black animate-pulse',
        label: 'VIP RUSH (+3)',
      };
    case 'urgent':
      return {
        border: 'border-red-500',
        badge: 'bg-red-500/20 text-red-400 border border-red-500/40 font-black',
        label: isEs ? 'URGENTE (+2)' : 'URGENT (+2)',
      };
    case 'high':
      return {
        border: 'border-amber-500',
        badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold',
        label: isEs ? 'ALTA (+1)' : 'HIGH (+1)',
      };
    case 'normal':
    default:
      return {
        border: 'border-zinc-700',
        badge: 'bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold',
        label: 'NORMAL (0)',
      };
  }
};

export const getCourseTheme = (course: CourseType) => {
  switch (course) {
    case 'APPETIZER':
      return {
        title: 'APPETIZERS / STARTERS',
        icon: 'restaurant',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        fireLabel: 'FIRE APPS',
        prepVerb: 'PREP',
        prepIcon: 'restaurant',
        inPrepLabel: 'TO PREP',
      };
    case 'MAIN_COURSE':
      return {
        title: 'MAIN COURSES',
        icon: 'lunch_dining',
        badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        fireLabel: 'FIRE MAINS',
        prepVerb: 'COOK',
        prepIcon: 'skillet',
        inPrepLabel: 'TO COOK',
      };
    case 'DESSERT':
      return {
        title: 'DESSERTS',
        icon: 'cake',
        badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        fireLabel: 'FIRE DESSERTS',
        prepVerb: 'PREP',
        prepIcon: 'cake',
        inPrepLabel: 'TO PREP',
      };
    case 'BEVERAGE':
      return {
        title: 'BEVERAGES',
        icon: 'local_bar',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        fireLabel: 'FIRE DRINKS',
        prepVerb: 'POUR',
        prepIcon: 'local_bar',
        inPrepLabel: 'TO POUR',
      };
  }
};
