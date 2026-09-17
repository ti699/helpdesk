import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NovoTicket from "./pages/NovoTicket";
import TicketDetail from "./pages/TicketDetail";
import Dashboard from "./pages/Dashboard";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import TicketReports from "./pages/TicketReports";
import ManagementReports from "./pages/ManagementReports";
import TicketWorkspace from "./pages/TicketWorkspace";
import Admin from "./pages/Admin";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
const AssetsDashboard = lazy(() => import("./pages/AssetsDashboard"));
const AssetFormPage = lazy(() => import("./pages/AssetFormPage"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const AssetImport = lazy(() => import("./pages/AssetImport"));
const AssetMovements = lazy(() => import("./pages/AssetMovements"));
const AssetSettings = lazy(() => import("./pages/AssetSettings"));
const AssetReports = lazy(() => import("./pages/AssetReports"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/novo-ticket"
                element={
                  <ProtectedRoute allowedRoles={['solicitante', 'agente_ti', 'agente_manutencao', 'admin']}>
                    <NovoTicket />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/ticket/:id"
                element={
                  <ProtectedRoute>
                    <TicketDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['agente_ti', 'agente_manutencao', 'admin']}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gestao"
                element={
                  <ProtectedRoute>
                    <ExecutiveDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/relatorios/tickets"
                element={
                  <ProtectedRoute>
                    <TicketReports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/relatorios/gestao"
                element={
                  <ProtectedRoute>
                    <ManagementReports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workspace/:id"
                element={
                  <ProtectedRoute allowedRoles={['agente_ti', 'agente_manutencao', 'admin']}>
                    <TicketWorkspace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Admin />
                  </ProtectedRoute>
                }
              />
              <Route path="/patrimonio" element={<ProtectedRoute requireAssetAccess><AssetsDashboard /></ProtectedRoute>} />
              <Route path="/patrimonio/novo" element={<ProtectedRoute requireAssetAccess><AssetFormPage /></ProtectedRoute>} />
              <Route path="/patrimonio/importar" element={<ProtectedRoute requireAssetAccess><AssetImport /></ProtectedRoute>} />
              <Route path="/patrimonio/movimentacoes" element={<ProtectedRoute requireAssetAccess><AssetMovements /></ProtectedRoute>} />
              <Route path="/patrimonio/configuracoes" element={<ProtectedRoute requireAssetAccess><AssetSettings /></ProtectedRoute>} />
              <Route path="/patrimonio/:id" element={<ProtectedRoute requireAssetAccess><AssetDetail /></ProtectedRoute>} />
              <Route path="/patrimonio/:id/editar" element={<ProtectedRoute requireAssetAccess><AssetFormPage /></ProtectedRoute>} />
              <Route path="/relatorios/patrimonio" element={<ProtectedRoute requireAssetAccess><AssetReports /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
