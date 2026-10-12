import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  Mic,
  Gem,
  Boxes,
  ShoppingCart,
  Users2,
  Handshake,
  Store,
  UserCheck,
  User,
  LogOut,
  Menu,
  X,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export default function Layout() {
  const { user, isAdmin, isOperator, isReseller, canManageInternal, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  if (!user) {
    return (
      <main className="min-h-screen bg-[#FDFBF7]">
        <Outlet />
      </main>
    )
  }

  // Navigation Links
  const navItems = [
    ...(canManageInternal ? [{ to: '/dashboard', label: 'Painel', icon: LayoutDashboard }] : []),
    ...(canManageInternal
      ? [{ to: '/voz', label: 'Cadastro por Voz', icon: Mic, highlight: true }]
      : []),
    ...(canManageInternal
      ? [
          { to: '/produtos', label: 'Produtos', icon: Gem },
          { to: '/estoque', label: 'Estoque', icon: Boxes },
          { to: '/pdv', label: 'PDV / Vendas', icon: ShoppingCart },
        ]
      : []),
    { to: '/vitrine', label: 'Vitrine', icon: Store },
    { to: '/consignacoes', label: 'Consignação', icon: Handshake },
    ...(isAdmin || (canManageInternal && !isReseller)
      ? [{ to: '/revendedores', label: 'Revendedores', icon: Users2 }]
      : []),
    ...(isAdmin ? [{ to: '/usuarios', label: 'Gestão de Usuários', icon: UserCheck }] : []),
    { to: '/perfil', label: 'Meu Perfil', icon: User },
  ]

  // Mobile Bottom bar items (focused on mobile-first navigation)
  const mobileBottomItems = [
    ...(canManageInternal ? [{ to: '/dashboard', label: 'Painel', icon: LayoutDashboard }] : []),
    ...(canManageInternal ? [{ to: '/pdv', label: 'PDV', icon: ShoppingCart }] : []),
    ...(canManageInternal ? [{ to: '/voz', label: 'Voz IA', icon: Mic, center: true }] : []),
    { to: '/vitrine', label: 'Vitrine', icon: Store },
    { to: '/consignacoes', label: 'Consign.', icon: Handshake },
    { to: '/perfil', label: 'Perfil', icon: User },
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-[#FDFBF7] text-[#2D2A26]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-[#E5DFD5] bg-[#FFFFFF] shadow-sm">
        {/* Brand Header */}
        <div className="p-6 border-b border-[#E5DFD5]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] flex items-center justify-center text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-bold tracking-tight text-[#2D2A26]">
                Scaglioni Joias
              </h1>
              <p className="text-xs text-[#6B655E] uppercase tracking-wider font-medium">
                Alta Joalheria
              </p>
            </div>
          </div>
        </div>

        {/* User Card info in sidebar */}
        <div className="px-5 py-3 mx-4 my-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]/80 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[#C6A664]/20 border border-[#C6A664]/40 flex items-center justify-center text-[#7A5C2E] font-semibold text-sm">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-[#2D2A26]">{user.name}</p>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#2E7D4F]" />
              <span className="text-xs text-[#6B655E] capitalize font-medium">
                {user.role === 'admin'
                  ? 'Administrador'
                  : user.role === 'operator'
                    ? 'Operador'
                    : 'Revendedor'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname.startsWith(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[#C6A664]/15 text-[#7A5C2E] font-semibold shadow-xs'
                    : 'text-[#6B655E] hover:bg-[#F3EAD8]/60 hover:text-[#2D2A26]',
                  item.highlight &&
                    !isActive &&
                    'border border-[#C6A664]/40 bg-[#C6A664]/5 text-[#7A5C2E]',
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn('h-4 w-4', isActive ? 'text-[#7A5C2E]' : 'text-[#6B655E]')} />
                  <span>{item.label}</span>
                </div>
                {item.highlight && (
                  <span className="text-[10px] bg-[#C6A664] text-white px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                    IA
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#E5DFD5]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#B3261E] hover:bg-[#B3261E]/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5DFD5] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-[#7A5C2E] to-[#C6A664] flex items-center justify-center text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <span className="font-serif text-base font-bold text-[#2D2A26]">Scaglioni Joias</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-[#2D2A26]"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {/* Mobile Drawer Navigation if menu toggled */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-[#2D2A26]/50 backdrop-blur-xs flex flex-col">
            <div className="bg-[#FFFFFF] w-4/5 max-w-xs h-full flex flex-col p-5 shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between pb-4 border-b border-[#E5DFD5]">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-[#C6A664] flex items-center justify-center text-white">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <span className="font-serif font-bold text-lg">Scaglioni</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-[#6B655E] hover:bg-[#F3EAD8]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="py-4">
                <p className="text-sm font-semibold text-[#2D2A26]">{user.name}</p>
                <p className="text-xs text-[#6B655E] capitalize">{user.role}</p>
              </div>

              <nav className="flex-1 overflow-y-auto space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname.startsWith(item.to)
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-[#C6A664]/15 text-[#7A5C2E] font-semibold'
                          : 'text-[#6B655E] hover:bg-[#F3EAD8]',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#C6A664]" />
                    </NavLink>
                  )
                })}
              </nav>

              <div className="pt-4 border-t border-[#E5DFD5]">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-[#B3261E] hover:bg-[#B3261E]/10 rounded-xl"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sair da conta</span>
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Page Outlet */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] border-t border-[#E5DFD5] px-2 py-1.5 flex items-center justify-around shadow-lg">
          {mobileBottomItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname.startsWith(item.to)

            if (item.center) {
              return (
                <NavLink key={item.to} to={item.to} className="flex flex-col items-center -mt-5">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] shadow-lg flex items-center justify-center text-white ring-4 ring-[#FFFFFF]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="text-[10px] font-bold text-[#7A5C2E] mt-1">Voz IA</span>
                </NavLink>
              )
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors',
                  isActive ? 'text-[#7A5C2E]' : 'text-[#6B655E] hover:text-[#2D2A26]',
                )}
              >
                <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5px]')} />
                <span className={cn('text-[10px] mt-0.5', isActive ? 'font-bold' : 'font-medium')}>
                  {item.label}
                </span>
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
