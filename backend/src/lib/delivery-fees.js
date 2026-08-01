export function normalizeDeliveryArea(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findDeliveryZone(zones, address) {
  const neighborhood = normalizeDeliveryArea(address?.neighborhood);
  const city = normalizeDeliveryArea(address?.city);
  const state = String(address?.state || '').trim().toUpperCase();
  if (!neighborhood) return null;

  return [...(zones || [])]
    .filter(zone => zone.active !== false && normalizeDeliveryArea(zone.neighborhood) === neighborhood)
    .filter(zone => !normalizeDeliveryArea(zone.city) || normalizeDeliveryArea(zone.city) === city)
    .filter(zone => !String(zone.state || '').trim() || String(zone.state).trim().toUpperCase() === state)
    .sort((left, right) => {
      const specificity = zone => Number(Boolean(normalizeDeliveryArea(zone.city))) + Number(Boolean(String(zone.state || '').trim()));
      return specificity(right) - specificity(left);
    })[0] || null;
}

export function calculateDeliveryFee({ store, zones, address, subtotal }) {
  const activeZones = (zones || []).filter(zone => zone.active !== false);
  const zone = findDeliveryZone(activeZones, address);

  if (activeZones.length > 0 && !zone) {
    return {
      available: false,
      fee: 0,
      source: 'OUTSIDE_DELIVERY_AREA',
      matchedNeighborhood: null,
      message: 'Infelizmente, não atendemos à sua localização.'
    };
  }

  const amount = Math.max(0, Number(subtotal) || 0);
  if (Number(store?.freeDeliveryAbove || 0) > 0 && amount >= Number(store.freeDeliveryAbove)) {
    return { available: true, fee: 0, source: 'FREE_DELIVERY', matchedNeighborhood: zone?.neighborhood || null };
  }

  if (zone) {
    return {
      available: true,
      fee: Number(Number(zone.fee || 0).toFixed(2)),
      source: 'NEIGHBORHOOD',
      matchedNeighborhood: zone.neighborhood
    };
  }

  return {
    available: true,
    fee: Number(Number(store?.deliveryFee || 0).toFixed(2)),
    source: 'DEFAULT',
    matchedNeighborhood: null
  };
}
