// Clases y pasos compartidos por el editor de planos y sus paneles.

export const inputClass =
  'w-full bg-[#fef9f1] text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none';
export const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider';

// Step size for coordinate inputs. In px it was 10 (grid); in meters or feet that
// same 10 would be a 10m leap, so it is refined to hundredths — matching the
// precision returned by `lengthValue` and preventing browser stepMismatch.
export const COORD_STEP = 0.01;
