import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from 'react'
import pb from '@/lib/pocketbase/client'
import { AppUser } from '@/types'

interface AuthContextType {
  user: AppUser | null
  isLoading: boolean
  isAuthenticated: boolean
  isSuperAdmin: boolean
  isAdmin: boolean
  isOperator: boolean
  isReseller: boolean
  canManageInternal: boolean
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000 // ~12h
const VISIBILITY_THROTTLE_MS = 60 * 1000 // no máximo 1x por minuto

// Erros de rede/conectividade NÃO devem deslogar o usuário: mantém a
// sessão atual e tenta de novo na próxima janela (interval/visibility).
const isNetworkError = (err: unknown): boolean => {
  if (!err) return false
  const anyErr = err as {
    status?: number
    name?: string
    message?: string
    originalError?: unknown
  }
  if (
    anyErr.name === 'ClientResponseError' &&
    (anyErr.status === 0 || anyErr.status === undefined)
  ) {
    return true
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = (anyErr.message || '').toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('timed out') ||
    msg.includes('aborted')
  )
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const lastRefreshAtRef = useRef(0)
  const refreshInFlightRef = useRef(false)

  const syncUser = () => {
    if (pb.authStore.isValid && pb.authStore.model) {
      const model = pb.authStore.model
      setUser({
        id: model.id,
        email: model.email,
        name: model.name || model.email.split('@')[0],
        avatar: model.avatar,
        role: model.role || 'reseller',
        status: model.status || 'pending',
        phone: model.phone,
        document: model.document,
        city: model.city,
        state: model.state,
        notes: model.notes,
        created: model.created,
        updated: model.updated,
      })
    } else {
      setUser(null)
    }
    setIsLoading(false)
  }

  // Refresh automático do token de autenticação: renova a sessão antes de
  // o JWT expirar. Só desloga quando o servidor confirma que o token é
  // inválido/expirado (401/403); erro de rede mantém o usuário logado.
  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (!pb.authStore.isValid || !pb.authStore.model?.id) return false
    if (refreshInFlightRef.current) return true
    refreshInFlightRef.current = true
    try {
      await pb.collection('users').authRefresh()
      lastRefreshAtRef.current = Date.now()
      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        // Sem conexão: mantém a sessão com o token atual, tenta novamente depois.
        console.warn('authRefresh falhou por rede — sessão mantida.', err)
        return false
      }
      const anyErr = err as { status?: number }
      if (anyErr.status === 401 || anyErr.status === 403) {
        // Token realmente inválido/expirado ou usuário desativado: limpa sessão.
        console.error('Sessão inválida — encerrando autenticação.', err)
        pb.authStore.clear()
        setUser(null)
        return false
      }
      // Outro erro inesperado do servidor: mantém a sessão e tenta depois.
      console.warn('authRefresh falhou (mantendo sessão):', err)
      return false
    } finally {
      refreshInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    syncUser()
    const unsubscribe = pb.authStore.onChange(() => {
      syncUser()
    })

    // (a) Refresh periódico a cada ~12h
    const intervalId = window.setInterval(() => {
      void refreshSession()
    }, REFRESH_INTERVAL_MS)

    // (b) Refresh ao recuperar o foco da aba (throttle 1x por minuto)
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (!pb.authStore.isValid) return
      const elapsed = Date.now() - lastRefreshAtRef.current
      if (elapsed < VISIBILITY_THROTTLE_MS) return
      lastRefreshAtRef.current = Date.now()
      void refreshSession()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onVisibilityChange)

    return () => {
      unsubscribe()
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onVisibilityChange)
    }
  }, [refreshSession])

  const refreshUser = useCallback(async () => {
    // Usa authRefresh (renova token + record); cai para getOne só se
    // authRefresh não estiver disponível por algum motivo.
    const refreshed = await refreshSession()
    if (!refreshed && pb.authStore.isValid && pb.authStore.model?.id) {
      try {
        const fresh = await pb.collection('users').getOne(pb.authStore.model.id)
        pb.authStore.save(pb.authStore.token, fresh)
        syncUser()
      } catch (err) {
        console.error('Erro ao atualizar usuário:', err)
      }
    }
  }, [refreshSession])

  const login = async (email: string, pass: string) => {
    try {
      const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
      const u = authData.record
      const status = u.status || 'pending'

      if (status !== 'active') {
        pb.authStore.clear()
        setUser(null)
        if (status === 'pending') {
          return {
            success: false,
            error:
              'Seu cadastro está aguardando aprovação pelo administrador. Entre em contato ou aguarde a liberação.',
          }
        }
        if (status === 'rejected') {
          return {
            success: false,
            error:
              'Seu cadastro foi reprovado. Entre em contato com a administração da Scaglioni Joias.',
          }
        }
        if (status === 'disabled') {
          return {
            success: false,
            error: 'Seu acesso foi desativado. Entre em contato com o administrador.',
          }
        }
      }

      lastRefreshAtRef.current = Date.now()
      syncUser()
      return { success: true }
    } catch (_err: unknown) {
      return { success: false, error: 'E-mail ou senha incorretos. Verifique suas credenciais.' }
    }
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
  }

  const role = user?.role
  const status = user?.status
  const isAuthenticated = Boolean(user && status === 'active')
  const isSuperAdmin = role === 'superadmin' && isAuthenticated
  const isAdmin = (role === 'superadmin' || role === 'admin') && isAuthenticated
  const isOperator =
    (role === 'superadmin' || role === 'operator' || role === 'admin') && isAuthenticated
  const isReseller = role === 'reseller' && isAuthenticated
  const canManageInternal =
    (role === 'superadmin' || role === 'admin' || role === 'operator') && isAuthenticated

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      isSuperAdmin,
      isAdmin,
      isOperator,
      isReseller,
      canManageInternal,
      login,
      logout,
      refreshUser,
    }),
    [
      user,
      isLoading,
      isAuthenticated,
      isSuperAdmin,
      isAdmin,
      isOperator,
      isReseller,
      canManageInternal,
      refreshUser,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
