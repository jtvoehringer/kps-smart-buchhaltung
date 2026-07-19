// ============================================================
// TypeScript-Typen für alle Datenbanktabellen
// Entspricht dem aktuellen Schema inkl. aller Migrationen 001–011
// ============================================================

export type VatRate = 0 | 10 | 13 | 20;
export type TransactionType = 'income' | 'expense';
export type UserRole = 'admin' | 'kanzlei' | 'klient' | 'superadmin';
export type TaxReturnStatus = 'draft' | 'signed' | 'submitted';
export type RecurringInterval = 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
export type TenantPlan = 'starter' | 'standard' | 'professional' | 'enterprise';
export type VatPeriod = 'monthly' | 'quarterly';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'cancelled';
export type ReceiptStatus = 'pending' | 'processing' | 'processed' | 'booked' | 'error';

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
  booking_mode: string;           // 'netto' | 'brutto' – Migration via Supabase Dashboard
  attachments_enabled: boolean;   // Migration 003
  modules_enabled: string[];      // Migration 010: z.B. ['invoicing']
  is_active: boolean;
  created_at: string;
}

export interface ClientMembership {
  id: string;
  client_id: string;
  user_id: string;
  invited_by: string | null;
  created_at: string;
}

export interface ClientBranding {
  client_id: string;
  logo_url: string | null;
  brand_color: string;
  company_street: string | null;
  company_zip: string | null;
  company_city: string | null;
  company_country: string;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  invoice_prefix: string;
  invoice_next_nr: number;
  invoice_nr_digits: number;
  payment_days: number;
  invoice_footer: string | null;
  updated_at: string;
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
  amount_gross: number;
  booking_date: string;
  description: string | null;
  is_locked: boolean;
  import_source: string | null;
  import_batch_id: string | null;
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
  file_size: number;
  uploaded_at: string;
}

export interface Customer {
  id: string;
  client_id: string;
  name: string;
  company_name: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  uid_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  amount_net: number;
  amount_vat: number;
  amount_gross: number;
}

export interface Invoice {
  id: string;
  client_id: string;
  customer_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  total_net: number;
  total_vat: number;
  total_gross: number;
  paid_date: string | null;
  transaction_id: string | null;
  notes: string | null;
  footer_override: string | null;
  created_at: string;
  updated_at: string;
  // Joins (optional)
  customers?: Pick<Customer, 'id' | 'name' | 'company_name'> | null;
}

export interface Receipt {
  id: string;
  client_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number | null;
  status: ReceiptStatus;
  ocr_data: Record<string, unknown> | null;
  ocr_error: string | null;
  transaction_id: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

// Datenbanktyp für Supabase-Client (wird von createClient<Database> genutzt)
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: Tenant;
        Insert: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Tenant>;
      };
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at'>;
        Update: Partial<User>;
      };
      clients: {
        Row: Client;
        Insert: Omit<Client, 'id' | 'created_at'>;
        Update: Partial<Client>;
      };
      client_memberships: {
        Row: ClientMembership;
        Insert: Omit<ClientMembership, 'id' | 'created_at'>;
        Update: Partial<ClientMembership>;
      };
      client_branding: {
        Row: ClientBranding;
        Insert: Omit<ClientBranding, 'updated_at'>;
        Update: Partial<ClientBranding>;
      };
      categories: {
        Row: Category;
        Insert: Omit<Category, 'id' | 'created_at'>;
        Update: Partial<Category>;
      };
      transactions: {
        Row: Transaction;
        Insert: Omit<Transaction, 'id' | 'amount_gross' | 'created_at' | 'updated_at'>;
        Update: Partial<Transaction>;
      };
      recurring_transactions: {
        Row: RecurringTransaction;
        Insert: Omit<RecurringTransaction, 'id' | 'created_at'>;
        Update: Partial<RecurringTransaction>;
      };
      tax_returns: {
        Row: TaxReturn;
        Insert: Omit<TaxReturn, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<TaxReturn>;
      };
      attachments: {
        Row: Attachment;
        Insert: Omit<Attachment, 'id' | 'uploaded_at'>;
        Update: Partial<Attachment>;
      };
      customers: {
        Row: Customer;
        Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Customer>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Invoice>;
      };
      receipts: {
        Row: Receipt;
        Insert: Omit<Receipt, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Receipt>;
      };
    };
  };
};
