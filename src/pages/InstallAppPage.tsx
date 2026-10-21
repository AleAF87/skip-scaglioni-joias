import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Download,
  Smartphone,
  Monitor,
  Apple,
  Share2,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  Info,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LOGO_FULL_URL, LOGO_ICON_URL } from '@/constants/branding'
import { useAuth } from '@/contexts/AuthContext'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function InstallAppPage() {
  const { user } = useAuth()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('android')
  const [installSuccess, setInstallSuccess] = useState(false)

  useEffect(() => {
    // Detectar plataforma do usuário
    const userAgent = window.navigator.userAgent.toLowerCase()
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setPlatform('ios')
    } else if (/android/.test(userAgent)) {
      setPlatform('android')
    } else {
      setPlatform('desktop')
    }

    // Verificar se já está rodando em modo standalone (PWA instalado)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (isStandalone) {
      setIsInstalled(true)
    }

    // Ouvinte do evento nativo beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setInstallSuccess(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      if (choiceResult.outcome === 'accepted') {
        setInstallSuccess(true)
        setIsInstalled(true)
      }
      setDeferredPrompt(null)
    } catch (err) {
      console.warn('Erro ao disparar prompt de instalação:', err)
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D2A26] flex flex-col">
      {/* Top Header / Bar */}
      <header className="border-b border-[#E5DFD5] bg-white/95 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to={user ? '/dashboard' : '/login'}
            className="inline-flex items-center gap-1.5 text-xs text-[#7A5C2E] font-medium hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{user ? 'Voltar ao Sistema' : 'Ir para o Login'}</span>
          </Link>

          <span className="text-[11px] font-mono text-[#8C8275]">Aplicativo Oficial</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto w-full px-4 py-8 flex-1 space-y-8">
        {/* Hero Section with Official Logo */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="bg-[#000000] p-4 sm:p-5 rounded-2xl shadow-xl border border-[#C6A664]/40 inline-flex items-center justify-center max-w-[280px] sm:max-w-xs">
              <img
                src={LOGO_FULL_URL}
                alt="Scaglioni Joias"
                className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
              />
            </div>
          </div>

          <div className="max-w-xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3EAD8] text-[#7A5C2E] text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Instale no seu Celular ou Computador</span>
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#2D2A26] tracking-tight">
              Instale o App Scaglioni Joias
            </h1>
            <p className="text-xs sm:text-sm text-[#6B655E]">
              Tenha acesso rápido com apenas 1 toque na tela de início, sem precisar digitar o
              endereço no navegador, com abertura em tela cheia e maior desempenho para PDV, vitrine
              e vendas.
            </p>
          </div>
        </div>

        {/* Installation Status / Quick Action Card */}
        {isInstalled ? (
          <Card className="border-emerald-200 bg-emerald-50/70 shadow-sm max-w-xl mx-auto">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-emerald-900">
                  Aplicativo Já Instalado!
                </h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Você já está executando o Scaglioni Joias em modo aplicativo na sua tela de início
                  ou desktop.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : deferredPrompt ? (
          <Card className="border-[#C6A664] bg-gradient-to-br from-[#FFFFFF] via-[#FDFBF7] to-[#F3EAD8] shadow-md max-w-xl mx-auto">
            <CardContent className="p-6 text-center space-y-4">
              <div className="flex justify-center">
                <img
                  src={LOGO_ICON_URL}
                  alt="Ícone Scaglioni Joias"
                  className="h-16 w-16 rounded-2xl shadow-md border border-[#C6A664]/50"
                />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-lg font-bold text-[#2D2A26]">
                  Pronto para Instalação Rápida
                </h3>
                <p className="text-xs text-[#6B655E]">
                  Seu navegador disparou a instalação direta. Clique no botão abaixo para adicionar
                  aos seus aplicativos.
                </p>
              </div>
              <Button
                size="lg"
                onClick={handleInstallClick}
                className="w-full sm:w-auto px-8 bg-gradient-to-r from-[#7A5C2E] via-[#C6A664] to-[#7A5C2E] hover:opacity-95 text-white font-semibold text-sm shadow-md"
              >
                <Download className="h-4 w-4 mr-2" />
                Instalar Aplicativo Agora
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[#E5DFD5] bg-gradient-to-br from-[#FFFFFF] to-[#FDFBF7] shadow-sm max-w-xl mx-auto">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-4">
                <img
                  src={LOGO_ICON_URL}
                  alt="Ícone Scaglioni Joias"
                  className="h-14 w-14 rounded-2xl shadow-sm border border-[#C6A664]/40 shrink-0"
                />
                <div className="space-y-1">
                  <h3 className="font-serif text-base font-bold text-[#2D2A26]">
                    Instalação Direta no seu Navegador
                  </h3>
                  <p className="text-xs text-[#6B655E]">
                    No computador (Chrome ou Edge), o navegador exibe o botão de instalação
                    diretamente na <strong>barra de endereços</strong> ou no menu ⋮.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F3EAD8]/60 border border-[#C6A664]/40 text-xs text-[#7A5C2E] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-[#7A5C2E] shrink-0" />
                  <span>
                    Procure o ícone de instalação{' '}
                    <strong>(computador com seta para baixo ou +)</strong> no lado direito da barra
                    de endereço da URL.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {installSuccess && (
          <div className="p-4 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs text-center font-medium max-w-xl mx-auto">
            🎉 Parabéns! O app Scaglioni Joias foi adicionado com sucesso à sua área de
            trabalho/tela inicial.
          </div>
        )}

        {/* Passo a Passo por Plataforma */}
        <div className="max-w-2xl mx-auto">
          <Tabs defaultValue={platform} className="w-full">
            <div className="flex justify-center mb-6">
              <TabsList className="bg-white border border-[#E5DFD5] p-1 rounded-xl shadow-xs">
                <TabsTrigger
                  value="ios"
                  className="flex items-center gap-1.5 text-xs data-[state=active]:bg-[#7A5C2E] data-[state=active]:text-white rounded-lg px-3 py-2"
                >
                  <Apple className="h-4 w-4" />
                  <span>iPhone / iPad (iOS)</span>
                </TabsTrigger>
                <TabsTrigger
                  value="android"
                  className="flex items-center gap-1.5 text-xs data-[state=active]:bg-[#7A5C2E] data-[state=active]:text-white rounded-lg px-3 py-2"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>Android (Chrome)</span>
                </TabsTrigger>
                <TabsTrigger
                  value="desktop"
                  className="flex items-center gap-1.5 text-xs data-[state=active]:bg-[#7A5C2E] data-[state=active]:text-white rounded-lg px-3 py-2"
                >
                  <Monitor className="h-4 w-4" />
                  <span>Computador (PC/Mac)</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* TAB iOS */}
            <TabsContent value="ios">
              <Card className="border-[#E5DFD5] bg-white shadow-xs">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-black text-white flex items-center justify-center">
                      <Apple className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="font-serif text-base text-[#2D2A26]">
                        Como instalar no iPhone ou iPad (Safari)
                      </CardTitle>
                      <CardDescription className="text-xs text-[#6B655E]">
                        Siga o passo a passo oficial da Apple em menos de 1 minuto
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-xs sm:text-sm">
                  <ol className="space-y-3.5 list-none">
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        1
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          Abra no navegador Safari
                        </strong>
                        <span className="text-[#6B655E] text-xs">
                          Certifique-se de estar usando o navegador Safari padrão do seu iPhone.
                        </span>
                      </div>
                    </li>

                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        2
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold flex items-center gap-1.5">
                          Toque no botão Compartilhar <Share2 className="h-4 w-4 text-[#7A5C2E]" />
                        </strong>
                        <span className="text-[#6B655E] text-xs">
                          É o ícone de um quadrado com uma seta para cima na barra inferior do
                          Safari.
                        </span>
                      </div>
                    </li>

                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        3
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          Selecione "Adicionar à Tela de Início"
                        </strong>
                        <span className="text-[#6B655E] text-xs">
                          Role as opções para baixo até encontrar o ícone de adição (+) com esse
                          texto.
                        </span>
                      </div>
                    </li>

                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        4
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          Toque em "Adicionar" no canto superior direito
                        </strong>
                        <span className="text-[#6B655E] text-xs">
                          Pronto! O ícone dourado da Scaglioni Joias aparecerá na sua tela inicial
                          como um app nativo.
                        </span>
                      </div>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB Android */}
            <TabsContent value="android">
              <Card className="border-[#E5DFD5] bg-white shadow-xs">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#2E7D4F] text-white flex items-center justify-center">
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="font-serif text-base text-[#2D2A26]">
                        Como instalar no Android (Google Chrome ou Samsung Internet)
                      </CardTitle>
                      <CardDescription className="text-xs text-[#6B655E]">
                        Instalação rápida com suporte nativo
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-xs sm:text-sm">
                  {deferredPrompt && (
                    <div className="p-3.5 rounded-xl bg-[#F3EAD8] border border-[#C6A664] flex items-center justify-between gap-3">
                      <span className="text-xs text-[#7A5C2E] font-medium">
                        Botão de instalação direta disponível no seu aparelho:
                      </span>
                      <Button
                        size="sm"
                        onClick={handleInstallClick}
                        className="bg-[#7A5C2E] text-white text-xs shrink-0"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Instalar Agora
                      </Button>
                    </div>
                  )}

                  <ol className="space-y-3.5 list-none">
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        1
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          Toque nos 3 pontinhos (Menu) do Chrome
                        </strong>
                        <span className="text-[#6B655E] text-xs">
                          Fica localizado no canto superior direito do seu navegador móvel.
                        </span>
                      </div>
                    </li>

                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        2
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          Selecione "Instalar aplicativo" ou "Adicionar à tela inicial"
                        </strong>
                        <span className="text-[#6B655E] text-xs">
                          O Chrome exibirá a confirmação com o ícone oficial da marca.
                        </span>
                      </div>
                    </li>

                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        3
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          Confirme em "Instalar"
                        </strong>
                        <span className="text-[#6B655E] text-xs">
                          Em poucos segundos o app Scaglioni Joias estará disponível na grade de
                          aplicativos do celular.
                        </span>
                      </div>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB Desktop */}
            <TabsContent value="desktop">
              <Card className="border-[#E5DFD5] bg-white shadow-xs">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#7A5C2E] text-white flex items-center justify-center">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="font-serif text-base text-[#2D2A26]">
                        Como instalar no Computador (Chrome, Edge ou Brave)
                      </CardTitle>
                      <CardDescription className="text-xs text-[#6B655E]">
                        Perfeito para uso no balcão da loja e PDV de alta performance
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-xs sm:text-sm">
                  {deferredPrompt && (
                    <div className="p-3.5 rounded-xl bg-[#F3EAD8] border border-[#C6A664] flex items-center justify-between gap-3">
                      <span className="text-xs text-[#7A5C2E] font-medium">
                        Seu navegador detectou o app! Clique para instalar na barra de tarefas:
                      </span>
                      <Button
                        size="sm"
                        onClick={handleInstallClick}
                        className="bg-[#7A5C2E] text-white text-xs shrink-0"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Instalar no PC
                      </Button>
                    </div>
                  )}

                  <ol className="space-y-3.5 list-none">
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        1
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          No Google Chrome ou Microsoft Edge (Windows / Linux / Mac)
                        </strong>
                        <span className="text-[#6B655E] text-xs block mt-1">
                          • <strong>Barra de endereços:</strong> no lado direito da barra onde você
                          digita a URL, clique no ícone de <em>computador com seta para baixo</em>{' '}
                          (ou botão <em>"Instalar Scaglioni Joias"</em>).
                        </span>
                        <span className="text-[#6B655E] text-xs block mt-0.5">
                          • <strong>Ou pelo Menu:</strong> clique nos 3 pontinhos verticais (⋮) &gt;{' '}
                          <em>"Salvar e compartilhar"</em> ou <em>"Apps"</em> &gt;{' '}
                          <strong>"Instalar Scaglioni Joias..."</strong>.
                        </span>
                      </div>
                    </li>

                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        2
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          No Safari (macOS Sonoma ou mais recente)
                        </strong>
                        <span className="text-[#6B655E] text-xs block mt-1">
                          No menu superior do macOS com o Safari aberto, clique em{' '}
                          <strong>Arquivo</strong> &gt; <strong>"Adicionar ao Dock..."</strong>. O
                          ícone oficial da Scaglioni Joias ficará no seu Dock como aplicativo
                          nativo.
                        </span>
                      </div>
                    </li>

                    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                      <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        3
                      </span>
                      <div>
                        <strong className="block text-[#2D2A26] font-semibold">
                          Confirmação e Atalho na Área de Trabalho
                        </strong>
                        <span className="text-[#6B655E] text-xs">
                          Ao confirmar em "Instalar", o Scaglioni Joias abrirá em janela própria
                          dedicada, sem as abas do navegador, com o ícone oficial dourado e
                          desempenho otimizado para PDV e gestão.
                        </span>
                      </div>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Benefícios do PWA */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto pt-4 border-t border-[#E5DFD5]">
          <div className="p-4 rounded-xl bg-white border border-[#E5DFD5] text-center space-y-1.5">
            <div className="h-8 w-8 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E] flex items-center justify-center mx-auto">
              <Sparkles className="h-4 w-4" />
            </div>
            <h4 className="font-serif font-bold text-xs text-[#2D2A26]">Tela Cheia & Imersivo</h4>
            <p className="text-[11px] text-[#6B655E]">
              Sem a barra de abas e botões do navegador, aproveitando 100% da tela do aparelho.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E5DFD5] text-center space-y-1.5">
            <div className="h-8 w-8 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E] flex items-center justify-center mx-auto">
              <Smartphone className="h-4 w-4" />
            </div>
            <h4 className="font-serif font-bold text-xs text-[#2D2A26]">1 Toque na Tela</h4>
            <p className="text-[11px] text-[#6B655E]">
              Acesso instantâneo para revendedoras e operadores diretamente do ícone na home.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E5DFD5] text-center space-y-1.5">
            <div className="h-8 w-8 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E] flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <h4 className="font-serif font-bold text-xs text-[#2D2A26]">Sempre Atualizado</h4>
            <p className="text-[11px] text-[#6B655E]">
              Atualiza automaticamente para a versão mais recente sem precisar ir à loja de apps.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5DFD5] bg-white py-6 text-center text-xs text-[#6B655E]">
        <p className="font-serif font-semibold text-[#2D2A26]">Scaglioni Joias • Alta Joalheria</p>
        <p className="text-[11px] text-[#8C8275] mt-1">
          Todos os direitos reservados • Sistema & PWA Oficial
        </p>
      </footer>
    </div>
  )
}
