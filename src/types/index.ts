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
  birth_date?: string
  address_street?: string
  address_number?: string
  address_complement?: string
  address_neighborhood?: string
  address_zip?: string
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

export interface Brand {
  id: string
  name: string
  slug?: string
  created?: string
  updated?: string
}

export interface ProductCategory {
  id: string
  name: string
  slug?: string
  created?: string
  updated?: string
}

export interface ProductCategoryLink {
  id: string
  product: string
  category: string
  is_principal?: boolean
  expand?: {
    category?: ProductCategory
  }
}

export interface ProductImage {
  id: string
  product: string
  image_url?: string
  file?: string
  is_principal?: boolean
  sort_order?: number
  origem?: string
  created?: string
  updated?: string
}

export interface ProductVariation {
  id: string
  product: string
  sku: string
  attributes?: Record<string, string | number>
  price?: number
  quantity?: number
  image_url?: string
  created?: string
  updated?: string
}

export interface ProductPriceHistory {
  id: string
  product: string
  preco_venda_anterior?: number
  preco_venda_novo?: number
  preco_promocional_anterior?: number
  preco_promocional_novo?: number
  responsavel?: string
  motivo?: string
  created: string
}

export interface InitialStock {
  id: string
  product: string
  origem: 'Tecson' | 'Scaglioni' | 'Manual' | string
  id_origem?: string
  quantidade: number
  localizacao?: string
  data_registro?: string
  is_ativo?: boolean
  detalhes_distribuicao?: {
    loja_fisica?: number
    revendedora_id?: string
    revendedora_nome?: string
    revendedora_qty?: number
    expedicao?: number
  }
  created?: string
  updated?: string
}

export interface Product {
  id: string
  // Identificador novo interno e códigos
  produto_id?: string
  sku_interno?: string
  sku_novo?: string
  code: string // código legado e compatibilidade
  codigo_barras?: string // texto preservando zeros

  // Dados principais
  nome_produto?: string
  description: string
  fornecedor?: string
  marca_id?: string

  // Valores e dimensões
  selling_price: number // preco_venda
  preco_promocional?: number
  custo_unitario?: number
  invested_value?: number // compatibilidade interna
  altura_cm?: number
  largura_cm?: number
  comprimento_cm?: number
  peso_g?: number

  // Status e canais
  ativo_interno?: boolean
  publicar_no_ecommerce?: boolean
  destaque_ecommerce?: boolean
  slug?: string
  status: 'available' | 'unavailable'

  // Estoque (calculado a partir de saldo inicial + movimentações)
  quantity: number
  qtde_inicial?: number
  minimum_quantity?: number

  // Origem geral / importação
  origem?: string
  origem_importacao?: string

  // Identificadores de Origem Tecson
  id_tecson?: string
  codigo_produto_tecson?: string
  codigo_barras_tecson?: string
  nome_original_tecson?: string
  data_inclusao_tecson?: string

  // Identificadores de Origem Scaglioni
  id_scaglioni?: string
  sku_scaglioni?: string
  slug_scaglioni?: string
  nome_original_scaglioni?: string
  created_at_scaglioni?: string
  criado_em_origem?: string
  updated_at_scaglioni?: string
  estado_ativo_ecommerce?: boolean

  // Campos brutos auxiliares
  tipo_produto_bruto?: string
  variacao_resumo_bruto?: string
  nome_produto_pai_bruto?: string
  cod_produto_pai_bruto?: string
  codigo_barras_pai_bruto?: string

  // Legados / Imagens diretas
  type?: string
  target_audience?: 'feminino' | 'masculino' | 'unissex' | ''
  material?: string
  size?: string
  entry_date?: string
  observations?: string
  photos?: string[]
  import_image_path?: string
  image_url?: string

  created: string
  updated: string
  expand?: {
    type?: ProductType
    material?: ProductMaterial
    size?: ProductSize
    marca_id?: Brand
    'product_category_links(product)'?: ProductCategoryLink[]
    'product_images(product)'?: ProductImage[]
    'product_variations(product)'?: ProductVariation[]
    'initial_stocks(product)'?: InitialStock[]
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
  birth_date?: string
  address_street?: string
  address_number?: string
  address_complement?: string
  address_neighborhood?: string
  address_zip?: string
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
  status:
    | 'pending_signature'
    | 'pending'
    | 'accepted'
    | 'open'
    | 'in_progress'
    | 'closed'
    | 'rejected'
    | 'cancelled'
  items: ConsignmentItem[]
  valid_until?: string
  financial_due_date?: string
  return_due_date?: string
  notes?: string
  operator?: string
  created_ip?: string
  cancellation_reason?: string
  cancelled_at?: string
  cancelled_by?: string
  created: string
  updated: string
  expand?: {
    reseller?: Reseller
    operator?: AppUser
    cancelled_by?: AppUser
  }
}

export interface AppSettings {
  id?: string
  min_stock_alert: number
  company_legal_name?: string
  company_trade_name?: string
  company_cnpj?: string
  company_address_street?: string
  company_address_number?: string
  company_address_complement?: string
  company_address_neighborhood?: string
  company_address_city?: string
  company_address_state?: string
  company_address_zip?: string
  company_email?: string
  company_phone?: string
  forum_city?: string
  forum_state?: string
  contract_version?: string
}

export interface ConsignmentDocumentSnapshotItem {
  product_id: string
  code: string
  description: string
  type_name?: string
  material_name?: string
  size_name?: string
  photo_url?: string
  quantity: number
  selling_price: number
  subtotal: number
}

export interface ConsignmentDocumentSnapshot {
  contract_version: string
  company: {
    legal_name: string
    trade_name: string
    cnpj: string
    address_street: string
    address_number: string
    address_complement: string
    address_neighborhood: string
    address_city: string
    address_state: string
    address_zip: string
    email: string
    phone: string
    forum_city: string
    forum_state: string
  }
  reseller: {
    id: string
    name: string
    cpf: string
    birth_date: string
    phone: string
    email: string
    address_street: string
    address_number: string
    address_complement: string
    address_neighborhood: string
    address_city: string
    address_state: string
    address_zip: string
  }
  consignment: {
    id: string
    code: string
    created_at: string
    valid_until?: string
    financial_due_date?: string
    return_due_date?: string
    notes?: string
    status: string
    operator_name?: string
    created_ip?: string
  }
  items: ConsignmentDocumentSnapshotItem[]
  totals: {
    items_count: number
    pieces_count: number
    total_value: number
    total_value_words: string
  }
  signature?: {
    signed_at: string
    signed_ip: string
    signer_name: string
    signer_document: string
    document_hash: string
    session_id: string
  }
}

export interface ConsignmentDocument {
  id: string
  consignment_list: string
  reseller: string
  document_code: string
  contract_version: string
  status: 'pending_signature' | 'signed' | 'closed' | 'cancelled'
  document_hash?: string
  session_id?: string
  signer_name?: string
  signer_document?: string
  signed_at?: string
  signed_ip?: string
  creator_ip?: string
  created_by?: string
  signature_image_data?: string
  snapshot_data?: ConsignmentDocumentSnapshot | string
  pdf_file?: string
  created: string
  updated: string
  expand?: {
    consignment_list?: ConsignmentList
    reseller?: Reseller
    created_by?: AppUser
  }
}
