const STORE_HASH = process.env.BC_STORE_HASH;
const API_TOKEN = process.env.BC_API_TOKEN;
const CLIENT_ID = process.env.BC_CLIENT_ID;

const V3_BASE = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3`;
const V2_BASE = `https://api.bigcommerce.com/stores/${STORE_HASH}/v2`;

function authHeaders() {
  if (!STORE_HASH || !API_TOKEN || !CLIENT_ID) {
    throw new Error(
      'Missing BigCommerce credentials - check BC_STORE_HASH, BC_API_TOKEN, BC_CLIENT_ID env vars'
    );
  }
  return {
    'X-Auth-Token': API_TOKEN,
    'X-Auth-Client': CLIENT_ID,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function bcFetch(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BigCommerce API ${res.status} on ${path}: ${body}`);
  }
  if (res.status === 204) return null;

  return res.json();
}

const bcV3 = (path, options) => bcFetch(V3_BASE, path, options);
const bcV2 = (path, options) => bcFetch(V2_BASE, path, options);

async function getProductCustomField(productId, fieldName) {
  const data = await bcV3(
    `/catalog/products/${productId}/custom-fields?limit=250`
  );
  const field = (data?.data || []).find((f) => f.name === fieldName);
  return field ? field.value : null;
}

// Only these statuses are excluded from the customer's purchased total.
// Every other status (Pending, Awaiting Payment, Awaiting Fulfillment,
// Awaiting Shipment, Awaiting Pickup, Partially Shipped, Shipped, Completed,
// Manual Verification Required, Disputed) DOES count toward the limit.
const EXCLUDED_STATUS_IDS = new Set([
  5,  // Cancelled
  6,  // Declined
  4,  // Refunded
  14, // Partially Refunded
]);

async function getCustomerOrders(customerId) {
  let page = 1;
  const orders = [];

  while (true) {
    const batch = await bcV2(
      `/orders?customer_id=${customerId}&limit=250&page=${page}&sort=date_created:desc`
    );
    if (!batch || batch.length === 0) break;
    orders.push(...batch);
    if (batch.length < 250) break;
    page += 1;
  }

  return orders.filter((o) => !EXCLUDED_STATUS_IDS.has(Number(o.status_id)));
}

/**
 * Sums the quantity of a specific product across a list of orders.
 * This makes a call per order (V2 Orders API doesn't return line items inline),
 * so it's only used by the one-time backfill script - the live check-limit
 * endpoint reads from the customer metafield running total instead, which is O(1).
 */
async function sumProductQtyAcrossOrders(orders, productId) {
  let total = 0;

  for (const order of orders) {
    const products = await bcV2(`/orders/${order.id}/products?limit=250`);
    for (const line of products || []) {
      if (Number(line.product_id) === Number(productId)) {
        total += Number(line.quantity);
      }
    }
  }

  return total;
}

/** Fetches line items for a single order (used by the order-created webhook). */
async function getOrderProducts(orderId) {
  return bcV2(`/orders/${orderId}/products?limit=250`);
}

/** Fetches a single order's status (used by the order-updated webhook). */
async function getOrder(orderId) {
  return bcV2(`/orders/${orderId}`);
}

module.exports = {
  bcV3,
  bcV2,
  getProductCustomField,
  getCustomerOrders,
  sumProductQtyAcrossOrders,
  getOrderProducts,
  getOrder,
  EXCLUDED_STATUS_IDS,
};