import type { Database } from './database.types';
type CM = Database['public']['Tables']['client_memberships']['Row'];
const _test: CM = { id: '1', client_id: '2', user_id: '3', invited_by: null, created_at: '' };
export {};
