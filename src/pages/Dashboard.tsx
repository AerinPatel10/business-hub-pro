import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { inr, fmtDate } from "@/lib/format";
import { ArrowUpRight, FileText, Users, Wallet, Package, Search } from "lucide-react";
import { startOfMonth, isAfter } from "date-fns";

const Dashboard = () => {
  const { orders, parties } = useAppData();
  const [partySearch, setPartySearch] = useState("");

  const stats = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const sales = orders.filter(o => o.order_type === "sale" && o.status !== "cancelled");
    const monthSales = sales
      .filter(o => isAfter(new Date(o.created_at), monthStart))
      .reduce((s, o) => s + Number(o.total), 0);
    const receivable = sales.reduce((s, o) => s + (Number(o.total) - Number(o.amount_paid)), 0);
    return { monthSales, receivable, totalInvoices: sales.length };
  }, [orders]);

  // Show ALL parties (customers) with their invoice rollup; clicking opens that party's invoice list.
  const allCustomers = useMemo(() => {
    const stats = new Map<string, { count: number; total: number; lastDate: string | null }>();
    orders
      .filter(o => o.order_type === "sale" && o.status !== "cancelled")
      .forEach(o => {
        const key = o.party_id ?? `walkin:${o.party_name ?? "Walk-in"}`;
        const ex = stats.get(key) ?? { count: 0, total: 0, lastDate: null };
        ex.count += 1;
        ex.total += Number(o.total);
        if (!ex.lastDate || new Date(o.created_at) > new Date(ex.lastDate)) ex.lastDate = o.created_at;
        stats.set(key, ex);
      });

    const customerParties = parties.filter(p => p.type === "customer");
    const list = customerParties.map(p => {
      const s = stats.get(p.id) ?? { count: 0, total: 0, lastDate: null };
      return { key: p.id, partyId: p.id, name: p.name, count: s.count, total: s.total, lastDate: s.lastDate };
    });

    // Walk-in customers (no party id) only show up if there are sales recorded for them.
    stats.forEach((s, key) => {
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
  }, [orders, parties]);

  return (
    <div className="space-y-6">
      {/* Hero stat tile */}
      <div className="stat-tile">
        <div className="relative z-10">
          <div className="eyebrow text-primary-foreground/70">This Month · Sales</div>
          <div className="font-display text-4xl font-black tracking-tight mt-2 tabular">{inr(stats.monthSales)}</div>
          <div className="flex items-center gap-2 mt-3 text-xs text-primary-foreground/80 font-medium">
            <ArrowUpRight className="h-3.5 w-3.5 text-accent" />
            {stats.totalInvoices} invoices issued
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="card-elevated p-4">
          <div className="eyebrow">To Receive</div>
          <div className="flex items-end justify-between mt-2">
            <div className="font-display text-xl font-extrabold tabular">{inr(stats.receivable)}</div>
            <Wallet className="h-4 w-4 text-warning" />
          </div>
        </Card>
        <Card className="card-elevated p-4">
          <div className="eyebrow">Customers</div>
          <div className="flex items-end justify-between mt-2">
            <div className="font-display text-xl font-extrabold tabular">{parties.length}</div>
            <Users className="h-4 w-4 text-primary" />
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <div className="eyebrow mb-2">Quick Actions</div>
        <div className="grid grid-cols-3 gap-2">
          <Link to="/invoices/new" className="card-elevated p-4 flex flex-col items-center text-center gap-1.5 active:scale-95 transition hover:border-primary">
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider">New Invoice</span>
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

      {/* All parties — click to view their invoices and create new ones */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="eyebrow">Ledger</div>
            <h2 className="font-display font-extrabold text-base tracking-tight">All Parties</h2>
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
          const filtered = q ? allCustomers.filter(c => c.name.toLowerCase().includes(q)) : allCustomers;
          return filtered.length === 0 ? (
            <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">
              {q ? `No parties match “${partySearch}”.` : "No parties yet. Add a party from the Parties section."}
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => {
              const target = `/customers/${encodeURIComponent(c.key)}/invoices`;
              return (
                <Link key={c.key} to={target} className="block">
                  <Card className="card-elevated p-4 flex items-center justify-between active:scale-[0.99] transition hover:border-primary">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-sm bg-secondary flex items-center justify-center font-display font-extrabold text-sm text-primary shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {c.count === 0
                            ? "No invoices yet"
                            : `${c.count} invoice${c.count === 1 ? "" : "s"}${c.lastDate ? ` · ${fmtDate(c.lastDate)}` : ""}`}
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
