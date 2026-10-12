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
  attachments?: string[]
  rejection_reason?: string
  created: string
  updated: string
  expand?: {
    user?: AppUser
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
