// ── Mirrors iOS Models.swift ──────────────────────────────────────────────────

export type TransactionType = 'expense' | 'income' | 'payment'
export type MatchStatus = 'unmatched' | 'matched' | 'ignored'

export interface Transaction {
  id: string
  user_id: string
  amount: number
  currency: string
  type: TransactionType
  category: string
  description?: string
  date: string
  credit_card_id?: string
  bank_account_id?: string
  is_installment: boolean
  installment_number?: number
  installment_total?: number
  original_amount?: number
  original_currency?: string
  is_from_cartola: boolean
  is_transfer: boolean
  match_status: MatchStatus
  matched_transaction_id?: string
  cartola_upload_id?: string
  subscription_id?: string
  loan_id?: string
  created_at: string
}

export interface CreditCard {
  id: string
  user_id: string
  name: string
  last_four?: string
  closing_day?: number
  balance: number       // CLP debt
  balance_usd: number   // USD debt (separate credit line)
  bank?: string         // 'falabella' | 'santander' | 'unknown'
  currency: string
  created_at: string
}

export interface BankAccount {
  id: string
  user_id: string
  name: string
  bank_name?: string
  last_four?: string
  balance: number
  currency: string
  is_active: boolean
  created_at: string
}

export interface CartolaUpload {
  id: string
  user_id: string
  credit_card_id: string
  bank_name?: string
  card_last_four?: string
  period_start?: string
  period_end?: string
  total_amount?: number
  transaction_count: number
  matched_count: number
  status: 'procesada' | 'revisando' | 'pendiente'
  currency: string
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  name: string
  amount: number
  currency: string
  category: string
  billing_day: number
  billing_period: 'monthly' | 'annual'  // 'monthly' = mensual, 'annual' = anual
  start_date?: string   // YYYY-MM-01 — month from which the subscription applies
  credit_card_id?: string
  is_active: boolean
  created_at: string
}

export interface Loan {
  id: string
  user_id: string
  name: string
  lender: string
  total_amount: number
  remaining_balance: number
  monthly_payment: number
  interest_rate: number
  start_date: string
  end_date?: string
  created_at: string
}

export interface CategoryBudget {
  id: string
  user_id: string
  category: string
  monthly_limit: number
  created_at: string
}

export interface UserSettings {
  id: string
  user_id: string
  monthly_budget: number
  savings_goal: number
  usd_exchange_rate?: number   // CLP per 1 USD, e.g. 950
  created_at: string
}

// ── Parser types ──────────────────────────────────────────────────────────────

export type BankType = 'falabella' | 'santander' | 'scotiabank' | 'unknown'

export interface CartolaTransaction {
  id: string           // client-side UUID for React keys
  date: Date
  description: string
  amount: number
  isInstallment: boolean
  installmentNumber?: number
  installmentTotal?: number
  originalAmount?: number
  isPayment: boolean
}

export interface CartolaParseResult {
  bank: BankType
  cardLastFour: string
  periodStart?: Date
  periodEnd?: Date
  totalAmount: number      // Monto Total Facturado a Pagar (período actual)
  cupoUtilizado?: number   // Cupo Utilizado / Deuda total real de la tarjeta
  currency: string         // 'CLP' | 'USD' | etc.
  transactions: CartolaTransaction[]
  upcomingPayments?: { dueDate: string; amount: number }[]  // From "Vencimiento Próximos 4 meses"
}
