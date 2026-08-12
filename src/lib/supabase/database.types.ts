// ============================================================
// TypeScript-Typen für alle Datenbanktabellen
// Entspricht dem aktuellen Schema inkl. aller Migrationen 001–016
// ============================================================

export type VatRate = 0 | 10 | 13 | 20;
export type TransactionType = 'income' | 'expense';
export type UserRole = 'admin' | 'kanzlei' | 'klient' | 'superadmin';
export type TaxReturnStatus = 'draft' | 'signed' | 'submitted';
export type RecurringInterval = 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
export type TenantPlan = 'starter' | 'standard' | 'professional' | 'enterprise';
export type VatPeriod = 'monthly' | 'quarterly';
export type UstStatus = 'kleinunternehmer' | 'regelbesteuerung';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'cancelled';
export type IncomingInvoiceStatus = 'open' | 'paid' | 'cancelled';
export type ReceiptStatus = 'pending' | 'processing' | 'processed' | 'booked' | 'error';
export type AccountType = 'kontokorrent' | 'kreditkarte' | 'kreditkonto';

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  max_clients: number;
  active_until: string | null;
  created_at: string;
  updated_at: string;
};

export type User = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  language: 'de' | 'en';
  last_login: string | null;
  is_active: boolean;
  created_at: string;
};

export type Client = {
  id: string;
  tenant_id: string;
  user_id: string;
  company_name: string;
  uid_number: string | null;
  vat_liable: boolean;
  vat_period: VatPeriod;
  fiscal_year_start: number;
  booking_mode: string;           // 'netto' | 'brutto' – Migration via Supabase Dashboard
  modules_enabled: string[];      // Migration 010: z.B. ['invoicing'] (seit Migration 015 informativ, App prüft nicht mehr darauf)
  ust_status: UstStatus;          // Migration 015
  regelbesteuerung_optiert: boolean;          // Migration 015
  regelbesteuerung_options_jahr: number | null;  // Migration 015
  regelbesteuerung_bindung_bis: number | null;   // Migration 015
  is_active: boolean;
  created_at: string;
};

export type ClientMembership = {
  id: string;
  client_id: string;
  user_id: string;
  invited_by: string | null;
  created_at: string;
};

export type ClientBranding = {
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
  /** Migration 022: Suffix mit Platzhaltern {JJ} / {JJJJ}, z.B. "/{JJ}" -> RE-001/26 */
  invoice_suffix: string;
  payment_days: number;
  /** @deprecated Migration 027 – ersetzt durch die drei Spalten unten */
  /** Freitext linke Fußzeilenspalte (Migration 027) */
  invoice_footer_left: string | null;
  /** Freitext mittlere Fußzeilenspalte (Migration 027) */
  invoice_footer_center: string | null;
  /** Freitext rechte Fußzeilenspalte (Migration 027) */
  invoice_footer_right: string | null;
  /** Firmenname und Adresse im Rechnungskopf zeigen (Migration 028) */
  show_sender_in_header: boolean;
  updated_at: string;
};

export type EmailLog = {
  id: string;
  client_id: string;
  user_id: string | null;
  zweck: string;
  empfaenger: string;
  created_at: string;
};

export type Category = {
  id: string;
  tenant_id: string | null;
  name: string;
  type: TransactionType;
  vat_rate: VatRate;
  konto_nr: string | null;
  is_system: boolean;
  sort_order: number;
  created_at: string;
};

export type Transaction = {
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
  bank_ref: string | null;         // Migration 008: AcctSvcrRef aus CAMT.053-Import
  account_id: string | null;       // Migration 016
  is_private: boolean;             // Migration 016
  is_reconciled: boolean;          // Migration 016
  bewirtung_anlass: string | null;      // Migration 017
  bewirtung_teilnehmer: string | null;  // Migration 017
  reise_typ: string | null;             // Migration 018
  reise_ziel: string | null;            // Migration 018
  reise_zweck: string | null;           // Migration 018
  reise_von: string | null;             // Migration 018
  reise_bis: string | null;             // Migration 018
  reise_km: number | null;              // Migration 018
  reise_stunden: number | null;         // Migration 018
  is_eauto: boolean;                    // Migration 024
  ust_kennzeichen: string;              // Migration 029
  beleg_jahr: number | null;            // Migration 030
  beleg_nr: number | null;              // Migration 030
  created_at: string;
  updated_at: string;
  // Joins (optional)
  category?: Category;
};

export type RecurringTransaction = {
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
};

export type TaxReturn = {
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
};

export type Attachment = {
  id: string;
  transaction_id: string;
  client_id: string;
  uploaded_by: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
};

export type Customer = {
  id: string;
  client_id: string;
  /** Bezeichnung: Firmenwortlaut oder Vor- und Nachname. Rechnungsempfänger. */
  name: string;
  /** Ansprechpartner, z.B. "Fr. Maria Muster" (Migration 023) */
  contact_person: string | null;
  /** Zahlungsziel in Tagen, 0 = zahlbar bei Erhalt (Migration 025) */
  payment_days: number;
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
};

export type Supplier = {
  id: string;
  client_id: string;
  /** Bezeichnung: Firmenwortlaut oder Vor- und Nachname. */
  name: string;
  /** Ansprechpartner (Migration 023) */
  contact_person: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  uid_number: string | null;
  iban: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  amount_net: number;
  amount_vat: number;
  amount_gross: number;
  // Leistungsnachweis pro Position (Rechnungslayout)
  berater?: string;
  leistung_von?: string | null;
  leistung_bis?: string | null;
};

export type Invoice = {
  id: string;
  client_id: string;
  customer_id: string | null;
  invoice_number: string | null;   // Migration 021: NULL solange Entwurf
  contact_person: string | null;   // Migration 025: "z.H." je Rechnung
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
  sent_at: string | null;
  sent_to: string | null;
  created_at: string;
  updated_at: string;
  // Joins (optional)
  customers?: Pick<Customer, 'id' | 'name' | 'contact_person'> | null;
};

export type InvoiceAttachment = {
  id: string;
  client_id: string;
  invoice_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

export type IncomingInvoice = {
  id: string;
  client_id: string;
  category_id: string | null;
  supplier_id: string | null;
  vendor_name: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string;
  amount_net: number;
  vat_rate: VatRate;
  vat_amount: number;
  amount_gross: number;
  status: IncomingInvoiceStatus;
  paid_date: string | null;
  transaction_id: string | null;
  beleg_storage_path: string | null;
  beleg_file_name: string | null;
  beleg_mime_type: string | null;
  beleg_file_size: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BankImport = {
  id: string;
  client_id: string;
  imported_by: string | null;
  file_name: string;
  file_type: 'camt053' | 'csv';
  iban: string | null;
  tx_total: number;
  tx_imported: number;
  account_id: string | null;   // Migration 016
  imported_at: string;
};

export type Receipt = {
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
};

export type Account = {
  id: string;
  client_id: string;
  name: string;
  type: AccountType;
  iban: string | null;
  note: string | null;
  is_active: boolean;
  opening_balance: number;      // Migration 034
  opening_date: string | null;  // Migration 034
  created_at: string;
  updated_at: string;
};

export type BankLearningRule = {
  id: string;
  client_id: string;
  counterpart_pattern: string;
  category_id: string | null;
  is_private: boolean;
  hit_count: number;
  updated_at: string;
};

export type MonthClosure = {
  id: string;
  client_id: string;
  period_year: number;
  period_month: number;
  closed_at: string;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
};

// ============================================================
// Datenbanktyp für Supabase-Client (wird von createClient<Database> genutzt)
//
// Hinweise:
// - "Relationships: []" ist bei jeder Tabelle Pflicht, damit dieser (von Hand
//   gepflegte) Typ mit dem von @supabase/postgrest-js erwarteten GenericTable-
//   Typ kompatibel bleibt. Ebenso müssen "Views" und "Functions" auf Schema-
//   Ebene vorhanden sein (auch wenn ungenutzt) – sonst fällt der gesamte
//   Schema-Typ beim Build auf "never" zurück und alle .insert()/.update()-
//   Aufrufe schlagen mit "does not exist in type 'never[]'" fehl.
// - Die "Insert"-Typen sind bewusst NICHT per Omit<Row,...> aus den Row-Typen
//   abgeleitet: Row-Felder mit Datenbank-DEFAULT oder NULL-Erlaubnis sind hier
//   explizit optional ("?"), damit .insert({...}) nur die tatsächlich
//   pflichtigen Spalten (siehe supabase/migrations/*.sql) verlangt.
// ============================================================
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: Tenant;
        Insert: {
          name: string;
          slug: string;
          plan?: TenantPlan;
          max_clients?: number;
          active_until?: string | null;
        };
        Update: Partial<Tenant>;
        Relationships: [];
      };
      users: {
        Row: User;
        Insert: {
          id?: string; // entspricht i.d.R. auth.users.id, wird beim Einladen explizit gesetzt
          tenant_id: string;
          email: string;
          full_name?: string | null;
          role?: UserRole;
          language?: 'de' | 'en';
          last_login?: string | null;
          is_active?: boolean;
        };
        Update: Partial<User>;
        Relationships: [];
      };
      clients: {
        Row: Client;
        Insert: {
          tenant_id: string;
          user_id: string;
          company_name: string;
          uid_number?: string | null;
          vat_liable?: boolean;
          vat_period?: VatPeriod;
          fiscal_year_start?: number;
          booking_mode?: string;
          modules_enabled?: string[];
          ust_status?: UstStatus;
          regelbesteuerung_optiert?: boolean;
          regelbesteuerung_options_jahr?: number | null;
          regelbesteuerung_bindung_bis?: number | null;
          is_active?: boolean;
        };
        Update: Partial<Client>;
        Relationships: [];
      };
      client_memberships: {
        Row: ClientMembership;
        Insert: {
          client_id: string;
          user_id: string;
          invited_by?: string | null;
        };
        Update: Partial<ClientMembership>;
        Relationships: [];
      };
      client_branding: {
        Row: ClientBranding;
        Insert: {
          client_id: string;
          logo_url?: string | null;
          brand_color?: string;
          company_street?: string | null;
          company_zip?: string | null;
          company_city?: string | null;
          company_country?: string;
          company_phone?: string | null;
          company_email?: string | null;
          company_website?: string | null;
          iban?: string | null;
          bic?: string | null;
          bank_name?: string | null;
          invoice_prefix?: string;
          invoice_next_nr?: number;
          invoice_nr_digits?: number;
          invoice_suffix?: string;
          payment_days?: number;
          invoice_footer_left?: string | null;
          invoice_footer_center?: string | null;
          invoice_footer_right?: string | null;
          show_sender_in_header?: boolean;
        };
        Update: Partial<ClientBranding>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: {
          tenant_id?: string | null;
          name: string;
          type: TransactionType;
          vat_rate?: VatRate;
          konto_nr?: string | null;
          is_system?: boolean;
          sort_order?: number;
        };
        Update: Partial<Category>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          client_id: string;
          category_id: string;
          recurring_id?: string | null;
          type: TransactionType;
          amount_net: number;
          vat_rate?: VatRate;
          vat_amount?: number;
          booking_date: string;
          description?: string | null;
          is_locked?: boolean;
          import_source?: string | null;
          import_batch_id?: string | null;
          bank_ref?: string | null;
          account_id?: string | null;
          is_private?: boolean;
          is_reconciled?: boolean;
          bewirtung_anlass?: string | null;
          bewirtung_teilnehmer?: string | null;
          reise_typ?: string | null;
          reise_ziel?: string | null;
          reise_zweck?: string | null;
          reise_von?: string | null;
          reise_bis?: string | null;
          reise_km?: number | null;
          reise_stunden?: number | null;
          is_eauto?: boolean;
          ust_kennzeichen?: string;
          beleg_jahr?: number | null;
          beleg_nr?: number | null;
        };
        Update: Partial<Transaction>;
        Relationships: [
          {
            foreignKeyName: 'fk_transactions_category';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      recurring_transactions: {
        Row: RecurringTransaction;
        Insert: {
          client_id: string;
          category_id: string;
          name: string;
          type: TransactionType;
          amount_net: number;
          vat_rate?: VatRate;
          interval?: RecurringInterval;
          day_of_month?: number;
          next_run_date: string;
          is_active?: boolean;
        };
        Update: Partial<RecurringTransaction>;
        Relationships: [
          {
            foreignKeyName: 'fk_recurring_category';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      tax_returns: {
        Row: TaxReturn;
        Insert: {
          client_id: string;
          period_year: number;
          period_month: number;
          tax_base_20?: number;
          tax_base_13?: number;
          tax_base_10?: number;
          tax_base_0?: number;
          vat_20?: number;
          vat_13?: number;
          vat_10?: number;
          input_tax?: number;
          vat_payable?: number;
          status?: TaxReturnStatus;
          signed_at?: string | null;
          submitted_at?: string | null;
          fo_reference_nr?: string | null;
          notes?: string | null;
        };
        Update: Partial<TaxReturn>;
        Relationships: [];
      };
      attachments: {
        Row: Attachment;
        Insert: {
          transaction_id: string;
          client_id: string;
          uploaded_by: string;
          file_name: string;
          storage_path: string;
          mime_type: string;
          file_size?: number;
        };
        Update: Partial<Attachment>;
        Relationships: [];
      };
      customers: {
        Row: Customer;
        Insert: {
          client_id: string;
          name: string;
          contact_person?: string | null;
          payment_days?: number;
          street?: string | null;
          zip?: string | null;
          city?: string | null;
          country?: string;
          email?: string | null;
          phone?: string | null;
          uid_number?: string | null;
          notes?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Customer>;
        Relationships: [];
      };
      invoices: {
        Row: Invoice;
        Insert: {
          client_id: string;
          customer_id?: string | null;
          invoice_number?: string | null;
          contact_person?: string | null;
          invoice_date?: string;
          due_date: string;
          status?: InvoiceStatus;
          items?: InvoiceItem[];
          total_net?: number;
          total_vat?: number;
          total_gross?: number;
          paid_date?: string | null;
          transaction_id?: string | null;
          notes?: string | null;
          footer_override?: string | null;
          sent_at?: string | null;
          sent_to?: string | null;
        };
        Update: Partial<Invoice>;
        Relationships: [
          {
            foreignKeyName: 'invoices_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_attachments: {
        Row: InvoiceAttachment;
        Insert: {
          client_id: string;
          invoice_id: string;
          file_name: string;
          storage_path: string;
          mime_type?: string | null;
          file_size?: number | null;
        };
        Update: Partial<InvoiceAttachment>;
        Relationships: [];
      };
      incoming_invoices: {
        Row: IncomingInvoice;
        Insert: {
          client_id: string;
          category_id?: string | null;
          supplier_id?: string | null;
          vendor_name: string;
          invoice_number?: string | null;
          invoice_date?: string;
          due_date: string;
          amount_net: number;
          vat_rate?: VatRate;
          vat_amount?: number;
          status?: IncomingInvoiceStatus;
          paid_date?: string | null;
          transaction_id?: string | null;
          beleg_storage_path?: string | null;
          beleg_file_name?: string | null;
          beleg_mime_type?: string | null;
          beleg_file_size?: number | null;
          notes?: string | null;
        };
        Update: Partial<IncomingInvoice>;
        Relationships: [
          {
            foreignKeyName: 'incoming_invoices_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incoming_invoices_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      suppliers: {
        Row: Supplier;
        Insert: {
          client_id: string;
          name: string;
          contact_person?: string | null;
          street?: string | null;
          zip?: string | null;
          city?: string | null;
          country?: string;
          email?: string | null;
          phone?: string | null;
          uid_number?: string | null;
          iban?: string | null;
          notes?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Supplier>;
        Relationships: [];
      };
      receipts: {
        Row: Receipt;
        Insert: {
          client_id: string;
          file_name: string;
          file_url: string;
          file_type?: string;
          file_size?: number | null;
          status?: ReceiptStatus;
          ocr_data?: Record<string, unknown> | null;
          ocr_error?: string | null;
          transaction_id?: string | null;
          notes?: string | null;
          uploaded_by?: string | null;
        };
        Update: Partial<Receipt>;
        Relationships: [];
      };
      bank_imports: {
        Row: BankImport;
        Insert: {
          client_id: string;
          imported_by?: string | null;
          file_name: string;
          file_type: 'camt053' | 'csv';
          iban?: string | null;
          tx_total?: number;
          tx_imported?: number;
          account_id?: string | null;
        };
        Update: Partial<BankImport>;
        Relationships: [];
      };
      accounts: {
        Row: Account;
        Insert: {
          client_id: string;
          name: string;
          type?: AccountType;
          iban?: string | null;
          note?: string | null;
          is_active?: boolean;
          opening_balance?: number;
          opening_date?: string | null;
        };
        Update: Partial<Account>;
        Relationships: [];
      };
      bank_learning_rules: {
        Row: BankLearningRule;
        Insert: {
          client_id: string;
          counterpart_pattern: string;
          category_id?: string | null;
          is_private?: boolean;
          hit_count?: number;
        };
        Update: Partial<BankLearningRule>;
        Relationships: [];
      };
      month_closures: {
        Row: MonthClosure;
        Insert: {
          client_id: string;
          period_year: number;
          period_month: number;
          closed_by?: string | null;
        };
        Update: Partial<MonthClosure>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_auth_user_id_by_email: {
        Args: { p_email: string };
        Returns: string | null;
      };
      get_my_client_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      // Migration 021 – Rechnungen / Ist-Besteuerung
      // Migration 022 – p_datum steuert Jahres-Suffix und Jahreszähler
      naechste_rechnungsnummer: {
        Args: { p_client_id: string; p_datum?: string };
        Returns: string;
      };
      rechnungsnummer_formatieren: {
        Args: { p_prefix: string; p_nr: number; p_digits: number; p_suffix: string; p_jahr: number };
        Returns: string;
      };
      rechnung_bezahlt_buchen: {
        // Migration 041: optional das Konto, mit dem bezahlt wurde
        Args: { p_invoice_id: string; p_category_id: string; p_paid_date: string; p_account_id?: string | null };
        Returns: string;
      };
      // Migration 026 – Aggregation serverseitig statt im Browser
      uva_summe: {
        Args: { p_client_id: string; p_von: string; p_bis: string };
        // Migration 029: zusätzlich nach Umsatzsteuer-Kennzeichen gruppiert
        Returns: {
          typ: 'income' | 'expense'; ust_kennzeichen: string; vat_rate: number;
          bemessungsgrundlage: number; steuer: number; anzahl: number;
        }[];
      };
      buchungsjahre: {
        Args: { p_client_id: string };
        Returns: { jahr: number }[];
      };
      monatssummen: {
        Args: { p_client_id: string };
        Returns: { jahr: number; monat: number; einnahmen: number; ausgaben: number; ust: number; vst: number }[];
      };
      uva_uebermitteln: {
        Args: { p_tax_return_id: string };
        Returns: TaxReturn;
      };
      monat_abschliessen: {
        Args: { p_client_id: string; p_year: number; p_month: number };
        Returns: MonthClosure;
      };
      monat_oeffnen: {
        Args: { p_client_id: string; p_year: number; p_month: number };
        Returns: MonthClosure;
      };
      // Migration 031 – Versandprotokoll und Mengenbegrenzung
      email_versand_protokollieren: {
        Args: {
          p_client_id: string; p_user_id: string | null;
          p_zweck: string; p_empfaenger: string;
          p_limit?: number; p_fenster?: string;
        };
        Returns: void;
      };
    };
  };
};
