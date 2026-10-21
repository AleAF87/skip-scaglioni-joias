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
          <div className="bg-black p-3 rounded-2xl shadow-md border border-[#C6A664]/50 animate-pulse">
            <img
              src="/logo-scaglioni-icon.png"
              alt="Scaglioni Joias"
              className="h-10 w-10 object-contain"
            />
          </div>
          <p className="font-serif text-lg text-[#2D2A26]">Scaglioni Joias</p>
          <span className="text-xs text-[#6B655E]">Carregando acesso seguro...</span>
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
