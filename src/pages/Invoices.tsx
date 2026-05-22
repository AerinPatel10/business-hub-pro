import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronRight, User } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";

/**
 * Customer-first sales list.
 * Click a customer card → navigates to its dedicated invoices page.
 */
const InvoiceList = () => {
  const { orders } = useAppData();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const navigate = useNavigate();

  useEffect(() => {
    const urlQ = searchParams.get("q");
    if (urlQ !== null) setQ(urlQ);
  }, [searchParams]);

  // Group sale invoices by customer
  const groups = useMemo(() => {
    const term = q.toLowerCase().trim();
    const map = new Map<string, {
      key: string;
      name: string;
      partyId: string | null;
      count: number;
      total: number;
      due: number;
      lastDate: string;
    }>();

    orders
      .filter(o => o.order_type === "sale")
      .forEach(o => {
        const name = o.party_name || "Walk-in";
        if (term && !name.toLowerCase().includes(term) && !o.invoice_number.toLowerCase().includes(term)) return;
        const key = o.party_id ?? `walkin:${name}`;
        const due = Number(o.total) - Number(o.amount_paid);
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          existing.total += Number(o.total);
          existing.due += due;
          if (new Date(o.created_at) > new Date(existing.lastDate)) existing.lastDate = o.created_at;
        } else {
          map.set(key, { key, name, partyId: o.party_id, count: 1, total: Number(o.total), due, lastDate: o.created_at });
        }
      });

    return Array.from(map.values()).sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [orders, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Sales</h1>
        <Button onClick={() => navigate("/invoices/new")} size="sm" className="h-10">
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search customer or invoice number"
          className="pl-9 h-12"
        />
      </div>

      {groups.length === 0 ? (
        <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">
          No invoices found.
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <Link key={g.key} to={`/customers/${encodeURIComponent(g.key)}/invoices`}>
              <Card className="card-elevated p-3 flex items-center justify-between gap-3 active:scale-[0.99] transition">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.count} invoice{g.count === 1 ? "" : "s"} · {fmtDate(g.lastDate)}
                      {g.due > 0 && <span className="text-destructive"> · Due {inr(g.due)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="font-display font-bold text-sm">{inr(g.total)}</div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoiceList;
