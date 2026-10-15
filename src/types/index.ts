export type UserRole = 'admin' | 'operator' | 'reseller'
export type UserStatus = 'pending' | 'active' | 'rejected' | 'disabled'

export interface AppUser {
  id: string
  email: string
  name: string
  avatar?: string
  role: UserRole
  status: UserStatus
  phone?: string
  document?: string
  city?: string
  state?: string
  notes?: string
  created: string
  updated: string
}

export interface ProductType {
  id: string
  name: string
  created?: string
  updated?: string
}

export interface ProductMaterial {
  id: string
  name: string
  created?: string
  updated?: string
}

export interface ProductSize {
  id: string
  name: string
  created?: string
  updated?: string
}

export interface Product {
  id: string
  code: string
  description: string
  type?: string
  target_audience?: 'feminino' | 'masculino' | 'unissex' | ''
  material?: string
  size?: string
  entry_date?: string
  invested_value?: number
  selling_price: number
  quantity: number
  minimum_quantity?: number
  observations?: string
  photos?: string[]
  status: 'available' | 'unavailable'
  created: string
  updated: string
  expand?: {
    type?: ProductType
    material?: ProductMaterial
    size?: ProductSize
  }
}

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  city?: string
  state?: string
  notes?: string
  created: string
  updated: string
}

export interface SaleItem {
  product_id: string
  code: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Sale {
  id: string
  code: string
  customer?: string
  status: 'pending' | 'completed' | 'cancelled'
  items: SaleItem[]
  subtotal: number
  discount: number
  total: number
  payment_method: 'pix' | 'cash' | 'credit_card' | 'debit_card'
  installments?: number
  installment_value?: number
  operator?: string
  created: string
  updated: string
  expand?: {
    customer?: Customer
    operator?: AppUser
  }
}

export interface ConsignmentItem {
  product_id: string
  code: string
  description: string
  quantity: number
  selling_price: number
  sold?: number
  returned?: number
  sold_amount?: number
}

export interface Reseller {
  id: string
  user?: string
  name: string
  email: string
  phone?: string
  document?: string
  city?: string
  state?: string
  status: 'pending' | 'active' | 'rejected' | 'disabled'
  commission_rate?: number
  attachments?: string[]
  rejection_reason?: string
  created: string
  updated: string
  expand?: {
    user?: AppUser
  }
}

export interface ResellerStockItem {
  id: string
  reseller: string
  product: string
  quantity: number
  selling_price?: number
  created: string
  updated: string
  expand?: {
    reseller?: Reseller
    product?: Product
  }
}

export interface ResellerDeliveryItem {
  product_id: string
  code: string
  description: string
  quantity: number
  selling_price: number
  subtotal: number
}

export interface ResellerDelivery {
  id: string
  code: string
  reseller: string
  operator?: string
  status: 'pending_signature' | 'accepted' | 'cancelled'
  items: ResellerDeliveryItem[]
  total_items_count: number
  total_value: number
  notes?: string
  signature_image?: string
  signature_data?: string
  signed_at?: string
  signer_name?: string
  created: string
  updated: string
  expand?: {
    reseller?: Reseller
    operator?: AppUser
  }
}

export interface ResellerSaleItem {
  product_id: string
  code: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface ResellerSale {
  id: string
  code: string
  reseller: string
  customer_name?: string
  customer_phone?: string
  status: 'completed' | 'cancelled'
  items: ResellerSaleItem[]
  subtotal: number
  discount: number
  total: number
  commission_rate: number
  reseller_profit: number
  scaglioni_due: number
  payment_method: 'pix' | 'cash' | 'credit_card' | 'debit_card'
  installments?: number
  notes?: string
  created: string
  updated: string
  expand?: {
    reseller?: Reseller
  }
}

export interface ResellerReturnItem {
  product_id: string
  code: string
  description: string
  selling_price: number
  returned_qty: number
  pending_qty: number
  pending_reason?: 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros' | null
  scaglioni_due?: number
}

export interface ResellerReturn {
  id: string
  code: string
  reseller: string
  operator?: string
  status: 'completed' | 'cancelled'
  items: ResellerReturnItem[]
  total_returned_qty: number
  total_pending_qty: number
  total_pending_value_due: number
  notes?: string
  created: string
  updated: string
  expand?: {
    reseller?: Reseller
    operator?: AppUser
  }
}

export interface ResellerIssue {
  id: string
  reseller: string
  product: string
  return_ref?: string
  quantity: number
  reason: 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
  unit_selling_price: number
  commission_rate: number
  scaglioni_due_total: number
  status: 'pending' | 'paid' | 'forgiven'
  paid_at?: string
  paid_notes?: string
  notes?: string
  created: string
  updated: string
  expand?: {
    reseller?: Reseller
    product?: Product
    return_ref?: ResellerReturn
  }
}

export interface ConsignmentList {
  id: string
  reseller: string
  code: string
  status: 'pending' | 'accepted' | 'in_progress' | 'closed' | 'rejected'
  items: ConsignmentItem[]
  valid_until?: string
  operator?: string
  created: string
  updated: string
  expand?: {
    reseller?: Reseller
    operator?: AppUser
  }
}

export interface AppSettings {
  id?: string
  min_stock_alert: number
}
