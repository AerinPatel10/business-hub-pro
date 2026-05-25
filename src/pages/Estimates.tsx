import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronRight, ChevronDown, FileSpreadsheet, User } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";

/**
 * Customer-grouped Estimates list.
 * Mirrors the Invoices UI but is visually distinct so the user always knows
 * they are inside the ESTIMATES account (amber accent, FileSpreadsheet icon, EST badges).
 */
const EstimateList = () => {
  const { orders } = useAppData();
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const navigate = useNavigate();

  const groups = useMemo(() => {
    const term = q.toLowerCase().trim();
    const map = new Map<string, {
      key: string;
      name: string;
      partyId: string | null;
      count: number;
      total: number;
      lastDate: string;
      items: typeof orders;
    }>();

    orders
      .filter(o => o.order_type === "estimate")
      .forEach(o => {
        const name = o.party_name || "Walk-in";
        if (term && !name.toLowerCase().includes(term) && !o.invoice_number.toLowerCase().includes(term)) return;
        const key = o.party_id ?? `walkin:${name}`;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          existing.total += Number(o.total);
          existing.items.push(o);
          if (new Date(o.created_at) > new Date(existing.lastDate)) existing.lastDate = o.created_at;
        } else {
          map.set(key, { key, name, partyId: o.party_id, count: 1, total: Number(o.total), lastDate: o.created_at, items: [o] });
        }
      });

    return Array.from(map.values())
      .map(g => ({ ...g, items: [...g.items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) }))
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [orders, q]);

  return (
    <div className="space-y-4">
      {/* Distinct estimate-mode banner */}
      <div className="rounded-lg border-2 border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2.5 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Estimates Account</div>
          <div className="text-[11px] text-muted-foreground leading-tight">Quotes / proforma — no payment tracking</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Estimates</h1>
        <Button onClick={() => navigate("/estimates/new")} size="sm" className="h-10 bg-amber-600 hover:bg-amber-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search customer or estimate number"
          className="pl-9 h-12"
        />
      </div>

      {groups.length === 0 ? (
        <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">
          <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No estimates yet. Tap "New" to create one.
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map(g => {
            const isOpen = openKey === g.key;
            return (
              <Card key={g.key} className="card-elevated overflow-hidden border-l-4 border-l-amber-500/60">
                <button
                  onClick={() => setOpenKey(isOpen ? null : g.key)}
                  className="w-full p-3 flex items-center justify-between gap-3 active:scale-[0.99] transition"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                        {g.name}
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 uppercase tracking-wider">EST</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {g.count} estimate{g.count === 1 ? "" : "s"} · {fmtDate(g.lastDate)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="font-display font-bold text-sm">{inr(g.total)}</div>
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-muted/30 divide-y divide-border">
                    {g.items.map(o => (
                      <Link key={o.id} to={`/estimates/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/60 transition">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{o.invoice_number}</div>
                          <div className="text-[11px] text-muted-foreground">{fmtDate(o.invoice_date)}</div>
                        </div>
                        <div className="font-display font-bold text-sm shrink-0">{inr(o.total)}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EstimateList;
