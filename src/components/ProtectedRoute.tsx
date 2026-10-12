import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { UserRole } from '@/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#FDFBF7]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#C6A664] border-t-transparent" />
          <p className="font-serif text-lg text-[#2D2A26]">Scaglioni Joias</p>
          <span className="text-sm text-[#6B655E]">Carregando acesso...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // If reseller tries to access operator/admin area, send to vitrine or consignações
    if (user.role === 'reseller') {
      return <Navigate to="/consignacoes" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
