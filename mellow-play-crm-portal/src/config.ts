export const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8787'

// Always the real production consumer app domain, regardless of which
// environment the CRM itself is running in — copy-link buttons need the
// actual link a customer would click, not whatever dev/preview URL happens
// to be running locally.
export const CONSUMER_APP_URL = 'https://mellowplay.co'
