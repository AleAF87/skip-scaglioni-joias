import React, { useState, useEffect } from 'react'
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
  ChevronRight,
  PackageCheck,
  RotateCcw,
  BadgeDollarSign,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  Zap,
  FileSpreadsheet,
  Tag,
  Bot,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { APP_VERSION } from '@/version'
import { LOGO_FULL_URL, LOGO_ICON_URL } from '@/constants/branding'

const SIDEBAR_COLLAPSED_KEY = 'scaglioni_sidebar_collapsed'

interface NavItemDef {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  highlight?: boolean
  badgeText?: string
  isRestricted?: boolean
}

export default function Layout() {
  const { user, isSuperAdmin, isAdmin, isOperator, isReseller, canManageInternal, logout } =
    useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      return saved === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }
  const navigate = useNavigate()
  const location = useLocation()

  if (!user) {
    return (
      <main className="min-h-screen bg-[#FDFBF7]">
        <Outlet />
      </main>
    )
  }

  // Item de PDV destacado no topo
  const posItem = canManageInternal
    ? {
        to: '/pdv',
        label: 'PDV Loja (Frente de Caixa)',
        shortLabel: 'PDV Loja',
        icon: ShoppingCart,
        badge: 'Balcão',
      }
    : {
        to: '/revendedora/pdv',
        label: 'Meu PDV (Vendas Rápidas)',
        shortLabel: 'Meu PDV',
        icon: ShoppingCart,
        badge: 'Vender',
      }

  // Demais itens de navegação
  // Para superadmin: NADA fica oculto ou bloqueado. Todas as páginas restritas aparecem no menu
  // com destaque visual em vermelho (text-red-600, badge 'Restrito').
  // Para os demais perfis (admin, operator, reseller): o menu se comporta exatamente como antes.
  const navItems: NavItemDef[] = isSuperAdmin
    ? [
        { to: '/', label: 'Painel Geral', icon: LayoutDashboard },
        { to: '/produtos', label: 'Cadastrar Produtos', icon: Boxes },
        { to: '/estoque', label: 'Estoque', icon: Boxes },
        { to: '/etiquetas', label: 'Gerar Etiquetas', icon: Tag },
        {
          to: '/revendedoras',
          label: 'Revendedoras',
          icon: Users2,
        },
        {
          to: '/revendedora/financeiro',
          label: 'Lucro & Financeiro Vendedoras',
          icon: BadgeDollarSign,
        },
        {
          to: '/revendedora/devolucoes-pendencias',
          label: 'Devoluções & Pendências',
          icon: RotateCcw,
        },
        { to: '/vitrine', label: 'Vitrine de Joias', icon: Store },
        // Páginas restritas a nível superior exibidas em vermelho
        {
          to: '/voz',
          label: 'Cadastro por Voz',
          icon: Mic,
          isRestricted: true,
        },
        {
          to: '/auxiliares',
          label: 'Catálogo de Joias',
          icon: Gem,
          isRestricted: true,
        },
        {
          to: '/categorias',
          label: 'Categorias',
          icon: Tag,
        },
        {
          to: '/usuarios',
          label: 'Gestão de Usuários',
          icon: UserCheck,
          isRestricted: true,
        },
        {
          to: '/importar-tecson',
          label: 'Importar Tecson',
          icon: FileSpreadsheet,
          isRestricted: true,
        },
        {
          to: '/importar-scaglioni',
          label: 'Importar Scaglioni',
          icon: FileSpreadsheet,
          isRestricted: true,
        },
        {
          to: '/empresa',
          label: 'Dados da Empresa (Contrato)',
          icon: Building2,
          isRestricted: true,
        },
        {
          to: '/automacao',
          label: 'Automação',
          icon: Bot,
          isRestricted: true,
        },
        { to: '/instalar', label: 'Instalar o App (PWA)', icon: Download, badgeText: 'App' },
        { to: '/perfil', label: 'Meu Perfil', icon: User },
      ]
    : [
        ...(canManageInternal ? [{ to: '/', label: 'Painel Geral', icon: LayoutDashboard }] : []),
        ...(canManageInternal
          ? [{ to: '/produtos', label: 'Cadastrar Produtos', icon: Boxes }]
          : []),
        ...(canManageInternal ? [{ to: '/estoque', label: 'Estoque', icon: Boxes }] : []),
        ...(canManageInternal && !isReseller
          ? [{ to: '/etiquetas', label: 'Gerar Etiquetas', icon: Tag }]
          : []),

        // PÁGINA UNIFICADA: Revendedoras (substitui Consignações e Entregas)
        {
          to: '/revendedoras',
          label: 'Revendedoras',
          icon: Users2,
          highlight: !canManageInternal,
        },
        {
          to: '/revendedora/financeiro',
          label: canManageInternal ? 'Lucro & Financeiro Vendedoras' : 'Meu Lucro & Acerto',
          icon: BadgeDollarSign,
        },
        {
          to: '/revendedora/devolucoes-pendencias',
          label: canManageInternal ? 'Devoluções & Pendências' : 'Minhas Devoluções & Pendências',
          icon: RotateCcw,
        },

        { to: '/vitrine', label: 'Vitrine de Joias', icon: Store },
        ...(isAdmin || (canManageInternal && !isReseller)
          ? [{ to: '/categorias', label: 'Categorias', icon: Tag }]
          : []),
        ...(isAdmin ? [{ to: '/usuarios', label: 'Gestão de Usuários', icon: UserCheck }] : []),
        ...(isAdmin
          ? [
              {
                to: '/importar-tecson',
                label: 'Importar Tecson',
                icon: FileSpreadsheet,
              },
              {
                to: '/importar-scaglioni',
                label: 'Importar Scaglioni',
                icon: FileSpreadsheet,
              },
            ]
          : []),
        ...(isAdmin
          ? [{ to: '/empresa', label: 'Dados da Empresa (Contrato)', icon: Building2 }]
          : []),
        ...(isAdmin ? [{ to: '/automacao', label: 'Automação', icon: Bot }] : []),
        { to: '/instalar', label: 'Instalar o App (PWA)', icon: Download, badgeText: 'App' },
        { to: '/perfil', label: 'Meu Perfil', icon: User },
      ]

  // Mobile Bottom bar items (focused on mobile-first navigation)
  const mobileBottomItems = [
    ...(canManageInternal
      ? [{ to: '/', label: 'Painel', icon: LayoutDashboard }]
      : [{ to: '/revendedoras', label: 'Revendedora', icon: Users2 }]),
    ...(canManageInternal
      ? [{ to: '/pdv', label: 'PDV', icon: ShoppingCart }]
      : [{ to: '/revendedora/pdv', label: 'Meu PDV', icon: ShoppingCart }]),
    ...(canManageInternal
      ? [{ to: '/produtos', label: 'Cadastrar Produtos', icon: Boxes, center: true }]
      : [{ to: '/revendedora/financeiro', label: 'Lucro', icon: BadgeDollarSign }]),
    { to: '/vitrine', label: 'Vitrine', icon: Store },
    { to: '/perfil', label: 'Perfil', icon: User },
  ]
  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isPosActive = location.pathname.startsWith(posItem.to)

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen bg-[#FDFBF7] text-[#2D2A26]">
        {/* Desktop Sidebar (Recolhível ou Expandido) */}
        <aside
          className={cn(
            'hidden lg:flex flex-col border-r border-[#E5DFD5] bg-[#FFFFFF] shadow-sm transition-all duration-300 relative',
            sidebarCollapsed ? 'w-20' : 'w-64',
          )}
        >
          {/* Botão de Toggle Expandir / Recolher */}
          <div className="absolute -right-3.5 top-6 z-20">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
                  className="h-7 w-7 rounded-full bg-white border border-[#E5DFD5] shadow-md flex items-center justify-center text-[#7A5C2E] hover:bg-[#F3EAD8] hover:text-[#2D2A26] transition-colors"
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher para modo compacto'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Brand Header */}
          <div
            className={cn(
              'border-b border-[#E5DFD5] bg-[#000000]',
              sidebarCollapsed ? 'p-3 flex justify-center' : 'p-4',
            )}
          >
            {sidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink to="/" className="block focus:outline-hidden">
                    <img
                      src={LOGO_ICON_URL}
                      alt="Scaglioni Joias"
                      className="h-10 w-10 object-contain rounded-lg hover:scale-105 transition-transform"
                    />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <strong>Scaglioni Joias</strong> — Alta Joalheria
                </TooltipContent>
              </Tooltip>
            ) : (
              <NavLink to="/" className="block focus:outline-hidden">
                <img
                  src={LOGO_FULL_URL}
                  alt="Scaglioni Joias"
                  className="h-11 w-auto max-w-[200px] object-contain mx-auto"
                />
              </NavLink>
            )}
          </div>

          {/* User Card info in sidebar */}
          <div
            className={cn(
              'my-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]/80 flex items-center transition-all',
              sidebarCollapsed ? 'mx-2 p-2 justify-center' : 'mx-4 px-4 py-2.5 gap-3',
            )}
          >
            {sidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-9 w-9 rounded-full bg-[#C6A664]/25 border border-[#C6A664]/50 flex items-center justify-center text-[#7A5C2E] font-bold text-sm cursor-default">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-xs text-[#6B655E] capitalize">{user.role}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                <div className="h-9 w-9 rounded-full bg-[#C6A664]/20 border border-[#C6A664]/40 flex items-center justify-center text-[#7A5C2E] font-semibold text-sm shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-[#2D2A26]">{user.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#2E7D4F]" />
                    <span className="text-xs text-[#6B655E] font-medium">
                      {user.role === 'superadmin'
                        ? 'Super Administrador'
                        : user.role === 'admin'
                          ? 'Administrador'
                          : user.role === 'operator'
                            ? 'Operador'
                            : 'Revendedor'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ITEM 3: PDV EM DESTAQUE NO TOPO DO MENU */}
          <div className={cn('pb-2', sidebarCollapsed ? 'px-2' : 'px-3')}>
            {sidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to={posItem.to}
                    className={cn(
                      'flex items-center justify-center h-12 w-full rounded-xl transition-all duration-200 border relative shadow-xs',
                      isPosActive
                        ? 'bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#7A5C2E] text-white border-[#7A5C2E] shadow-md ring-2 ring-[#C6A664]/40'
                        : 'bg-gradient-to-r from-[#F3EAD8] to-[#FDFBF7] text-[#7A5C2E] border-[#C6A664]/60 hover:bg-[#F3EAD8] hover:border-[#C6A664]',
                    )}
                  >
                    <posItem.icon
                      className={cn('h-5 w-5', isPosActive ? 'text-white' : 'text-[#7A5C2E]')}
                    />
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C6A664] opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#7A5C2E]" />
                    </span>
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="font-semibold text-xs">{posItem.label}</div>
                  <span className="text-[10px] text-amber-600 font-bold uppercase">
                    Acesso Rápido ao PDV
                  </span>
                </TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                to={posItem.to}
                className={cn(
                  'flex items-center justify-between gap-3 p-3 rounded-2xl text-sm font-semibold transition-all duration-200 border shadow-xs group',
                  isPosActive
                    ? 'bg-gradient-to-r from-[#7A5C2E] via-[#A88742] to-[#7A5C2E] text-white border-[#7A5C2E] shadow-md ring-2 ring-[#C6A664]/50'
                    : 'bg-gradient-to-r from-[#F8F3EA] via-[#FFFFFF] to-[#F3EAD8] text-[#7A5C2E] border-[#C6A664]/70 hover:border-[#7A5C2E] hover:shadow-md',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-colors',
                      isPosActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#7A5C2E] text-white group-hover:scale-105',
                    )}
                  >
                    <posItem.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span
                      className={cn(
                        'block font-serif text-sm font-bold tracking-tight truncate',
                        isPosActive ? 'text-white' : 'text-[#2D2A26]',
                      )}
                    >
                      {posItem.shortLabel}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-normal block truncate',
                        isPosActive ? 'text-white/85' : 'text-[#7A5C2E]',
                      )}
                    >
                      {canManageInternal ? 'Frente de Caixa' : 'Venda Rápida'}
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full shrink-0 shadow-2xs flex items-center gap-1',
                    isPosActive
                      ? 'bg-white text-[#7A5C2E]'
                      : 'bg-[#7A5C2E] text-white group-hover:bg-[#5E441D]',
                  )}
                >
                  <Zap className="h-2.5 w-2.5" />
                  {posItem.badge}
                </span>
              </NavLink>
            )}
            <div className="my-2 border-b border-[#E5DFD5]" />
          </div>

          {/* Navigation list */}
          <nav
            className={cn('flex-1 overflow-y-auto space-y-1', sidebarCollapsed ? 'px-2' : 'px-3')}
          >
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname.startsWith(item.to)

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.to}
                        className={cn(
                          'flex items-center justify-center h-10 w-full rounded-xl transition-all duration-150',
                          item.isRestricted
                            ? isActive
                              ? 'bg-red-100 text-red-600 font-bold shadow-xs'
                              : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                            : isActive
                              ? 'bg-[#C6A664]/20 text-[#7A5C2E] font-bold shadow-xs'
                              : 'text-[#6B655E] hover:bg-[#F3EAD8]/70 hover:text-[#2D2A26]',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5',
                            item.isRestricted
                              ? 'text-red-600'
                              : isActive
                                ? 'text-[#7A5C2E]'
                                : 'text-[#6B655E]',
                          )}
                        />
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <span>{item.label}</span>
                      {item.isRestricted && (
                        <span className="ml-1.5 text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                          Restrito
                        </span>
                      )}
                      {item.highlight && (
                        <span className="ml-1.5 text-[9px] bg-[#C6A664] text-white px-1 py-0.2 rounded font-bold uppercase">
                          IA
                        </span>
                      )}
                      {item.badgeText && (
                        <span className="ml-1.5 text-[9px] bg-[#7A5C2E] text-white px-1 py-0.2 rounded font-bold uppercase">
                          {item.badgeText}
                        </span>
                      )}{' '}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                    item.isRestricted
                      ? isActive
                        ? 'bg-red-50 text-red-600 font-semibold shadow-xs border border-red-200'
                        : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                      : isActive
                        ? 'bg-[#C6A664]/15 text-[#7A5C2E] font-semibold shadow-xs'
                        : 'text-[#6B655E] hover:bg-[#F3EAD8]/60 hover:text-[#2D2A26]',
                    item.highlight &&
                      !isActive &&
                      !item.isRestricted &&
                      'border border-[#C6A664]/40 bg-[#C6A664]/5 text-[#7A5C2E]',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        item.isRestricted
                          ? 'text-red-600'
                          : isActive
                            ? 'text-[#7A5C2E]'
                            : 'text-[#6B655E]',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.isRestricted && (
                    <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0 shadow-2xs">
                      Restrito
                    </span>
                  )}
                  {item.highlight && (
                    <span className="text-[10px] bg-[#C6A664] text-white px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0">
                      IA
                    </span>
                  )}
                  {item.badgeText && (
                    <span className="text-[10px] bg-[#F3EAD8] text-[#7A5C2E] border border-[#C6A664]/50 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0">
                      {item.badgeText}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* Sidebar Footer */}
          <div
            className={cn(
              'border-t border-[#E5DFD5]',
              sidebarCollapsed ? 'p-2 space-y-2' : 'p-3 space-y-2',
            )}
          >
            {sidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center h-10 rounded-xl text-[#B3261E] hover:bg-[#B3261E]/10 transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Encerrar Sessão</TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#B3261E] hover:bg-[#B3261E]/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Encerrar Sessão</span>
              </button>
            )}
            <div className="text-center pt-1">
              <span className="text-[10px] text-[#8C8275] font-mono">v{APP_VERSION}</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
          {/* Mobile Header com a logo oficial */}
          <header className="lg:hidden sticky top-0 z-40 bg-[#000000] border-b border-[#333333] px-4 py-2.5 flex items-center justify-between shadow-md">
            <NavLink to="/" className="flex items-center">
              <img
                src={LOGO_FULL_URL}
                alt="Scaglioni Joias"
                className="h-9 w-auto max-w-[170px] sm:max-w-[210px] object-contain"
              />
            </NavLink>

            <div className="flex items-center gap-1.5">
              <NavLink
                to={posItem.to}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs',
                  isPosActive
                    ? 'bg-[#C6A664] text-black'
                    : 'bg-[#7A5C2E] text-white hover:bg-[#C6A664]',
                )}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>PDV</span>
              </NavLink>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-white hover:bg-white/10"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </header>

          {/* Mobile Drawer Navigation if menu toggled */}
          {mobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-50 bg-[#2D2A26]/50 backdrop-blur-xs flex flex-col">
              <div className="bg-[#FFFFFF] w-4/5 max-w-xs h-full flex flex-col p-4 shadow-2xl animate-fade-in">
                {/* Header da Gaveta com Logo Oficial */}
                <div className="flex items-center justify-between pb-3 border-b border-[#E5DFD5]">
                  <div className="bg-black p-2 rounded-xl flex items-center justify-center max-w-[180px]">
                    <img
                      src={LOGO_FULL_URL}
                      alt="Scaglioni Joias"
                      className="h-7 w-auto object-contain"
                    />
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 rounded-lg text-[#6B655E] hover:bg-[#F3EAD8]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="py-3">
                  <p className="text-sm font-semibold text-[#2D2A26]">{user.name}</p>
                  <p className="text-xs text-[#6B655E] font-medium">
                    {user.role === 'superadmin'
                      ? 'Super Administrador'
                      : user.role === 'admin'
                        ? 'Administrador'
                        : user.role === 'operator'
                          ? 'Operador'
                          : 'Revendedor'}
                  </p>
                </div>

                {/* PDV EM DESTAQUE NO TOPO DA GAVETA MOBILE */}
                <div className="pb-3 border-b border-[#E5DFD5]">
                  <NavLink
                    to={posItem.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl text-sm font-bold shadow-xs transition-all border',
                      isPosActive
                        ? 'bg-gradient-to-r from-[#7A5C2E] via-[#A88742] to-[#7A5C2E] text-white border-[#7A5C2E]'
                        : 'bg-gradient-to-r from-[#F8F3EA] to-[#F3EAD8] text-[#7A5C2E] border-[#C6A664]',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#7A5C2E] text-white flex items-center justify-center">
                        <posItem.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="block leading-tight font-serif text-sm">
                          {posItem.label}
                        </span>
                        <span className="text-[10px] font-normal text-amber-900 block">
                          Acesso prioritário
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#7A5C2E] text-white">
                      {posItem.badge}
                    </span>
                  </NavLink>
                </div>

                <nav className="flex-1 overflow-y-auto space-y-1 py-2">
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
                          item.isRestricted
                            ? isActive
                              ? 'bg-red-50 text-red-600 font-semibold border border-red-200'
                              : 'text-red-600 hover:bg-red-50'
                            : isActive
                              ? 'bg-[#C6A664]/15 text-[#7A5C2E] font-semibold'
                              : 'text-[#6B655E] hover:bg-[#F3EAD8]',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon
                            className={cn(
                              'h-4 w-4',
                              item.isRestricted
                                ? 'text-red-600'
                                : isActive
                                  ? 'text-[#7A5C2E]'
                                  : 'text-[#6B655E]',
                            )}
                          />
                          <span>{item.label}</span>
                          {item.isRestricted && (
                            <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                              Restrito
                            </span>
                          )}
                          {item.badgeText && (
                            <span className="text-[9px] bg-[#F3EAD8] text-[#7A5C2E] border border-[#C6A664]/50 px-1.5 py-0.5 rounded font-bold uppercase">
                              {item.badgeText}
                            </span>
                          )}
                        </div>
                        <ChevronRight
                          className={cn(
                            'h-4 w-4',
                            item.isRestricted ? 'text-red-400' : 'text-[#C6A664]',
                          )}
                        />
                      </NavLink>
                    )
                  })}
                </nav>

                <div className="pt-3 border-t border-[#E5DFD5] space-y-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-[#B3261E] hover:bg-[#B3261E]/10 rounded-xl"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sair da conta</span>
                  </button>
                  <div className="text-center">
                    <span className="text-[10px] text-[#8C8275] font-mono">v{APP_VERSION}</span>
                  </div>
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
                    <span className="text-[10px] font-bold text-[#7A5C2E] mt-1">{item.label}</span>
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
                  <span
                    className={cn('text-[10px] mt-0.5', isActive ? 'font-bold' : 'font-medium')}
                  >
                    {item.label}
                  </span>
                </NavLink>
              )
            })}
          </nav>
        </div>
      </div>
    </TooltipProvider>
  )
}
