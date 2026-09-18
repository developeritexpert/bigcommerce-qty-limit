const { getProductCustomField } = require('./bigcommerce');

const FIELD_NAME = 'max_qty_per_customer';

async function getProductLimit(productId) {
  const raw = await getProductCustomField(productId, FIELD_NAME);
  const limit = raw === null || raw === '' ? null : parseInt(raw, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

module.exports = { getProductLimit, FIELD_NAME };
