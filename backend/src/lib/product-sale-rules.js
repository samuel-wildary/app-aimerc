export function resolveProductSaleRule(row) {
  const sourceUnit = String(row.unit || 'UN').toUpperCase();
  const requestedSaleMode = String(row.sale_mode || 'AUTO').toUpperCase();
  const saleMode = ['UNIT', 'WEIGHT'].includes(requestedSaleMode) ? requestedSaleMode : 'AUTO';
  // The ERP unit is authoritative: text such as "embalagem de 1 kg" must not
  // turn an industrialized unit product into a loose-weight product.
  const soldByWeight = sourceUnit === 'KG' && saleMode !== 'UNIT';
  const configuredStep = Number(row.quantity_step);
  const quantityStep = soldByWeight && Number.isFinite(configuredStep) && configuredStep > 0
    ? configuredStep
    : (soldByWeight ? 0.1 : 1);

  return {
    sourceUnit,
    saleMode,
    soldByWeight,
    quantityStep,
    unit: soldByWeight ? 'KG' : (saleMode === 'UNIT' ? 'UN' : sourceUnit),
  };
}
