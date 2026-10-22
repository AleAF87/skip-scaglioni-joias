import pb from '@/lib/pocketbase/client'
import {
  ConsignmentDocument,
  ConsignmentDocumentSnapshot,
  ConsignmentList,
  Reseller,
  AppSettings,
} from '@/types'
import { valorPorExtenso } from '@/lib/numberToWords'
import { getFileUrl, getProductDisplayPhoto } from '@/lib/formatters'

/**
 * Utilitário para gerar SHA-256 no browser
 */
export async function calculateSha256(text: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback simples
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }
  return 'FALLBACK-' + Math.abs(hash).toString(16)
}

/**
 * Constrói o snapshot de dados imutável da operação
 */
export function buildDocumentSnapshot(params: {
  list: ConsignmentList
  reseller: Reseller
  settings: AppSettings
  operatorName?: string
  clientIp?: string
}): ConsignmentDocumentSnapshot {
  const { list, reseller, settings, operatorName, clientIp } = params

  const rawItems = Array.isArray(list.items) ? list.items : JSON.parse((list.items as any) || '[]')

  const snapshotItems = rawItems.map((it: any) => {
    const qty = it.quantity || 1
    const unitPrice = it.selling_price || 0
    return {
      product_id: it.product_id || '',
      code: it.code || '—',
      description: it.description || 'Produto sem descrição',
      type_name: it.type_name || '',
      material_name: it.material_name || '',
      size_name: it.size_name || '',
      photo_url:
        it.photo_url ||
        (it.photo ? getFileUrl('products', it.product_id, it.photo) : (it as any).image_url || ''),
      quantity: qty,
      selling_price: unitPrice,
      subtotal: qty * unitPrice,
    }
  })

  const totalPieces = snapshotItems.reduce((acc: number, it: any) => acc + (it.quantity || 0), 0)
  const totalValue = snapshotItems.reduce((acc: number, it: any) => acc + (it.subtotal || 0), 0)

  return {
    contract_version: settings.contract_version || '1.0',
    company: {
      legal_name: settings.company_legal_name || '',
      trade_name: settings.company_trade_name || 'Scaglioni Joias',
      cnpj: settings.company_cnpj || '',
      address_street: settings.company_address_street || '',
      address_number: settings.company_address_number || '',
      address_complement: settings.company_address_complement || '',
      address_neighborhood: settings.company_address_neighborhood || '',
      address_city: settings.company_address_city || '',
      address_state: settings.company_address_state || '',
      address_zip: settings.company_address_zip || '',
      email: settings.company_email || '',
      phone: settings.company_phone || '',
      forum_city: settings.forum_city || settings.company_address_city || '',
      forum_state: settings.forum_state || settings.company_address_state || '',
    },
    reseller: {
      id: reseller.id,
      name: reseller.name || '',
      cpf: reseller.document || '',
      birth_date: reseller.birth_date || '',
      phone: reseller.phone || '',
      email: reseller.email || '',
      address_street: reseller.address_street || '',
      address_number: reseller.address_number || '',
      address_complement: reseller.address_complement || '',
      address_neighborhood: reseller.address_neighborhood || '',
      address_city: reseller.city || '',
      address_state: reseller.state || '',
      address_zip: reseller.address_zip || '',
    },
    consignment: {
      id: list.id,
      code: list.code,
      created_at: list.created,
      valid_until: list.valid_until,
      financial_due_date: list.financial_due_date,
      return_due_date: list.return_due_date,
      notes: list.notes,
      status: list.status,
      operator_name: operatorName || list.expand?.operator?.name || 'Administração Scaglioni',
      created_ip: clientIp || list.created_ip || '127.0.0.1',
    },
    items: snapshotItems,
    totals: {
      items_count: snapshotItems.length,
      pieces_count: totalPieces,
      total_value: totalValue,
      total_value_words: valorPorExtenso(totalValue),
    },
  }
}

export const consignmentDocumentService = {
  async getByConsignmentId(consignmentId: string): Promise<ConsignmentDocument | null> {
    try {
      return await pb
        .collection('consignment_documents')
        .getFirstListItem<ConsignmentDocument>(`consignment_list = '${consignmentId}'`, {
          expand: 'consignment_list,reseller,created_by',
        })
    } catch (_) {
      return null
    }
  },

  async signDocument(params: {
    consignmentId: string
    signatureDataUrl: string
    signerName: string
    signerDocument: string
    snapshotData: ConsignmentDocumentSnapshot
    documentHash: string
    sessionId?: string
  }): Promise<{
    success: boolean
    consignment_id: string
    document_id: string
    status: string
    signed_at: string
    signed_ip: string
    document_hash: string
    contract_version: string
  }> {
    return pb.send('/backend/v1/consignments/sign', {
      method: 'POST',
      body: JSON.stringify({
        consignment_id: params.consignmentId,
        signature_data: params.signatureDataUrl,
        signer_name: params.signerName,
        signer_document: params.signerDocument,
        snapshot_data: params.snapshotData,
        document_hash: params.documentHash,
        session_id: params.sessionId,
      }),
    })
  },

  async cancelConsignment(params: {
    consignmentId: string
    cancellationReason: string
  }): Promise<{ success: boolean; consignment_id: string; status: string }> {
    return pb.send('/backend/v1/consignments/cancel', {
      method: 'POST',
      body: JSON.stringify({
        consignment_id: params.consignmentId,
        cancellation_reason: params.cancellationReason,
      }),
    })
  },

  async uploadSignedPdf(documentId: string, pdfBlob: Blob, filename: string): Promise<void> {
    try {
      const formData = new FormData()
      formData.append('pdf_file', pdfBlob, filename)
      await pb.collection('consignment_documents').update(documentId, formData)
    } catch (err) {
      console.error('Aviso ao persistir arquivo PDF na collection:', err)
    }
  },
}
