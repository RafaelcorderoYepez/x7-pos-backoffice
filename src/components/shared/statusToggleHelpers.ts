export function normalizeStatus(status: string): 'active' | 'inactive' {
  return status === 'active' ? 'active' : 'inactive';
}
