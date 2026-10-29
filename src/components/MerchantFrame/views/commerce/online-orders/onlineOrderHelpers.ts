export const isOnlineOrderEditable = (
  order?: { fulfillmentStatus?: string } | null
): boolean => {
  if (!order || !order.fulfillmentStatus) return false;
  return order.fulfillmentStatus === 'received' || order.fulfillmentStatus === 'accepted';
};

