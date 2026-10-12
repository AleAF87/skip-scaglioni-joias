import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { AppUser } from '@/types'

interface AuthContextType {
  user: AppUser | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  isOperator: boolean
  isReseller: boolean
  canManageInternal: boolean
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  useEffect(() => {
    syncUser()
    const unsubscribe = pb.authStore.onChange(() => {
      syncUser()
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const refreshUser = async () => {
    if (pb.authStore.isValid && pb.authStore.model?.id) {
      try {
        const fresh = await pb.collection('users').getOne(pb.authStore.model.id)
        pb.authStore.save(pb.authStore.token, fresh)
        syncUser()
      } catch (err) {
        console.error('Erro ao atualizar usuário:', err)
      }
    }
  }

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

      syncUser()
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao autenticar.'
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
  const isAdmin = role === 'admin' && isAuthenticated
  const isOperator = (role === 'operator' || role === 'admin') && isAuthenticated
  const isReseller = role === 'reseller' && isAuthenticated
  const canManageInternal = (role === 'admin' || role === 'operator') && isAuthenticated

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      isAdmin,
      isOperator,
      isReseller,
      canManageInternal,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading, isAuthenticated, isAdmin, isOperator, isReseller, canManageInternal],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
