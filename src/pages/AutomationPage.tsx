import React, { useState } from 'react'
import {
  Bot,
  Play,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Terminal,
  FileCode2,
  Copy,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { automationService, AutomationStep, AutomationResult } from '@/services/automationService'

const XPATH_DEFAULT = '/html/body/div/div/div/main/main/div/div/div[1]/a[1]/div/div/p[1]'

export default function AutomationPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [xpath, setXpath] = useState(XPATH_DEFAULT)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passos, setPassos] = useState<AutomationStep[]>([])
  const [resultado, setResultado] = useState<AutomationResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleIniciar = async (e: React.FormEvent) => {
    e.preventDefault()

    const emailTrimmed = email.trim()
    const senhaTrimmed = senha.trim()
    const xpathTrimmed = xpath.trim() || XPATH_DEFAULT

    if (!emailTrimmed) {
      toast.error('Informe o e-mail de acesso ao site.')
      return
    }
    if (!senhaTrimmed) {
      toast.error('Informe a senha de acesso ao site.')
      return
    }

    setLoading(true)
    setErrorMessage(null)
    setResultado(null)
    setPassos([
      {
        horario: new Date().toISOString(),
        mensagem: 'Iniciando automação do site scaglionijoias.com.br...',
      },
    ])

    try {
      const res = await automationService.executarLoginScaglioni({
        email: emailTrimmed,
        senha: senhaTrimmed,
        xpath: xpathTrimmed,
      })

      setResultado(res)
      if (res.passos && res.passos.length > 0) {
        setPassos(res.passos)
      }
      toast.success('Automação concluída com sucesso!')
    } catch (err: unknown) {
      const errorObj = err as {
        error?: string
        detalhe?: string
        passos?: AutomationStep[]
      }
      const amigavel = errorObj?.error || 'Não foi possível completar a automação no momento.'
      setErrorMessage(amigavel)
      if (errorObj?.passos && errorObj.passos.length > 0) {
        setPassos(errorObj.passos)
      } else {
        setPassos((prev) => [
          ...prev,
          {
            horario: new Date().toISOString(),
            mensagem: amigavel,
          },
        ])
      }
      toast.error(amigavel)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyResult = () => {
    if (!resultado?.texto_extraido) return
    navigator.clipboard.writeText(resultado.texto_extraido)
    setCopied(true)
    toast.success('Texto copiado para a área de transferência!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E5DFD5]">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-[#7A5C2E] text-white flex items-center justify-center shadow-xs">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#2D2A26] font-serif">
                Automação Scaglioni Joias
              </h1>
              <p className="text-xs text-[#6B655E]">
                Integração direta com o site oficial{' '}
                <a
                  href="https://scaglionijoias.com.br"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline text-[#7A5C2E] inline-flex items-center gap-1 hover:text-[#5E441D]"
                >
                  scaglionijoias.com.br
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
          </div>
        </div>

        <Badge
          variant="outline"
          className="self-start sm:self-center border-[#C6A664] text-[#7A5C2E] bg-[#FDFBF7] px-3 py-1 font-medium"
        >
          Acesso Restrito: Administrador
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Inicialização */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-[#E5DFD5] shadow-xs bg-white">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-serif text-[#2D2A26] flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#7A5C2E]" />
                Credenciais do Site Alvo
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E]">
                Insira o e-mail e senha de sua conta de administrador no site externo para que o
                serviço efetue o login e consulte o painel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleIniciar} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-[#2D2A26]">
                    E-mail no site
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@scaglionijoias.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="username"
                    required
                    className="border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="senha" className="text-xs font-semibold text-[#2D2A26]">
                    Senha no site
                  </Label>
                  <div className="relative">
                    <Input
                      id="senha"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      disabled={loading}
                      autoComplete="current-password"
                      required
                      className="border-[#E5DFD5] focus-visible:ring-[#C6A664] pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={loading}
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8C8275] hover:text-[#2D2A26] transition-colors p-1"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Campo de Xpath alvo liberado para digitação */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="xpath" className="text-xs font-semibold text-[#2D2A26]">
                      Xpath alvo
                    </Label>
                    {xpath !== XPATH_DEFAULT && (
                      <button
                        type="button"
                        onClick={() => setXpath(XPATH_DEFAULT)}
                        disabled={loading}
                        className="text-[11px] text-[#7A5C2E] hover:underline"
                      >
                        Restaurar padrão
                      </button>
                    )}
                  </div>
                  <Input
                    id="xpath"
                    type="text"
                    placeholder="/html/body/div/div/div/main/main/div/div/div[1]/a[1]/div/div/p[1]"
                    value={xpath}
                    onChange={(e) => setXpath(e.target.value)}
                    disabled={loading}
                    required
                    className="font-mono text-xs border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                  <p className="text-[11px] text-[#8C8275] leading-tight">
                    Alvo padrão: Card 1 (Produtos). Você pode alterar para outros cards (ex:{' '}
                    <code className="bg-[#FAF7F0] px-1 py-0.2 rounded text-[10px]">a[2]</code> para
                    Categorias,{' '}
                    <code className="bg-[#FAF7F0] px-1 py-0.2 rounded text-[10px]">a[3]</code> para
                    Vendas).
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#7A5C2E] hover:bg-[#5E441D] text-white font-semibold py-2.5 shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Executando automação...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-white" />
                        <span>Iniciar</span>
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-[11px] text-[#8C8275] leading-relaxed pt-1">
                  <strong>Privacidade garantida:</strong> Suas credenciais são transmitidas
                  diretamente e de forma segura ao site oficial, processadas apenas em memória na
                  requisição e <u>nunca</u> são armazenadas em banco de dados ou arquivos.
                </p>
              </form>
            </CardContent>
          </Card>

          {/* Card com Detalhes do Alvo Técnico */}
          <Card className="border-[#E5DFD5] shadow-xs bg-[#FAF7F0]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-[#7A5C2E] flex items-center gap-1.5">
                <FileCode2 className="h-3.5 w-3.5" />
                Especificação da Automação
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-[#6B655E] space-y-2">
              <p>
                <strong>1. Login:</strong> Conecta em{' '}
                <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-[#E5DFD5]">
                  /auth
                </code>
              </p>
              <p>
                <strong>2. Acesso:</strong> Consulta o painel{' '}
                <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-[#E5DFD5]">
                  /admin
                </code>
              </p>
              <p>
                <strong>3. XPath Alvo Atual:</strong>
              </p>
              <div className="font-mono text-[10px] bg-white p-2 rounded border border-[#E5DFD5] text-[#2D2A26] break-all">
                {xpath || XPATH_DEFAULT}
              </div>
              <p className="text-[11px] text-[#8C8275]">
                O campo acima do botão Iniciar permite digitar o XPath alvo desejado. Alvos
                reconhecidos: Card 1 (Produtos, <code className="text-[10px]">a[1]</code>), Card 2
                (Categorias, <code className="text-[10px]">a[2]</code>), Card 3 (Vendas,{' '}
                <code className="text-[10px]">a[3]</code>), Card 4 (Revendedores,{' '}
                <code className="text-[10px]">a[4]</code>).
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Resultados e Passos Executados */}
        <div className="lg:col-span-7 space-y-6">
          {/* Campo de Resultado Somente Leitura */}
          <Card className="border-[#E5DFD5] shadow-xs bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-serif text-[#2D2A26]">
                    Resultado Extraído
                  </CardTitle>
                  <CardDescription className="text-xs text-[#6B655E]">
                    Conteúdo do elemento solicitado no painel administrativo do site
                  </CardDescription>
                </div>
                {resultado?.texto_extraido && (
                  <Badge className="bg-[#2E7D4F] text-white hover:bg-[#256841] border-none text-xs">
                    Sucesso
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="resultado-extraido"
                    className="text-xs font-semibold text-[#2D2A26]"
                  >
                    Texto existente no XPath
                  </Label>
                  {resultado?.texto_extraido && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyResult}
                      className="h-7 text-xs text-[#7A5C2E] hover:text-[#5E441D] hover:bg-[#F3EAD8] gap-1 px-2"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="resultado-extraido"
                    readOnly
                    value={
                      resultado?.texto_extraido ??
                      (loading ? 'Aguardando processamento...' : 'Nenhum dado extraído ainda.')
                    }
                    className={`font-mono text-base font-semibold border-[#E5DFD5] bg-[#FAF8F5] cursor-default ${
                      resultado?.texto_extraido
                        ? 'text-[#2E7D4F] border-[#2E7D4F]/40 bg-[#2E7D4F]/5'
                        : 'text-[#8C8275]'
                    }`}
                  />
                </div>
              </div>

              {/* Mensagem de Erro Amigável */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/90 text-red-900 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-red-800 whitespace-pre-line">
                      {errorMessage}
                    </p>
                    {!errorMessage.includes('XPath não reconhecido') && (
                      <p className="text-xs text-red-700 leading-relaxed">
                        Verifique se digitou o e-mail e a senha cadastrados corretamente no site
                        scaglionijoias.com.br e tente novamente.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Detalhes do Card em caso de sucesso */}
              {resultado?.detalhes_do_card && (
                <div className="p-4 rounded-xl border border-[#C6A664]/30 bg-[#FDFBF7] space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#7A5C2E]">
                    <CheckCircle2 className="h-4 w-4 text-[#2E7D4F]" />
                    <span>
                      Conferência dos Detalhes do Card (
                      {resultado.detalhes_do_card.card_rotulo || 'Extraído'})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[#8C8275] block">Rótulo do Card:</span>
                      <strong className="text-[#2D2A26]">
                        {resultado.detalhes_do_card.card_rotulo || 'Produtos'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#8C8275] block">Link de Destino:</span>
                      <strong className="text-[#2D2A26]">
                        {resultado.detalhes_do_card.card_link || '/admin/produtos'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#8C8275] block">Contagem (REST Supabase):</span>
                      <strong className="text-[#2D2A26]">
                        {resultado.detalhes_do_card.count_produtos ?? '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#8C8275] block">Usuário Autenticado:</span>
                      <strong className="text-[#2D2A26] truncate block">
                        {resultado.detalhes_do_card.usuario_conectado?.email || '—'}
                      </strong>
                    </div>
                  </div>

                  {resultado.detalhes_do_card.primeiro_item_bruto && (
                    <div className="pt-2 border-t border-[#E5DFD5]">
                      <span className="text-[11px] font-semibold text-[#6B655E] block mb-1">
                        JSON Bruto do Primeiro Registro (para conferência):
                      </span>
                      <pre className="text-[10px] font-mono bg-white p-2.5 rounded-lg border border-[#E5DFD5] text-[#2D2A26] overflow-x-auto max-h-40">
                        {JSON.stringify(resultado.detalhes_do_card.primeiro_item_bruto, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico / Linha do Tempo dos Passos Executados */}
          <Card className="border-[#E5DFD5] shadow-xs bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif text-[#2D2A26] flex items-center gap-2">
                <Terminal className="h-4 w-4 text-[#7A5C2E]" />
                Passos da Execução
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E]">
                Acompanhe o fluxo em tempo real de conexão, login e obtenção dos dados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {passos.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8C8275]">
                  Nenhuma execução realizada. Clique em &quot;Iniciar&quot; para executar a
                  automação.
                </div>
              ) : (
                <ol className="relative border-l border-[#E5DFD5] ml-3 space-y-4">
                  {passos.map((passo, idx) => {
                    const isLast = idx === passos.length - 1
                    const isSuccess =
                      passo.mensagem.toLowerCase().includes('sucesso') ||
                      passo.mensagem.toLowerCase().includes('obtido')
                    const isError =
                      passo.mensagem.toLowerCase().includes('erro') ||
                      passo.mensagem.toLowerCase().includes('falha') ||
                      passo.mensagem.toLowerCase().includes('inválid')

                    return (
                      <li key={idx} className="ml-5">
                        <span
                          className={`absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full ring-4 ring-white ${
                            isError
                              ? 'bg-red-500'
                              : isSuccess
                                ? 'bg-[#2E7D4F]'
                                : isLast && loading
                                  ? 'bg-[#C6A664] animate-pulse'
                                  : 'bg-[#7A5C2E]'
                          }`}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`text-xs font-medium ${
                              isError
                                ? 'text-red-700'
                                : isSuccess
                                  ? 'text-[#2E7D4F] font-semibold'
                                  : 'text-[#2D2A26]'
                            }`}
                          >
                            {passo.mensagem}
                          </p>
                          <time className="text-[10px] text-[#8C8275] whitespace-nowrap">
                            {new Date(passo.horario).toLocaleTimeString('pt-BR')}
                          </time>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
