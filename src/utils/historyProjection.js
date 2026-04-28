export function createSyncRequestToken(prefix = 'sync') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
}
