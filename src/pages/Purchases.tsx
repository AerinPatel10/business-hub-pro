import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ShoppingCart } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";

const Purchases = () => {
  const { orders } = useAppData();
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const list = useMemo(() => {
    const term = q.toLowerCase().trim();
    return orders
      .filter(o => o.order_type === "purchase")
      .filter(o => !term
        || (o.party_name ?? "").toLowerCase().includes(term)
        || o.invoice_number.toLowerCase().includes(term));
  }, [orders, q]);

  const total = list.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Purchases</h1>
        <Button onClick={() => navigate("/purchases/new")} size="sm" className="h-10">
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      <Card className="card-elevated p-4">
        <div className="text-xs text-muted-foreground">Total Purchases</div>
        <div className="font-display text-2xl font-bold">{inr(total)}</div>
        <div className="text-xs text-muted-foreground mt-1">{list.length} bill{list.length === 1 ? "" : "s"}</div>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search supplier or bill #" className="pl-9 h-12" />
      </div>

      {list.length === 0 ? (
        <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">
          <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No purchases yet. Tap "New" to record one.
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map(o => (
            <Link key={o.id} to={`/purchases/${o.id}`}>
              <Card className="card-elevated p-3 flex items-center justify-between active:scale-[0.99] transition">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{o.party_name || "Cash Purchase"}</div>
                  <div className="text-xs text-muted-foreground">{o.invoice_number} · {fmtDate(o.invoice_date)}</div>
                </div>
                <div className="font-display font-bold text-sm shrink-0">{inr(o.total)}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Purchases;
