import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { useAccountMode } from "@/contexts/AccountModeContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { inr, fmtDate } from "@/lib/format";
import { ArrowUpRight, FileText, Users, Wallet, Package, Search, FileSpreadsheet } from "lucide-react";
import { startOfMonth, isAfter } from "date-fns";
import { cn } from "@/lib/utils";

const Dashboard = () => {
  const { orders, parties } = useAppData();
  const { mode } = useAccountMode();
  const [partySearch, setPartySearch] = useState("");

  const isEstimate = mode === "estimate";
  const orderType = isEstimate ? "estimate" : "sale";
  const docLabel = isEstimate ? "Estimate" : "Invoice";
  const docLabelPlural = isEstimate ? "Estimates" : "Invoices";
  const newRoute = isEstimate ? "/estimates/new" : "/invoices/new";
  const accentTextClass = isEstimate ? "text-amber-600 dark:text-amber-400" : "text-primary";

  // Filter only orders matching current account
  const accountOrders = useMemo(
    () => orders.filter(o => o.order_type === orderType && o.status !== "cancelled"),
    [orders, orderType]
  );

  const stats = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const monthTotal = accountOrders
      .filter(o => isAfter(new Date(o.created_at), monthStart))
      .reduce((s, o) => s + Number(o.total), 0);
    const pending = isEstimate
      ? accountOrders.reduce((s, o) => s + Number(o.total), 0) // estimates: total pipeline
      : accountOrders.reduce((s, o) => s + (Number(o.total) - Number(o.amount_paid)), 0);
    return { monthTotal, pending, totalDocs: accountOrders.length };
  }, [accountOrders, isEstimate]);

  // Only show parties who have at least one doc in this account,
  // PLUS customer-type parties (so user can start a new doc from dashboard).
  const partyList = useMemo(() => {
    const statsMap = new Map<string, { count: number; total: number; lastDate: string | null }>();
    accountOrders.forEach(o => {
      const key = o.party_id ?? `walkin:${o.party_name ?? "Walk-in"}`;
      const ex = statsMap.get(key) ?? { count: 0, total: 0, lastDate: null };
      ex.count += 1;
      ex.total += Number(o.total);
      if (!ex.lastDate || new Date(o.created_at) > new Date(ex.lastDate)) ex.lastDate = o.created_at;
      statsMap.set(key, ex);
    });

    const customerParties = parties.filter(p => p.type === "customer");
    const list = customerParties.map(p => {
      const s = statsMap.get(p.id) ?? { count: 0, total: 0, lastDate: null };
      return { key: p.id, partyId: p.id as string | null, name: p.name, count: s.count, total: s.total, lastDate: s.lastDate };
    });

    statsMap.forEach((s, key) => {
      if (key.startsWith("walkin:")) {
        list.push({ key, partyId: null, name: key.slice("walkin:".length), count: s.count, total: s.total, lastDate: s.lastDate });
      }
    });

    return list.sort((a, b) => {
      const ad = a.lastDate ? new Date(a.lastDate).getTime() : 0;
      const bd = b.lastDate ? new Date(b.lastDate).getTime() : 0;
      if (bd !== ad) return bd - ad;
      return a.name.localeCompare(b.name);
    });
  }, [accountOrders, parties]);

  return (
    <div className="space-y-6">
      {/* Account badge */}
      <div className={cn(
        "rounded-lg border-2 border-dashed px-3 py-2 flex items-center gap-2.5",
        isEstimate ? "border-amber-500/40 bg-amber-500/5" : "border-primary/30 bg-primary/5"
      )}>
        <div className={cn(
          "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
          isEstimate ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/15 text-primary"
        )}>
          {isEstimate ? <FileSpreadsheet className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <div className={cn("text-[10px] font-bold uppercase tracking-widest", accentTextClass)}>
            {docLabel} Account
          </div>
          <div className="text-[11px] text-muted-foreground leading-tight">
            Showing only {docLabelPlural.toLowerCase()} & their parties
          </div>
        </div>
      </div>

      {/* Hero stat tile */}
      <div className="stat-tile">
        <div className="relative z-10">
          <div className="eyebrow text-primary-foreground/70">This Month · {docLabelPlural}</div>
          <div className="font-display text-4xl font-black tracking-tight mt-2 tabular">{inr(stats.monthTotal)}</div>
          <div className="flex items-center gap-2 mt-3 text-xs text-primary-foreground/80 font-medium">
            <ArrowUpRight className="h-3.5 w-3.5 text-accent" />
            {stats.totalDocs} {docLabelPlural.toLowerCase()} issued
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="card-elevated p-4">
          <div className="eyebrow">{isEstimate ? "Pipeline Value" : "To Receive"}</div>
          <div className="flex items-end justify-between mt-2">
            <div className="font-display text-xl font-extrabold tabular">{inr(stats.pending)}</div>
            <Wallet className="h-4 w-4 text-warning" />
          </div>
        </Card>
        <Card className="card-elevated p-4">
          <div className="eyebrow">Active Parties</div>
          <div className="flex items-end justify-between mt-2">
            <div className="font-display text-xl font-extrabold tabular">
              {partyList.filter(p => p.count > 0).length}
            </div>
            <Users className="h-4 w-4 text-primary" />
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <div className="eyebrow mb-2">Quick Actions</div>
        <div className="grid grid-cols-3 gap-2">
          <Link to={newRoute} className="card-elevated p-4 flex flex-col items-center text-center gap-1.5 active:scale-95 transition hover:border-primary">
            {isEstimate ? <FileSpreadsheet className="h-5 w-5 text-amber-600 dark:text-amber-400" /> : <FileText className="h-5 w-5 text-primary" />}
            <span className="text-[11px] font-bold uppercase tracking-wider">New {docLabel}</span>
          </Link>
          <Link to="/inventory/new" className="card-elevated p-4 flex flex-col items-center text-center gap-1.5 active:scale-95 transition hover:border-primary">
            <Package className="h-5 w-5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Add Item</span>
          </Link>
          <Link to="/parties/new" className="card-elevated p-4 flex flex-col items-center text-center gap-1.5 active:scale-95 transition hover:border-primary">
            <Users className="h-5 w-5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Add Party</span>
          </Link>
        </div>
      </div>

      {/* Parties list for this account */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="eyebrow">{docLabel} Ledger</div>
            <h2 className="font-display font-extrabold text-base tracking-tight">Parties</h2>
          </div>
          <Link to="/parties" className="text-[11px] font-bold uppercase tracking-wider text-primary">Manage →</Link>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={partySearch}
            onChange={e => setPartySearch(e.target.value)}
            placeholder="Search parties…"
            className="h-11 pl-9"
          />
        </div>
        {(() => {
          const q = partySearch.trim().toLowerCase();
          const filtered = q ? partyList.filter(c => c.name.toLowerCase().includes(q)) : partyList;
          return filtered.length === 0 ? (
            <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">
              {q ? `No parties match “${partySearch}”.` : `No parties yet for this account. Create a ${docLabel.toLowerCase()} or add a party.`}
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => {
                const target = `/customers/${encodeURIComponent(c.key)}/invoices`;
                return (
                  <Link key={c.key} to={target} className="block">
                    <Card className="card-elevated p-4 flex items-center justify-between active:scale-[0.99] transition hover:border-primary">
                      <div className="min-w-0 flex items-center gap-3">
                        <div className={cn(
                          "h-10 w-10 rounded-sm flex items-center justify-center font-display font-extrabold text-sm shrink-0",
                          isEstimate ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-secondary text-primary"
                        )}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {c.count === 0
                              ? `No ${docLabelPlural.toLowerCase()} yet`
                              : `${c.count} ${c.count === 1 ? docLabel.toLowerCase() : docLabelPlural.toLowerCase()}${c.lastDate ? ` · ${fmtDate(c.lastDate)}` : ""}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display font-extrabold tabular">{c.count > 0 ? inr(c.total) : "—"}</div>
                        <div className="text-[10px] text-primary font-bold uppercase tracking-wider mt-0.5">View →</div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default Dashboard;
