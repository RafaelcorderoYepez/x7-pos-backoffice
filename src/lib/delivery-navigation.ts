// Public URLs of the 5 Delivery Management sub-modules (those of the stories) →
// Actual featureId from Features.txt, which is what MerchantFrame resolves.

export const DELIVERY_PATHS: Record<string, string> = {
  '/delivery/zones': 'delivery-zones',
  '/delivery/fees': 'delivery-fees',
  '/delivery/drivers': 'delivery-drivers',
  '/delivery/assignments': 'delivery-assignments',
  '/delivery/tracking': 'delivery-tracking',
};

// An unknown URL under /delivery falls into the zones, the cover of the epic.
export const featureIdForDeliveryPath = (path: string): string =>
  DELIVERY_PATHS[path.replace(/\/+$/, '')] ?? 'delivery-zones';
