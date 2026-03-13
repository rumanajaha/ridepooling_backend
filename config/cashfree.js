import dotenv from 'dotenv';
dotenv.config();

const ENV = (process.env.CASHFREE_ENV || 'sandbox').toLowerCase();

export const CASHFREE = {
  env: ENV,
  appId: process.env.CASHFREE_APP_ID,
  secretKey: process.env.CASHFREE_SECRET_KEY,
  webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET_KEY,
  baseUrl: ENV === 'production' || ENV === 'live'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg',
  apiVersion: '2022-09-01',
};

// Validate credentials on startup
if (!CASHFREE.appId || !CASHFREE.secretKey) {
  console.warn('⚠️ CASHFREE_APP_ID or CASHFREE_SECRET_KEY not set in .env');
} else {
  console.log(`✅ Cashfree configured for ${CASHFREE.env} mode`);
}

export function getAuthHeaders() {
  return {
    'x-client-id': CASHFREE.appId,
    'x-client-secret': CASHFREE.secretKey,
    'x-api-version': CASHFREE.apiVersion,
    'Content-Type': 'application/json',
  };
}
