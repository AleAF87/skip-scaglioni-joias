import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { PdvGuardProvider } from '@/contexts/PdvGuardContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'
import { Toaster } from 'sonner'

// Pages
import LoginPage from '@/pages/LoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResellerRequestPage from '@/pages/ResellerRequestPage'
import Dashboard from '@/pages/Dashboard'
import VoiceProductEntry from '@/pages/VoiceProductEntry'
import StockInventory from '@/pages/StockInventory'
import ProductsPage from '@/pages/ProductsPage'
import AuxiliariesCrud from '@/pages/AuxiliariesCrud'
import CategoriesCrud from '@/pages/CategoriesCrud'
import PosSale from '@/pages/PosSale'
import CatalogVitrine from '@/pages/CatalogVitrine'
import ConsignmentsManagement from '@/pages/ConsignmentsManagement'
import ResellersManagement from '@/pages/ResellersManagement'
import UsersManagement from '@/pages/UsersManagement'
import CustomersManagement from '@/pages/CustomersManagement'
import UserProfile from '@/pages/UserProfile'
import ImportProductsPage from '@/pages/ImportProductsPage'
import { ImportTecsonPage } from '@/pages/ImportTecsonPage'
import { ImportScaglioniPage } from '@/pages/ImportScaglioniPage'
import CompanySettingsPage from '@/pages/CompanySettingsPage'
import AutomationPage from '@/pages/AutomationPage'
import LabelGenerationPage from '@/pages/LabelGenerationPage'
import NotFound from '@/pages/NotFound'

// New Pages - Módulo de Revendedora com Estoque Próprio
import ResellersUnifiedPage from '@/pages/ResellersUnifiedPage'
import ResellerDeliveriesAndStock from '@/pages/ResellerDeliveriesAndStock'
import ResellerPosSale from '@/pages/ResellerPosSale'
import ResellerReturnsAndIssues from '@/pages/ResellerReturnsAndIssues'
import ResellerFinancial from '@/pages/ResellerFinancial'
import PublicResellerStore from '@/pages/PublicResellerStore'
import InstallAppPage from '@/pages/InstallAppPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PdvGuardProvider>
          <Toaster richColors position="top-right" />
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
            <Route path="/solicitar-revendedor" element={<ResellerRequestPage />} />
            <Route path="/loja/:resellerId" element={<PublicResellerStore />} />
            <Route path="/instalar" element={<InstallAppPage />} />

            {/* Authenticated Root under Layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard / Painel Executivo (Admin & Operator) */}
              <Route
                index
                element={
                  <ProtectedRoute allowedRoles={['admin', 'operator']}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="dashboard" element={<Navigate to="/" replace />} />

              <Route
                path="/importar-tecson"
                element={
                  <ProtectedRoute allowedRoles={['superadmin']}>
                    <ImportTecsonPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/importar-scaglioni"
                element={
                  <ProtectedRoute allowedRoles={['superadmin']}>
                    <ImportScaglioniPage />
                  </ProtectedRoute>
                }
              />
              {/* Voice Product Entry (Exclusivo Superadmin) */}
              <Route
                path="voz"
                element={
                  <ProtectedRoute allowedRoles={['superadmin']}>
                    <VoiceProductEntry />
                  </ProtectedRoute>
                }
              />

              {/* Nova Página "Produtos" (Cadastrar produtos) */}
              <Route
                path="produtos"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'operator']}>
                    <ProductsPage />
                  </ProtectedRoute>
                }
              />

              {/* Auxiliaries CRUD (Catálogo de Joias - Restrito Superadmin) */}
              <Route
                path="auxiliares"
                element={
                  <ProtectedRoute allowedRoles={['superadmin']}>
                    <AuxiliariesCrud />
                  </ProtectedRoute>
                }
              />

              {/* Categories Auxiliary CRUD */}
              <Route
                path="categorias"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'operator']}>
                    <CategoriesCrud />
                  </ProtectedRoute>
                }
              />

              {/* Stock / Inventory */}
              <Route
                path="estoque"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'operator']}>
                    <StockInventory />
                  </ProtectedRoute>
                }
              />

              {/* Emissão / Geração de Etiquetas */}
              <Route
                path="etiquetas"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'operator']}>
                    <LabelGenerationPage />
                  </ProtectedRoute>
                }
              />

              {/* POS Sales */}
              <Route
                path="pdv"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'operator']}>
                    <PosSale />
                  </ProtectedRoute>
                }
              />

              {/* Catalog / Vitrine (Accessible to Resellers, Operators, Admins) */}
              <Route path="vitrine" element={<CatalogVitrine />} />

              {/* PÁGINA UNIFICADA: Revendedoras (substitui Consignações e Entregas de Joias) */}
              <Route path="revendedoras" element={<ResellersUnifiedPage />} />

              {/* Redirecionamentos / Rotas Legadas para a nova página unificada */}
              <Route path="consignacoes" element={<Navigate to="/revendedoras" replace />} />
              <Route
                path="revendedora/estoque-entregas"
                element={<Navigate to="/revendedoras" replace />}
              />

              {/* Configurações da Empresa (Restrito Superadmin) */}
              <Route
                path="empresa"
                element={
                  <ProtectedRoute allowedRoles={['superadmin']}>
                    <CompanySettingsPage />
                  </ProtectedRoute>
                }
              />

              {/* Demais módulos da revendedora */}
              <Route path="revendedora/pdv" element={<ResellerPosSale />} />
              <Route
                path="revendedora/devolucoes-pendencias"
                element={<ResellerReturnsAndIssues />}
              />
              <Route path="revendedora/financeiro" element={<ResellerFinancial />} />

              {/* Resellers cadastros (Admin & Operator) */}
              <Route
                path="revendedores"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'operator']}>
                    <ResellersManagement />
                  </ProtectedRoute>
                }
              />

              {/* Customers management (Admin & Operator & Revendedor) —
                  revendedora vê todos os clientes, mas só edita os que ela criou */}
              <Route
                path="clientes"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'operator', 'reseller']}>
                    <CustomersManagement />
                  </ProtectedRoute>
                }
              />

              {/* Users management (Admin only) */}
              <Route
                path="usuarios"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <UsersManagement />
                  </ProtectedRoute>
                }
              />

              {/* Importação de Produtos (Superadmin only) */}
              <Route
                path="importar-produtos"
                element={
                  <ProtectedRoute allowedRoles={['superadmin']}>
                    <ImportProductsPage />
                  </ProtectedRoute>
                }
              />

              {/* Automação Scaglioni Joias (Superadmin only) */}
              <Route
                path="automacao"
                element={
                  <ProtectedRoute allowedRoles={['superadmin']}>
                    <AutomationPage />
                  </ProtectedRoute>
                }
              />

              {/* Profile */}
              <Route path="perfil" element={<UserProfile />} />
            </Route>

            {/* Catch-all 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PdvGuardProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
