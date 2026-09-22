const { verifyCustomerJwt } = require('../lib/verifyCustomer');
const { getProductLimit } = require('../lib/limits');
const { getPurchasedQty } = require('../lib/customerMeta');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN || '');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * POST /api/check-limit
 * body: { jwt: string|null, productId: number, requestedQty: number }
 * Returns: { allowed: boolean, limit: number|null, alreadyOwned: number, message?: string }
 */
module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { jwt: customerJwt, productId, requestedQty } = req.body || {};

    if (!productId || !Number.isFinite(Number(requestedQty))) {
      res.status(400).json({ error: 'productId and requestedQty are required' });
      return;
    }

    const limit = await getProductLimit(productId);

    if (limit === null) {
      res.status(200).json({ allowed: true, limit: null, alreadyOwned: 0 });
      return;
    }

    let customer;
    try {
      customer = verifyCustomerJwt(customerJwt);
    } catch (err) {
      console.error('JWT verification failed:', err.message);
      res.status(200).json({
        allowed: false,
        limit,
        alreadyOwned: 0,
        message: 'Please log in to purchase this product.',
      });
      return;
    }

    if (!customer) {
      res.status(200).json({
        allowed: false,
        limit,
        alreadyOwned: 0,
        message: 'Please log in to purchase this product.',
      });
      return;
    }

    const alreadyOwned = await getPurchasedQty(customer.customerId, productId);
    const wouldOwn = alreadyOwned + Number(requestedQty);
    const allowed = wouldOwn <= limit;

    res.status(200).json({
      allowed,
      limit,
      alreadyOwned,
      message: allowed
        ? undefined
        : `You've reached the maximum allowed quantity (${limit}) for this product.`,
    });
  } catch (err) {
    console.error('check-limit error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
};