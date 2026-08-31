// Build-time selection: Sites -> Cloudflare; self-hosted API -> native SQLite/files.
export { getRawDb, getFilesBucket, isDemoSeedEnabled } from '@runtime/storage';
