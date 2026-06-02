import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Package, FileText, Users, BarChart3, Plus, LogOut, Settings as SettingsIcon,
  Menu, FileSpreadsheet, Receipt, ShoppingCart, Scale, Check, Building2, ArrowLeftRight,
  ChevronDown, LayoutDashboard, BookOpen, IndianRupee
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppData } from "@/contexts/AppDataContext";
import { useAccountMode, type AccountMode } from "@/contexts/AccountModeContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type LucideIcon = typeof Home;
type Item = { to: string; label: string; icon: LucideIcon; setMode?: AccountMode };
type Section = { heading: string; tone?: "bill" | "without" | "neutral"; items: Item[] };

const buildSections = (): Section[] => [
  {
    heading: "Overview",
    tone: "neutral",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    heading: "Bill Section",
    tone: "bill",
    items: [
      { to: "/invoices", label: "Bill (Invoice)", icon: FileText, setMode: "invoice" },
      { to: "/purchases?acct=invoice", label: "Bill Purchase", icon: ShoppingCart, setMode: "invoice" },
      { to: "/expenses?acct=invoice", label: "Bill Expenses", icon: IndianRupee, setMode: "invoice" },
      { to: "/payments?acct=invoice", label: "Bill Payments", icon: Receipt, setMode: "invoice" },
      { to: "/payment-ledger?acct=invoice", label: "Bill Payment Ledger", icon: BookOpen, setMode: "invoice" },
    ],
  },
  {
    heading: "Without Section",
    tone: "without",
    items: [
      { to: "/estimates", label: "Without (Estimate)", icon: FileSpreadsheet, setMode: "estimate" },
      { to: "/purchases?acct=estimate", label: "Without Purchase", icon: ShoppingCart, setMode: "estimate" },
      { to: "/expenses?acct=estimate", label: "Without Expenses", icon: IndianRupee, setMode: "estimate" },
      { to: "/payments?acct=estimate", label: "Without Payments", icon: Receipt, setMode: "estimate" },
      { to: "/payment-ledger?acct=estimate", label: "Without Payment Ledger", icon: BookOpen, setMode: "estimate" },
    ],
  },
  {
    heading: "Master",
    tone: "neutral",
    items: [
      { to: "/parties", label: "Parties", icon: Users },
      { to: "/inventory", label: "Items", icon: Package },
    ],
  },
  {
    heading: "Reports",
    tone: "neutral",
    items: [
      { to: "/ledger?tab=invoice", label: "Bill Ledger", icon: BookOpen, setMode: "invoice" },
      { to: "/ledger?tab=estimate", label: "Without Ledger", icon: BookOpen, setMode: "estimate" },
      { to: "/balance-sheet?acct=invoice", label: "Bill Balance Sheet", icon: Scale, setMode: "invoice" },
      { to: "/balance-sheet?acct=estimate", label: "Without Balance Sheet", icon: Scale, setMode: "estimate" },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

const ACCOUNTS: { id: AccountMode; name: string; sub: string; Icon: LucideIcon; tone: string }[] = [
  { id: "invoice", name: "Bill Account", sub: "Tax invoices · GST · Payments", Icon: FileText, tone: "text-primary" },
  { id: "estimate", name: "Without Account", sub: "Estimates · Quotes · No GST", Icon: FileSpreadsheet, tone: "text-amber-600 dark:text-amber-400" },
];

const AccountSwitcher = () => {
  const { mode, setMode } = useAccountMode();
  const current = ACCOUNTS.find(a => a.id === mode)!;
  const CurIcon = current.Icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/40 hover:shadow-sm transition-all"
          aria-label="Switch account"
        >
          <div className={cn("h-7 w-7 rounded-md bg-secondary flex items-center justify-center", current.tone)}>
            <CurIcon className="h-3.5 w-3.5" />
          </div>
          <div className="leading-tight min-w-0 hidden sm:block">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Account</div>
            <div className="text-[12px] font-semibold truncate">{current.name}</div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
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
                  {a.name} {active && <Check className="h-3.5 w-3.5 text-primary" />}
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
  const { mode, setMode } = useAccountMode();
  const [open, setOpen] = useState(false);

  const sections = buildSections();
  const isEstimateMode = mode === "estimate";
  const isDashboard = location.pathname === "/";
  const currentFull = location.pathname + location.search;

  const toneClass = (tone?: Section["tone"]) =>
    tone === "bill" ? "text-primary"
    : tone === "without" ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";

  const handleNavigate = (item: Item) => {
    if (item.setMode) setMode(item.setMode);
    setOpen(false);
    navigate(item.to);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
                <nav className="flex-1 overflow-y-auto p-3 space-y-4">
                  {sections.map(sec => (
                    <div key={sec.heading}>
                      <div className={cn(
                        "px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.18em]",
                        toneClass(sec.tone)
                      )}>
                        {sec.heading}
                      </div>
                      <div className="space-y-0.5">
                        {sec.items.map(it => {
                          const Icon = it.icon;
                          const active = currentFull === it.to
                            || (it.to !== "/" && !it.to.includes("?") && location.pathname.startsWith(it.to));
                          return (
                            <button
                              key={it.to + it.label}
                              onClick={() => handleNavigate(it)}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-semibold tracking-wide transition-all border-l-2",
                                active
                                  ? "bg-sidebar-accent text-sidebar-primary border-sidebar-primary"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground border-transparent"
                              )}
                            >
                              <Icon className={cn("h-4 w-4", !active && toneClass(sec.tone))} />
                              {it.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>
                <div className="p-3 border-t border-sidebar-border">
                  <button
                    onClick={() => { setOpen(false); navigate("/settings"); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent transition-colors"
                  >
                    <SettingsIcon className="h-4 w-4" /> Settings
                  </button>
                  <button
                    onClick={() => { setOpen(false); signOut(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold text-destructive hover:bg-sidebar-accent transition-colors"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
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

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 pb-24 safe-bottom animate-fade-in">
        {children}
      </main>

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
