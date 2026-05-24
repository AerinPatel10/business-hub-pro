import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppDataProvider } from "@/contexts/AppDataContext";
import { AccountModeProvider } from "@/contexts/AccountModeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import { InventoryList, ProductForm } from "./pages/Inventory";
import InvoiceList from "./pages/Invoices";
import InvoiceNew from "./pages/InvoiceNew";
import InvoiceDetail from "./pages/InvoiceDetail";
import { PartyList, PartyForm, PartyDetail } from "./pages/Parties";
import EstimateList from "./pages/Estimates";
import CustomerInvoices from "./pages/CustomerInvoices";
import Expenses from "./pages/Expenses";
import Purchases from "./pages/Purchases";
import BalanceSheet from "./pages/BalanceSheet";

import Reports from "./pages/Reports";
import Ledger from "./pages/Ledger";
import { LedgerInvoiceParty, LedgerEstimateParty, LedgerPaymentPage } from "./pages/LedgerDetail";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedShell = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppDataProvider>
      <AppShell>{children}</AppShell>
    </AppDataProvider>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedShell><Dashboard /></ProtectedShell>} />
            <Route path="/inventory" element={<ProtectedShell><InventoryList /></ProtectedShell>} />
            <Route path="/inventory/:id" element={<ProtectedShell><ProductForm /></ProtectedShell>} />
            <Route path="/invoices" element={<ProtectedShell><InvoiceList /></ProtectedShell>} />
            <Route path="/invoices/new" element={<ProtectedShell><InvoiceNew /></ProtectedShell>} />
            <Route path="/invoices/:id/edit" element={<ProtectedShell><InvoiceNew /></ProtectedShell>} />
            <Route path="/invoices/:id" element={<ProtectedShell><InvoiceDetail /></ProtectedShell>} />
            <Route path="/customers/:partyKey/invoices" element={<ProtectedShell><CustomerInvoices /></ProtectedShell>} />
            <Route path="/estimates" element={<ProtectedShell><EstimateList /></ProtectedShell>} />
            <Route path="/estimates/new" element={<ProtectedShell><InvoiceNew mode="estimate" /></ProtectedShell>} />
            <Route path="/estimates/:id/edit" element={<ProtectedShell><InvoiceNew mode="estimate" /></ProtectedShell>} />
            <Route path="/estimates/:id" element={<ProtectedShell><InvoiceDetail /></ProtectedShell>} />
            <Route path="/parties" element={<ProtectedShell><PartyList /></ProtectedShell>} />
            <Route path="/parties/new" element={<ProtectedShell><PartyForm /></ProtectedShell>} />
            <Route path="/parties/:id" element={<ProtectedShell><PartyDetail /></ProtectedShell>} />
            <Route path="/parties/:id/edit" element={<ProtectedShell><PartyForm /></ProtectedShell>} />
            <Route path="/expenses" element={<ProtectedShell><Expenses /></ProtectedShell>} />
            <Route path="/purchases" element={<ProtectedShell><Purchases /></ProtectedShell>} />
            <Route path="/purchases/new" element={<ProtectedShell><InvoiceNew mode="purchase" /></ProtectedShell>} />
            <Route path="/purchases/:id/edit" element={<ProtectedShell><InvoiceNew mode="purchase" /></ProtectedShell>} />
            <Route path="/purchases/:id" element={<ProtectedShell><InvoiceDetail /></ProtectedShell>} />
            <Route path="/balance-sheet" element={<ProtectedShell><BalanceSheet /></ProtectedShell>} />

            <Route path="/reports" element={<ProtectedShell><Reports /></ProtectedShell>} />
            <Route path="/ledger" element={<ProtectedShell><Ledger /></ProtectedShell>} />
            <Route path="/ledger/invoice/:partyId" element={<ProtectedShell><LedgerInvoiceParty /></ProtectedShell>} />
            <Route path="/ledger/estimate/:partyId" element={<ProtectedShell><LedgerEstimateParty /></ProtectedShell>} />
            <Route path="/ledger/:kind/:partyId/pay/:orderId" element={<ProtectedShell><LedgerPaymentPage /></ProtectedShell>} />
            <Route path="/settings" element={<ProtectedShell><Settings /></ProtectedShell>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
