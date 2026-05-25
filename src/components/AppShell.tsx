import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Package, FileText, Users, BarChart3, Plus, LogOut, Settings as SettingsIcon, Menu, ClipboardList, BookOpen, ChevronDown, FileSpreadsheet, Receipt, ShoppingCart, Scale, Check, Building2, ArrowLeftRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppData } from "@/contexts/AppDataContext";
import { useAccountMode, type AccountMode } from "@/contexts/AccountModeContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type MenuItem =
  | { to: string; label: string; icon: typeof Home; children?: undefined }
  | { label: string; icon: typeof Home; match: string; children: { to: string; label: string; icon: typeof Home }[]; to?: undefined };

const buildMenu = (mode: AccountMode): MenuItem[] => {
  const isEstimate = mode === "estimate";
  return [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/inventory", label: "Items", icon: Package },
    isEstimate
      ? { to: "/estimates", label: "Sales / Estimates", icon: ClipboardList }
      : { to: "/invoices", label: "Sales / Invoices", icon: FileText },
    { to: "/purchases", label: "Purchases", icon: ShoppingCart },
    { to: "/expenses", label: "Expenses", icon: Receipt },
    { to: "/parties", label: "Parties", icon: Users },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    {
      label: "Ledger", icon: BookOpen, match: "/ledger",
      children: [
        { to: `/ledger?tab=${isEstimate ? "estimate" : "invoice"}`, label: isEstimate ? "Estimate" : "Invoice", icon: isEstimate ? FileSpreadsheet : FileText },
        { to: `/ledger?tab=${isEstimate ? "invoice" : "estimate"}`, label: isEstimate ? "Invoice" : "Estimate", icon: isEstimate ? FileText : FileSpreadsheet },
      ],
    },
    { to: "/balance-sheet", label: "Balance Sheet", icon: Scale },
    { to: "/settings", label: "Settings", icon: SettingsIcon },
  ];
};

const ACCOUNTS: { id: AccountMode; name: string; sub: string; Icon: typeof Home; tone: string }[] = [
  { id: "invoice", name: "Invoice Account", sub: "Tax invoices · GST · Payments", Icon: FileText, tone: "text-primary" },
  { id: "estimate", name: "Estimate Account", sub: "Quotes · Proforma · No payment", Icon: FileSpreadsheet, tone: "text-amber-600 dark:text-amber-400" },
];

const AccountSwitcher = ({ compact = false }: { compact?: boolean }) => {
  const { mode, setMode } = useAccountMode();
  const current = ACCOUNTS.find(a => a.id === mode)!;
  const CurIcon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left transition-all hover:border-primary/40 hover:shadow-sm",
            compact && "w-full"
          )}
          aria-label="Switch account"
        >
          <div className={cn("h-7 w-7 rounded-md bg-secondary flex items-center justify-center", current.tone)}>
            <CurIcon className="h-3.5 w-3.5" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Account</div>
            <div className="text-[12px] font-semibold truncate">{current.name}</div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform ml-1" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <ArrowLeftRight className="h-3 w-3" /> Switch Account
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCOUNTS.map(a => {
          const A = a.Icon;
          const active = a.id === mode;
          return (
            <DropdownMenuItem
              key={a.id}
              onSelect={() => setMode(a.id)}
              className={cn("flex items-start gap-3 py-2.5 cursor-pointer", active && "bg-secondary/60")}
            >
              <div className={cn("h-9 w-9 rounded-md bg-secondary flex items-center justify-center shrink-0", a.tone)}>
                <A className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  {a.name}
                  {active && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="text-[11px] text-muted-foreground">{a.sub}</div>
              </div>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Building2 className="h-3 w-3" /> Books stay separate across accounts
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const AppShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { settings } = useAppData();
  const { mode } = useAccountMode();
  const [open, setOpen] = useState(false);

  const menu = buildMenu(mode);
  const isEstimateMode = mode === "estimate";

  // FAB only visible on the main dashboard
  const isDashboard = location.pathname === "/";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Editorial top header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3 gap-2">
          <div className="flex items-center gap-3 min-w-0">
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
            <Link to="/" className="flex items-center gap-2.5 min-w-0">
              <div className="brand-mark h-8 w-8 text-xs shrink-0">V</div>
              <div className="leading-none hidden xs:block sm:block">
                <div className="font-display font-extrabold text-[15px] tracking-tight">VYAPARBOOK</div>
                <div className="eyebrow mt-0.5">Billing · GST</div>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <AccountSwitcher />
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} aria-label="Settings" className="rounded-sm">
              <SettingsIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 pb-24 safe-bottom animate-fade-in">
        {children}
      </main>

      {/* Floating new doc — only on dashboard */}
      {isDashboard && (
        <button
          onClick={() => navigate(isEstimateMode ? "/estimates/new" : "/invoices/new")}
          className="fixed bottom-6 right-5 z-50 h-14 w-14 rounded-full btn-premium flex items-center justify-center active:scale-95 transition-transform ring-2 ring-accent/40"
          aria-label={isEstimateMode ? "New estimate" : "New invoice"}
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
