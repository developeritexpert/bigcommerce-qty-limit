const { getOrderProducts, getOrder, EXCLUDED_STATUS_IDS } = require('../../lib/bigcommerce');
const { getProductLimit } = require('../../lib/limits');
const { adjustPurchasedQty } = require('../../lib/customerMeta');

const SHARED_SECRET = process.env.WEBHOOK_SHARED_SECRET;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  if (!SHARED_SECRET || req.query.secret !== SHARED_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const orderId = req.body?.data?.id;
    if (!orderId) {
      res.status(400).json({ error: 'Missing order id in payload' });
      return;
    }

    const order = await getOrder(orderId);
    const isNowExcluded = EXCLUDED_STATUS_IDS.has(Number(order.status_id));

    if (!isNowExcluded) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }

    const customerId = order.customer_id;
    const lineItems = await getOrderProducts(orderId);

    for (const item of lineItems || []) {
      const productId = Number(item.product_id);
      const limit = await getProductLimit(productId);
      if (limit === null) continue;

      await adjustPurchasedQty(customerId, productId, -Number(item.quantity));
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('order-updated webhook error:', err);
    res.status(200).json({ ok: false, error: 'logged' });
  }
};
