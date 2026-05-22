import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Package, FileText, Users, BarChart3, Plus, LogOut, Settings as SettingsIcon, Menu, ClipboardList, BookOpen, ChevronDown, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppData } from "@/contexts/AppDataContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type MenuItem =
  | { to: string; label: string; icon: typeof Home; children?: undefined }
  | { label: string; icon: typeof Home; match: string; children: { to: string; label: string; icon: typeof Home }[]; to?: undefined };

const menu: MenuItem[] = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/inventory", label: "Items", icon: Package },
  { to: "/invoices", label: "Sales / Invoices", icon: FileText },
  { to: "/estimates", label: "Estimates", icon: ClipboardList },
  { to: "/parties", label: "Parties", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  {
    label: "Ledger", icon: BookOpen, match: "/ledger",
    children: [
      { to: "/ledger?tab=invoice", label: "Invoice", icon: FileText },
      { to: "/ledger?tab=estimate", label: "Estimate", icon: FileSpreadsheet },
    ],
  },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export const AppShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { settings } = useAppData();
  const [open, setOpen] = useState(false);

  // FAB only visible on the main dashboard
  const isDashboard = location.pathname === "/";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Editorial top header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu" className="rounded-sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar text-sidebar-foreground border-sidebar-border">
                <SheetHeader className="p-5 border-b border-sidebar-border">
                  <SheetTitle className="flex items-center gap-3 text-sidebar-foreground">
                    <div className="brand-mark h-10 w-10 text-base">V</div>
                    <div className="text-left">
                      <div className="font-display font-extrabold text-base leading-tight tracking-tight">VYAPARBOOK</div>
                      <div className="eyebrow text-sidebar-foreground/60 mt-0.5">{settings?.currency ?? "INR"} · GST Suite</div>
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
                  {menu.map(m => {
                    const Icon = m.icon;
                    if ("children" in m && m.children) {
                      const g = m as Extract<MenuItem, { children: unknown[] }>;
                      const groupActive = location.pathname.startsWith(g.match);
                      return (
                        <LedgerGroup
                          key={g.label}
                          label={g.label}
                          Icon={Icon}
                          active={groupActive}
                          defaultOpen={groupActive}
                          items={g.children}
                          onNavigate={(to) => { setOpen(false); navigate(to); }}
                        />
                      );
                    }
                    const to = (m as { to: string }).to;
                    const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
                    return (
                      <button
                        key={to}
                        onClick={() => { setOpen(false); navigate(to); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold tracking-wide transition-all border-l-2",
                          active
                            ? "bg-sidebar-accent text-sidebar-primary border-sidebar-primary"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground border-transparent"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {m.label}
                      </button>
                    );
                  })}
                </nav>
                <div className="p-3 border-t border-sidebar-border">
                  <button
                    onClick={() => { setOpen(false); signOut(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold text-destructive hover:bg-sidebar-accent transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <Link to="/" className="flex items-center gap-2.5">
              <div className="brand-mark h-8 w-8 text-xs">V</div>
              <div className="leading-none">
                <div className="font-display font-extrabold text-[15px] tracking-tight">VYAPARBOOK</div>
                <div className="eyebrow mt-0.5">Billing · GST</div>
              </div>
            </Link>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} aria-label="Settings" className="rounded-sm">
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 pb-24 safe-bottom animate-fade-in">
        {children}
      </main>

      {/* Floating new invoice — only on dashboard */}
      {isDashboard && (
        <button
          onClick={() => navigate("/invoices/new")}
          className="fixed bottom-6 right-5 z-50 h-14 w-14 rounded-full btn-premium flex items-center justify-center active:scale-95 transition-transform ring-2 ring-accent/40"
          aria-label="New invoice"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
};

type LucideIcon = typeof Home;
const LedgerGroup = ({
  label, Icon, active, defaultOpen, items, onNavigate,
}: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  defaultOpen: boolean;
  items: { to: string; label: string; icon: LucideIcon }[];
  onNavigate: (to: string) => void;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold tracking-wide transition-all border-l-2",
          active
            ? "bg-sidebar-accent text-sidebar-primary border-sidebar-primary"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground border-transparent"
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-6 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
          {items.map(it => {
            const ItIcon = it.icon;
            return (
              <button
                key={it.to}
                onClick={() => onNavigate(it.to)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              >
                <ItIcon className="h-3.5 w-3.5" />
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
