import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Lock, Mail, ArrowRight, AlertCircle, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { APP_VERSION } from '@/version'
import { LOGO_FULL_URL } from '@/constants/branding'

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
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header com a Logo Oficial da Marca */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center bg-[#000000] p-4 sm:p-5 rounded-2xl shadow-xl border border-[#C6A664]/40 mx-auto max-w-[280px]">
            <img
              src={LOGO_FULL_URL}
              alt="Scaglioni Joias"
              className="w-full h-auto max-h-20 sm:max-h-24 object-contain"
            />
          </div>
          <p className="text-xs uppercase tracking-widest text-[#7A5C2E] font-semibold">
            Sistema de Gestão & Consignação
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-[#E5DFD5] bg-white shadow-lg rounded-2xl overflow-hidden">
          <CardHeader className="text-center pb-2 pt-6">
            <CardTitle className="font-serif text-xl text-[#2D2A26]">Acesso ao Sistema</CardTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Informe suas credenciais para acessar a plataforma
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 pt-2 space-y-4">
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-[#B3261E]/10 border border-[#B3261E]/30 text-xs text-[#B3261E] flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">E-mail</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="drcesartadeu@gmail.com"
                    className="pl-9 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-[#2D2A26]">Senha</Label>
                  <Link
                    to="/recuperar-senha"
                    className="text-xs text-[#7A5C2E] hover:underline font-medium"
                  >
                    Esqueci minha senha
                  </Link>
                </div>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="pl-9 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-gradient-to-r from-[#7A5C2E] via-[#C6A664] to-[#7A5C2E] hover:opacity-95 text-white font-semibold text-sm shadow-md"
              >
                {loading ? 'Acessando...' : 'Entrar no Sistema'}
              </Button>
            </form>

            <div className="pt-4 border-t border-[#E5DFD5] text-center space-y-2">
              <p className="text-xs text-[#6B655E]">Deseja ser revendedor da marca?</p>
              <Link
                to="/solicitar-revendedor"
                className="inline-flex items-center text-xs font-bold text-[#7A5C2E] hover:underline"
              >
                Solicitar Cadastro de Revendedor <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
              <div>
                <Link
                  to="/instalar"
                  className="inline-flex items-center gap-1.5 text-xs text-[#6B655E] hover:text-[#7A5C2E] font-medium transition-colors mt-1"
                >
                  <Smartphone className="h-3.5 w-3.5 text-[#C6A664]" />
                  <span>Instalar Aplicativo no Celular / PC</span>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Demo Credentials hint box for ease of testing */}
        <div className="p-4 rounded-xl bg-[#F3EAD8]/70 border border-[#C6A664]/30 text-xs text-[#6B655E] space-y-1">
          <p className="font-bold text-[#7A5C2E]">Acesso rápido para avaliação (Seeds):</p>
          <p>
            • <strong>Administrador:</strong> drcesartadeu@gmail.com / Skip@Pass
          </p>
          <p>
            • <strong>Operador:</strong> operador@scaglionijoias.com.br / Skip@Pass
          </p>
          <p>
            • <strong>Revendedora:</strong> revendedora@scaglionijoias.com.br / Skip@Pass
          </p>
        </div>

        {/* Version indicator */}
        <div className="text-center">
          <span className="text-xs text-[#8C8275] font-mono">Scaglioni Joias • v{APP_VERSION}</span>
        </div>
      </div>
    </div>
  )
}
