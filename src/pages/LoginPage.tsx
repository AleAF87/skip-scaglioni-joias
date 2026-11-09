import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, Mail, ArrowRight, AlertCircle, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { APP_VERSION } from '@/version'
import { LOGO_FULL_URL } from '@/constants/branding'

/**
 * TELA DE LOGIN — tema escuro (preto/grafite) com detalhes dourados (v0.0.141).
 * A logo tem fundo preto e foi integrada sem moldura/borda.
 * O visual anterior (claro/creme) está salvo em `src/pages/LoginPage.backup.tsx`
 * para reversão rápida, caso o usuário não goste.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setLoading(true)

    try {
      const res = await login(email, password)
      if (res.success) {
        toast.success('Bem-vindo à Scaglioni Joias!')
        navigate(from, { replace: true })
      } else {
        setErrorMessage(res.error || 'Credenciais inválidas.')
      }
    } catch (err: any) {
      setErrorMessage('Falha ao autenticar: verifique suas informações.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#0B0B0D] overflow-hidden">
      {/* Detalhes dourados sutis no fundo (radiais decorativos) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(600px 400px at 15% 10%, rgba(198,166,100,0.10), transparent 60%),' +
            'radial-gradient(700px 500px at 85% 90%, rgba(198,166,100,0.08), transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C6A664]/50 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#C6A664]/50 to-transparent"
      />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Brand Header — logo integrada ao fundo escuro, sem moldura */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center mx-auto max-w-[300px]">
              <img
                src={LOGO_FULL_URL}
                alt="Scaglioni Joias"
                className="w-full h-auto max-h-24 sm:max-h-28 object-contain mix-blend-screen"
              />
            </div>
            <p className="text-xs uppercase tracking-widest text-[#C6A664] font-semibold">
              Sistema de Gestão & Revendedoras
            </p>
          </div>

          {/* Login Card — vidro escuro legível */}
          <div className="rounded-2xl overflow-hidden border border-[#C6A664]/25 bg-[#141416]/80 backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
            <div className="text-center pb-2 pt-6 px-6">
              <h1 className="font-serif text-xl text-[#F5EFE3]">Acesso ao Sistema</h1>
              <p className="text-xs text-[#A79E90] mt-1">
                Informe suas credenciais para acessar a plataforma
              </p>
            </div>

            <div className="p-6 pt-2 space-y-4">
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-[#B3261E]/15 border border-[#B3261E]/40 text-sm text-[#F1A9A5] flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-[#E8E2D6]">E-mail</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#8C8275]" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="seu@email.com"
                      className="pl-9 border-[#3A3A3E] bg-[#1D1D20]/80 text-[#F5EFE3] placeholder:text-[#6B655E] focus-visible:ring-[#C6A664] focus-visible:border-[#C6A664]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-[#E8E2D6]">Senha</Label>
                    <Link
                      to="/recuperar-senha"
                      className="text-xs text-[#C6A664] hover:underline font-medium"
                    >
                      Esqueci minha senha
                    </Link>
                  </div>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#8C8275]" />
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="pl-9 border-[#3A3A3E] bg-[#1D1D20]/80 text-[#F5EFE3] placeholder:text-[#6B655E] focus-visible:ring-[#C6A664] focus-visible:border-[#C6A664]"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-r from-[#7A5C2E] via-[#C6A664] to-[#7A5C2E] hover:opacity-90 text-[#141416] font-bold text-sm shadow-md"
                >
                  {loading ? 'Acessando...' : 'Entrar no Sistema'}
                </Button>
              </form>

              {/* Convite a revendedora — bem destacado, botão dourado */}
              <div className="pt-4 border-t border-[#C6A664]/20 text-center space-y-3">
                <p className="text-lg font-bold text-[#F5EFE3]">Deseja ser revendedor da marca?</p>
                <Link
                  to="/solicitar-revendedor"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl h-12 px-4 text-base font-bold text-[#141416] bg-gradient-to-r from-[#7A5C2E] via-[#C6A664] to-[#7A5C2E] shadow-[0_4px_18px_rgba(198,166,100,0.35)] hover:opacity-90 transition-opacity"
                >
                  Solicitar Cadastro de Revendedor <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Instalar aplicativo — mantido, mais discreto */}
          <div className="text-center">
            <Link
              to="/instalar"
              className="inline-flex items-center gap-1.5 text-[11px] text-[#6B655E] hover:text-[#8C8275] font-medium transition-colors"
            >
              <Smartphone className="h-3 w-3" />
              <span>Instalar Aplicativo no Celular / PC</span>
            </Link>
          </div>

          {/* Version indicator */}
          <div className="text-center">
            <span className="text-[11px] text-[#5C554B] font-mono">
              Scaglioni Joias • v{APP_VERSION}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
