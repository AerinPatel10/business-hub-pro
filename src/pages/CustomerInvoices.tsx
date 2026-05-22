import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";

/**
 * Lists every invoice belonging to a single customer.
 * Used when the user clicks a customer card from Sales.
 */
const CustomerInvoices = () => {
  const { partyKey } = useParams();
  const navigate = useNavigate();
  const { orders, parties } = useAppData();

  // partyKey is either a real party id or `walkin:<name>`.
  const isWalkin = (partyKey ?? "").startsWith("walkin:");
  const walkinName = isWalkin ? decodeURIComponent(partyKey!.slice("walkin:".length)) : "";
  const party = !isWalkin ? parties.find(p => p.id === partyKey) : null;
  const displayName = party?.name ?? walkinName ?? "Customer";

  const list = useMemo(() => {
    return orders
      .filter(o => o.order_type === "sale")
      .filter(o => isWalkin
        ? !o.party_id && (o.party_name ?? "Walk-in") === walkinName
        : o.party_id === partyKey);
  }, [orders, partyKey, isWalkin, walkinName]);

  const total = list.reduce((s, o) => s + Number(o.total), 0);
  const due = list.reduce((s, o) => s + (Number(o.total) - Number(o.amount_paid)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold truncate">{displayName}</h1>
            <div className="text-xs text-muted-foreground">{list.length} invoice{list.length === 1 ? "" : "s"}</div>
          </div>
        </div>
        <Button size="sm" className="h-10" onClick={() => {
          const qs = isWalkin
            ? `?walkin=${encodeURIComponent(walkinName)}`
            : (party ? `?partyId=${party.id}` : "");
          navigate(`/invoices/new${qs}`);
        }}>
          <Plus className="h-4 w-4 mr-1" /> New Invoice
        </Button>
      </div>

      <Card className="card-elevated p-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Total Billed</div>
          <div className="font-display font-bold">{inr(total)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Outstanding</div>
          <div className={`font-display font-bold ${due > 0 ? "text-destructive" : "text-success"}`}>{inr(due)}</div>
        </div>
      </Card>

      {party && (
        <Button variant="outline" className="w-full h-11" onClick={() => navigate(`/parties/${party.id}`)}>
          View Customer Profile & Reports
        </Button>
      )}

      {list.length === 0 ? (
        <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No invoices for this customer yet.
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map(o => {
            const oDue = Number(o.total) - Number(o.amount_paid);
            const payColor =
              o.payment_status === "paid" ? "text-success" :
              o.payment_status === "partial" ? "text-warning" : "text-destructive";
            return (
              <Link key={o.id} to={`/invoices/${o.id}`}>
                <Card className="card-elevated p-3 flex items-center justify-between active:scale-[0.99] transition">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{o.invoice_number}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtDate(o.invoice_date)} · <span className={`capitalize font-semibold ${payColor}`}>{o.payment_status}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-bold text-sm">{inr(o.total)}</div>
                    {oDue > 0 && <div className="text-[10px] text-destructive">Due {inr(oDue)}</div>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomerInvoices;
