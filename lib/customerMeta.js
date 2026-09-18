// Stores a running total of "confirmed-purchased quantity" per customer, per
// product — using BigCommerce Customer Metafields as the database. No Redis,
// no external service: this lives entirely inside BigCommerce.
//
// One metafield per (customer, product) pair:
//   namespace : "qty_limit"
//   key       : "product_<productId>"
//   value     : "<running total, as a string>"

const { bcV3 } = require('./bigcommerce');

const NAMESPACE = 'qty_limit';

const metafieldKey = (productId) => `product_${productId}`;

async function findMetafield(customerId, productId) {
  const data = await bcV3(
    `/customers/${customerId}/metafields?namespace=${NAMESPACE}&key=${metafieldKey(
      productId
    )}&limit=1`
  );
  const list = data?.data || [];
  return list[0] || null;
}

async function getPurchasedQty(customerId, productId) {
  const mf = await findMetafield(customerId, productId);
  if (!mf) return 0;
  const n = Number(mf.value);
  return Number.isFinite(n) ? n : 0;
}

async function adjustPurchasedQty(customerId, productId, delta) {
  if (!delta) return;

  const existing = await findMetafield(customerId, productId);
  const current = existing ? Number(existing.value) || 0 : 0;
  const next = Math.max(0, current + delta);

  if (existing) {
    await bcV3(`/customers/${customerId}/metafields/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ value: String(next) }),
    });
  } else {
    await bcV3(`/customers/${customerId}/metafields`, {
      method: 'POST',
      body: JSON.stringify({
        namespace: NAMESPACE,
        key: metafieldKey(productId),
        value: String(next),
        permission_set: 'app_only',
        description: 'Running total of confirmed purchase quantity (quantity-limit app)',
      }),
    });
  }
}

async function setPurchasedQty(customerId, productId, value) {
  const existing = await findMetafield(customerId, productId);
  const next = Math.max(0, Number(value) || 0);

  if (existing) {
    await bcV3(`/customers/${customerId}/metafields/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ value: String(next) }),
    });
  } else {
    await bcV3(`/customers/${customerId}/metafields`, {
      method: 'POST',
      body: JSON.stringify({
        namespace: NAMESPACE,
        key: metafieldKey(productId),
        value: String(next),
        permission_set: 'app_only',
        description: 'Running total of confirmed purchase quantity (quantity-limit app)',
      }),
    });
  }
}

module.exports = {
  getPurchasedQty,
  adjustPurchasedQty,
  setPurchasedQty,
  NAMESPACE,
};
