const { bcV3, bcV2, getCustomerOrders, sumProductQtyAcrossOrders } = require('../lib/bigcommerce');
const { getProductLimit, FIELD_NAME } = require('../lib/limits');
const { setPurchasedQty } = require('../lib/customerMeta');

async function getAllRestrictedProductIds() {
  const restricted = [];
  let page = 1;

  while (true) {
    const res = await bcV3(`/catalog/products?limit=250&page=${page}&include_fields=id,name`);
    const products = res?.data || [];
    if (products.length === 0) break;

    for (const p of products) {
      const limit = await getProductLimit(p.id);
      if (limit !== null) restricted.push({ id: p.id, name: p.name, limit });
    }

    if (products.length < 250) break;
    page += 1;
  }

  return restricted;
}

async function getAllCustomerIdsWhoOrdered() {
  const customerIds = new Set();
  let page = 1;

  while (true) {
    const orders = await bcV3(`/orders?limit=250&page=${page}`).catch(() => null);
    const batch = orders?.data || (await bcV2(`/orders?limit=250&page=${page}`));
    if (!batch || batch.length === 0) break;

    for (const order of batch) {
      customerIds.add(order.customer_id);
    }

    if (batch.length < 250) break;
    page += 1;
  }

  return [...customerIds].filter((id) => id && id !== 0);
}

async function run() {
  console.log('Finding restricted products (custom field: %s)...', FIELD_NAME);
  const restrictedProducts = await getAllRestrictedProductIds();
  console.log(`Found ${restrictedProducts.length} restricted product(s).`);

  if (restrictedProducts.length === 0) {
    console.log('Nothing to backfill. Set the custom field on at least one product first.');
    return;
  }

  console.log('Scanning all orders to find which customers to check (one-time cost)...');
  const customerIds = await getAllCustomerIdsWhoOrdered();
  console.log(`Found ${customerIds.length} customers with at least one order.`);

  let processed = 0;

  for (const customerId of customerIds) {
    const orders = await getCustomerOrders(customerId);
    if (orders.length === 0) continue;

    for (const product of restrictedProducts) {
      const qty = await sumProductQtyAcrossOrders(orders, product.id);
      if (qty > 0) {
        await setPurchasedQty(customerId, product.id, qty);
        console.log(
          `  customer ${customerId} -> product ${product.id} (${product.name}): ${qty}`
        );
      }
    }

    processed += 1;
    if (processed % 25 === 0) {
      console.log(`Progress: ${processed}/${customerIds.length} customers checked`);
    }
  }

  console.log('Backfill complete.');
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
 