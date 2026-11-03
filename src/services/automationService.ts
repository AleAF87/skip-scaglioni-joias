import pb from '@/lib/pocketbase/client'

export interface AutomationStep {
  horario: string
  mensagem: string
}

export interface AutomationCardDetails {
  card_rotulo?: string
  card_link?: string
  tabela?: string
  xpath?: string
  descricao_xpath?: string
  valor_exibido?: string
  count_produtos?: number | null
  primeiro_item_bruto?: Record<string, unknown> | null
  usuario_conectado?: {
    id?: string | null
    email?: string | null
    role?: string | null
  }
}

export interface AutomationComparedProduct {
  id: string
  codigo: string
  sku: string
  nome: string
  valor_vende: number
  qtde_estoque: number
  qtde_ecommerce: number
  qtde_site: number | null
  status_conferencia: 'igual' | 'divergente' | 'nao_encontrado'
  status_texto: string
  status_detalhe?: string
  imagem?: string
  dados_site?: {
    id?: string
    nome?: string
    sku?: string
    preco?: number
    estoque?: number
  } | null
}

export interface AutomationComparisonSummary {
  total_ativos_local: number
  total_site_encontrados: number
  total_iguais: number
  total_divergentes: number
  total_nao_encontrados: number
  tabela_site?: string
  xpath_tabela?: string
  xpath_coluna_sku?: string
}

export interface AutomationResult {
  success: boolean
  texto_extraido: string
  detalhes_do_card: AutomationCardDetails
  passos: AutomationStep[]
  comparativo_produtos?: AutomationComparedProduct[]
  resumo_comparativo?: AutomationComparisonSummary
  error?: string
  detalhe?: string
}

export interface AutomationCredentials {
  email: string
  senha: string
  xpath?: string
}

export const automationService = {
  async executarLoginScaglioni(creds: AutomationCredentials): Promise<AutomationResult> {
    try {
      const response = await pb.send<AutomationResult>('/backend/v1/automacao/scaglioni-login', {
        method: 'POST',
        body: {
          email: creds.email,
          senha: creds.senha,
          xpath: creds.xpath,
        },
      })
      return response
    } catch (err: unknown) {
      // PocketBase ClientResponseError ou erro de requisição
      const errorObj = err as {
        status?: number
        response?: {
          error?: string
          detalhe?: string
          passos?: AutomationStep[]
        }
        message?: string
      }

      const responseData = errorObj?.response
      if (responseData?.error) {
        throw {
          status: errorObj.status || 400,
          error: responseData.error,
          detalhe: responseData.detalhe,
          passos: responseData.passos || [],
        }
      }

      if (errorObj?.status === 400 || errorObj?.status === 401) {
        throw {
          status: errorObj.status,
          error: 'Credenciais inválidas no site Scaglioni Joias.',
          passos: [],
        }
      }

      throw {
        status: errorObj?.status || 500,
        error: errorObj?.message || 'Falha de comunicação com o servidor.',
        passos: [],
      }
    }
  },
}
