export const E2E_API_BASE_URL = (
  process.env.E2E_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:3004"
).replace(/\/$/, "");

export const E2E_WS_BASE_URL = (
  process.env.E2E_WS_BASE_URL ||
  process.env.NEXT_PUBLIC_WS_BASE_URL ||
  "ws://127.0.0.1:3004"
).replace(/\/$/, "");
