// ============================================================
// TypeScript-Typen für alle Datenbanktabellen
// Entspricht exakt dem Schema in 001_initial_schema.sql
// ============================================================

export type VatRate = 0 | 10 | 13 | 20;
export type TransactionType = 'income' | 'expense';
export type UserRole = 'admin' | 'kanzlei' | 'klient';
export type TaxReturnStatus = 'draft' | 'signed' | 'submitted';
export type RecurringInterval = 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
export type TenantPlan = 'starter' | 'standard' | 'professional' | 'enterprise';
export type VatPeriod = 'monthly' | 'quarterly';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  max_clients: number;
  active_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  language: 'de' | 'en';
  last_login: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  user_id: string;
  company_name: string;
  uid_number: string | null;
  vat_liable: boolean;
  vat_period: VatPeriod;
  fiscal_year_start: number;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  tenant_id: string | null;
  name: string;
  type: TransactionType;
  vat_rate: VatRate;
  konto_nr: string | null;
  is_system: boolean;
  sort_order: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  client_id: string;
  category_id: string;
  recurring_id: string | null;
  type: TransactionType;
  amount_net: number;
  vat_rate: VatRate;
  vat_amount: number;
  amount_gross: number;           // generated always
  booking_date: string;
  description: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  // Joins (optional)
  category?: Category;
}

export interface RecurringTransaction {
  id: string;
  client_id: string;
  category_id: string;
  name: string;
  type: TransactionType;
  amount_net: number;
  vat_rate: VatRate;
  interval: RecurringInterval;
  day_of_month: number;
  next_run_date: string;
  is_active: boolean;
  created_at: string;
  // Joins (optional)
  category?: Category;
}

export interface TaxReturn {
  id: string;
  client_id: string;
  period_year: number;
  period_month: number;
  tax_base_20: number;
  tax_base_13: number;
  tax_base_10: number;
  tax_base_0: number;
  vat_20: number;
  vat_13: number;
  vat_10: number;
  input_tax: number;
  vat_payable: number;
  status: TaxReturnStatus;
  signed_at: string | null;
  submitted_at: string | null;
  fo_reference_nr: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  transaction_id: string;
  client_id: string;
  uploaded_by: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

// Datenbanktyp für Supabase-Client (wird von createClient<Database> genutzt)
export type Database = {
  public: {
    Tables: {
      tenants: { Row: Tenant; Insert: Omit<Tenant, 'id'|'created_at'|'updated_at'>; Update: Partial<Tenant> };
      users: { Row: User; Insert: Omit<User, 'id'|'created_at'>; Update: Partial<User> };
      clients: { Row: Client; Insert: Omit<Client, 'id'|'created_at'>; Update: Partial<Client> };
      categories: { Row: Category; Insert: Omit<Category, 'id'|'created_at'>; Update: Partial<Category> };
      transactions: { Row: Transaction; Insert: Omit<Transaction, 'id'|'amount_gross'|'created_at'|'updated_at'>; Update: Partial<Transaction> };
      recurring_transactions: { Row: RecurringTransaction; Insert: Omit<RecurringTransaction, 'id'|'created_at'>; Update: Partial<RecurringTransaction> };
      tax_returns: { Row: TaxReturn; Insert: Omit<TaxReturn, 'id'|'created_at'|'updated_at'>; Update: Partial<TaxReturn> };
      attachments: { Row: Attachment; Insert: Omit<Attachment, 'id'|'uploaded_at'>; Update: Partial<Attachment> };
    };
  };
};
