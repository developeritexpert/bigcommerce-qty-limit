require('dotenv').config({ path: '.env.local' });
const jwt = require('jsonwebtoken');

const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/test-jwt.js "<paste JWT here>"');
  process.exit(1);
}

const secret = process.env.BC_JWT_CLIENT_SECRET;
console.log('Secret loaded, length:', secret ? secret.length : 'MISSING');
console.log(
  'Secret (first/last 4 chars):',
  secret ? secret.slice(0, 4) + '...' + secret.slice(-4) : 'N/A'
);

try {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256', 'HS512'] });
  console.log('VERIFIED OK');
  console.log(decoded);
} catch (err) {
  console.log('FAILED:', err.name, '-', err.message);
}