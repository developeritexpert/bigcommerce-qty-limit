curl -X POST "https://api.bigcommerce.com/stores/YOUR_STORE_HASH/v3/hooks" \
  -H "X-Auth-Token: YOUR_BC_API_TOKEN" \
  -H "X-Auth-Client: YOUR_BC_CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "store/order/created",
    "destination": "https://YOUR-PROJECT.vercel.app/api/webhooks/order-created?secret=YOUR_WEBHOOK_SHARED_SECRET",
    "is_active": true
  }'

curl -X POST "https://api.bigcommerce.com/stores/YOUR_STORE_HASH/v3/hooks" \
  -H "X-Auth-Token: YOUR_BC_API_TOKEN" \
  -H "X-Auth-Client: YOUR_BC_CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "store/order/statusUpdated",
    "destination": "https://YOUR-PROJECT.vercel.app/api/webhooks/order-updated?secret=YOUR_WEBHOOK_SHARED_SECRET",
    "is_active": true
  }'