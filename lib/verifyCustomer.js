const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT that BigCommerce itself issues for the logged-in storefront
 * customer (fetched client-side from /customer/current.jwt?app_client_id=...).
 *
 * We never accept a customer ID sent plainly from the browser (that could be
 * edited in devtools). The JWT is signed by BigCommerce using your API
 * account's client secret, so only BigCommerce could have produced a valid one.
 *
 * Throws if the token is missing, expired, or invalid.
 * Returns { customerId, email } if valid, or null if the shopper is a guest.
 */
function verifyCustomerJwt(token) {
  if (!token) return null; // guest shopper - handled by caller

  const secret = process.env.BC_JWT_CLIENT_SECRET;
  if (!secret) {
    throw new Error('Missing BC_JWT_CLIENT_SECRET env var');
  }

  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });

  if (!decoded?.customer?.id) {
    throw new Error('JWT verified but did not contain a customer id');
  }

  return {
    customerId: Number(decoded.customer.id),
    email: decoded.customer.email || null,
  };
}

module.exports = { verifyCustomerJwt };
