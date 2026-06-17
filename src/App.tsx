import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NovoTicket from "./pages/NovoTicket";
import TicketDetail from "./pages/TicketDetail";
import Dashboard from "./pages/Dashboard";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import TicketWorkspace from "./pages/TicketWorkspace";
import Admin from "./pages/Admin";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
                  <ProtectedRoute allowedRoles={['admin']}>
                    <ExecutiveDashboard />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
