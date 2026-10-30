import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
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
import AuxiliariesCrud from '@/pages/AuxiliariesCrud'
import PosSale from '@/pages/PosSale'
import CatalogVitrine from '@/pages/CatalogVitrine'
import ConsignmentsManagement from '@/pages/ConsignmentsManagement'
import ResellersManagement from '@/pages/ResellersManagement'
import UsersManagement from '@/pages/UsersManagement'
import UserProfile from '@/pages/UserProfile'
import ImportProductsPage from '@/pages/ImportProductsPage'
import { ImportTecsonPage } from '@/pages/ImportTecsonPage'
import { ImportScaglioniPage } from '@/pages/ImportScaglioniPage'
import CompanySettingsPage from '@/pages/CompanySettingsPage'
import NotFound from '@/pages/NotFound'

// New Pages - Módulo de Revendedora com Estoque Próprio
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
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Dashboard (Admin & Operator) */}
            <Route
              path="/importar-produtos"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ImportTecsonPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/importar-tecson"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ImportTecsonPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/importar-scaglioni"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ImportScaglioniPage />
                </ProtectedRoute>
              }
            />
            {/* Voice Product Entry (Mobile-first anchor screen) */}
            <Route
              path="voz"
              element={
                <ProtectedRoute allowedRoles={['admin', 'operator']}>
                  <VoiceProductEntry />
                </ProtectedRoute>
              }
            />

            {/* Products / Auxiliaries CRUD */}
            <Route
              path="produtos"
              element={
                <ProtectedRoute allowedRoles={['admin', 'operator']}>
                  <AuxiliariesCrud />
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

            {/* Consignments (Fluxo tradicional de listas mantido intacto) */}
            <Route path="consignacoes" element={<ConsignmentsManagement />} />

            {/* Configurações da Empresa (Somente Administrador) */}
            <Route
              path="empresa"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <CompanySettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Módulo de Estoque Próprio da Revendedora (NOVO) */}
            <Route path="revendedora/estoque-entregas" element={<ResellerDeliveriesAndStock />} />
            <Route path="revendedora/pdv" element={<ResellerPosSale />} />
            <Route
              path="revendedora/devolucoes-pendencias"
              element={<ResellerReturnsAndIssues />}
            />
            <Route path="revendedora/financeiro" element={<ResellerFinancial />} />

            {/* Resellers management (Admin & Operator) */}
            <Route
              path="revendedores"
              element={
                <ProtectedRoute allowedRoles={['admin', 'operator']}>
                  <ResellersManagement />
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

            {/* Importação de Produtos (Admin only) */}
            <Route
              path="importar-produtos"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ImportProductsPage />
                </ProtectedRoute>
              }
            />

            {/* Profile */}
            <Route path="perfil" element={<UserProfile />} />
          </Route>

          {/* Catch-all 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
