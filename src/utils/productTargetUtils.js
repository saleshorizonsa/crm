export const PRODUCT_TARGET_TYPE = "by_products";
export const LEGACY_PRODUCT_GROUP_TARGET_TYPE = "by_product_group";

export const normalizeTargetType = (targetType) => {
  if (targetType === LEGACY_PRODUCT_GROUP_TARGET_TYPE) return PRODUCT_TARGET_TYPE;
  return targetType || "total_value";
};

export const getSelectedProductTargets = (productTargets = []) =>
  productTargets.filter((target) => {
    if (!target.enabled) return false;
    const quantity = parseFloat(target.target_quantity || 0);
    const value = parseFloat(target.target_value || 0);
    return quantity > 0 || value > 0;
  });

export const calculateProductTargetValue = (productTargets = []) =>
  getSelectedProductTargets(productTargets).reduce(
    (sum, target) => sum + (parseFloat(target.target_value || 0) || 0),
    0,
  );

/**
 * The value of the target row CURRENTLY BEING ENTERED, whichever of the three
 * types the form is on.
 *
 * For the live annual-allocation preview, which needs the figure during render.
 * The three submit handlers compute the same thing inline, interleaved with
 * their own validation and error messages; those are left alone deliberately —
 * this is a read for display and must never report a validation failure.
 */
export const enteredTargetTotal = ({
  targetType,
  targetAmount = 0,
  clientTargets = [],
  productTargets = [],
}) => {
  const type = normalizeTargetType(targetType);
  if (type === "by_clients") {
    return clientTargets
      .filter((ct) => ct.enabled && parseFloat(ct.target_amount) > 0)
      .reduce((sum, ct) => sum + (parseFloat(ct.target_amount) || 0), 0);
  }
  if (type === PRODUCT_TARGET_TYPE) return calculateProductTargetValue(productTargets);
  return parseFloat(targetAmount) || 0;
};

export const validateProductTargets = (productTargets = []) => {
  const selected = productTargets.filter((target) => target.enabled);

  if (selected.length === 0) {
    return "Please select at least one product";
  }

  const invalid = selected.find((target) => {
    const quantity = parseFloat(target.target_quantity || 0);
    const value = parseFloat(target.target_value || 0);
    return quantity <= 0 && value <= 0;
  });

  if (invalid) {
    const productName =
      invalid.product?.material || invalid.material || "selected product";
    return `Please enter quantity or value for ${productName}`;
  }

  return null;
};

export const toProductTargetRows = (productTargets = []) =>
  getSelectedProductTargets(productTargets).map((target) => ({
    product_id: target.product_id,
    target_quantity:
      parseFloat(target.target_quantity || 0) > 0
        ? parseFloat(target.target_quantity)
        : null,
    target_value:
      parseFloat(target.target_value || 0) > 0
        ? parseFloat(target.target_value)
        : null,
    unit_price:
      parseFloat(target.unit_price || 0) > 0 ? parseFloat(target.unit_price) : null,
  }));

export const aggregateProductPerformance = (productTargets = []) => {
  const byProduct = new Map();

  (productTargets || []).forEach((target) => {
    const productId = target.product_id;
    if (!productId) return;

    const existing =
      byProduct.get(productId) || {
        product_id: productId,
        product: target.product,
        target_quantity: 0,
        target_value: 0,
        achieved_quantity: 0,
        achieved_value: 0,
      };

    existing.target_quantity += parseFloat(target.target_quantity || 0);
    existing.target_value += parseFloat(target.target_value || 0);
    existing.achieved_quantity += parseFloat(target.achieved_quantity || 0);
    existing.achieved_value += parseFloat(target.achieved_value || 0);

    byProduct.set(productId, existing);
  });

  return Array.from(byProduct.values()).map((item) => ({
    ...item,
    quantity_progress:
      item.target_quantity > 0
        ? (item.achieved_quantity / item.target_quantity) * 100
        : null,
    value_progress:
      item.target_value > 0 ? (item.achieved_value / item.target_value) * 100 : null,
  }));
};
