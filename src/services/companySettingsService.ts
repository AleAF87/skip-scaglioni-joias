import pb from '@/lib/pocketbase/client'
import { AppSettings } from '@/types'

export const companySettingsService = {
  async getSettings(): Promise<AppSettings> {
    try {
      const records = await pb.collection('settings').getFullList<AppSettings>({
        limit: 1,
      })
      if (records.length > 0) {
        return records[0]
      }
      // Se não existir, criar registro padrão
      const created = await pb.collection('settings').create<AppSettings>({
        min_stock_alert: 5,
        company_legal_name: '',
        company_trade_name: 'Scaglioni Joias',
        company_cnpj: '',
        company_address_street: '',
        company_address_number: '',
        company_address_complement: '',
        company_address_neighborhood: '',
        company_address_city: '',
        company_address_state: '',
        company_address_zip: '',
        company_email: '',
        company_phone: '',
        forum_city: '',
        forum_state: '',
        contract_version: '1.0',
      })
      return created
    } catch (err) {
      console.error('Erro ao buscar configurações da empresa:', err)
      return {
        min_stock_alert: 5,
        company_trade_name: 'Scaglioni Joias',
        contract_version: '1.0',
      }
    }
  },

  async updateSettings(id: string, data: Partial<AppSettings>): Promise<AppSettings> {
    return pb.collection('settings').update<AppSettings>(id, data)
  },
}
