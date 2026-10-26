// URLs públicas de los 5 sub-módulos de Delivery Management (las de las historias) →
// featureId real de Features.txt, que es lo que resuelve MerchantFrame.

export const DELIVERY_PATHS: Record<string, string> = {
  '/delivery/zones': 'delivery-zones',
  '/delivery/fees': 'delivery-fees',
  '/delivery/drivers': 'delivery-drivers',
  '/delivery/assignments': 'delivery-assignments',
  '/delivery/tracking': 'delivery-tracking',
};

// Una URL desconocida bajo /delivery cae en las zonas, la portada del épico.
export const featureIdForDeliveryPath = (path: string): string =>
  DELIVERY_PATHS[path.replace(/\/+$/, '')] ?? 'delivery-zones';
