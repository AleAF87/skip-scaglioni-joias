import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Sparkles, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    try {
      await pb.collection('users').requestPasswordReset(email.trim())
      setSentSuccess(true)
      toast.success('Link de recuperação enviado com sucesso!')
    } catch (err: any) {
      toast.error('Erro ao enviar solicitação: verifique o e-mail informado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#7A5C2E] to-[#C6A664] flex items-center justify-center text-white shadow-md">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-[#2D2A26]">Recuperação de Acesso</h1>
        </div>

        <Card className="border-[#E5DFD5] bg-white shadow-lg rounded-2xl p-6">
          {sentSuccess ? (
            <div className="text-center space-y-4 py-4">
              <CheckCircle2 className="h-12 w-12 text-[#2E7D4F] mx-auto" />
              <h2 className="font-serif text-lg font-bold text-[#2D2A26]">E-mail Enviado!</h2>
              <p className="text-xs text-[#6B655E]">
                Enviamos as instruções e o link seguro para redefinição de senha para{' '}
                <strong>{email}</strong>.
              </p>
              <Link to="/login" className="inline-block mt-4">
                <Button variant="outline" className="border-[#7A5C2E] text-[#7A5C2E]">
                  Voltar ao Login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-[#6B655E]">
                Digite o e-mail cadastrado em sua conta. Enviaremos um link para você redefinir sua
                senha com segurança.
              </p>

              <div>
                <Label className="text-xs font-semibold">E-mail Cadastrado</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="seu.email@exemplo.com"
                    className="pl-9"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#7A5C2E] text-white font-semibold"
              >
                {loading ? 'Enviando...' : 'Enviar Link de Redefinição'}
              </Button>

              <div className="text-center pt-2">
                <Link
                  to="/login"
                  className="text-xs text-[#7A5C2E] hover:underline inline-flex items-center"
                >
                  <ArrowLeft className="h-3 w-3 mr-1" /> Voltar ao Login
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
