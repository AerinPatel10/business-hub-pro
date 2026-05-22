import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAppData, type OrderItem } from "@/contexts/AppDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Share2, Pencil, Trash2, IndianRupee } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";
import { downloadInvoice, shareInvoiceWhatsApp, printInvoice } from "@/lib/invoice-pdf";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PrintOptionsDialog, { type PrintOptionsResult } from "@/components/PrintOptionsDialog";

const InvoiceDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const isEstimate = location.pathname.startsWith("/estimates/");
  const docKind: "invoice" | "estimate" = isEstimate ? "estimate" : "invoice";
  const docLabel = isEstimate ? "Estimate" : "Invoice";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orders, parties, settings, refresh } = useAppData();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt] = useState(0);
  const [delOpen, setDelOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const order = orders.find(o => o.id === id);
  const party = order?.party_id ? parties.find(p => p.id === order.party_id) : null;

  useEffect(() => {
    if (!id) return;
    supabase.from("order_items").select("*").eq("order_id", id).then(({ data }) => setItems(data ?? []));
    if (user) supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [id, user]);

  if (!order) return <div className="p-4">Loading…</div>;

  const business = {
    business_name: profile?.business_name ?? "My Business",
    gstin: profile?.gstin,
    pan: profile?.pan,
    phone: profile?.phone,
    email: profile?.email,
    address: profile?.address,
    state: profile?.state,
    state_code: profile?.state_code,
    bank_name: profile?.bank_name,
    bank_account: profile?.bank_account,
    bank_ifsc: profile?.bank_ifsc,
    bank_branch: profile?.bank_branch,
  };

  const partyInfo = party ? {
    name: party.name,
    address: party.address,
    state: party.state,
    state_code: party.state_code,
    gstin: party.gstin,
    pan: party.pan,
    phone: party.phone,
  } : undefined;

  const recordPayment = async () => {
    if (payAmt <= 0) { toast.error("Enter amount"); return; }
    const newPaid = Number(order.amount_paid) + payAmt;
    const newStatus: "paid" | "partial" | "unpaid" = newPaid >= Number(order.total) ? "paid" : "partial";
    const { error } = await supabase.from("orders").update({ amount_paid: newPaid, payment_status: newStatus }).eq("id", order.id);
    if (error) { toast.error(error.message); return; }
    if (party) {
      await supabase.from("transactions").insert({
        party_id: party.id, order_id: order.id, type: "credit", amount: payAmt,
        payment_method: "Cash", notes: `Payment for ${order.invoice_number}`,
      });
    }
    toast.success("Payment recorded");
    setPayOpen(false); setPayAmt(0);
    await refresh();
  };

  const deleteInvoice = async () => {
    await supabase.from("order_items").delete().eq("order_id", order.id);
    await supabase.from("transactions").delete().eq("order_id", order.id);
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    if (error) { toast.error(error.message); return; }

    // Recompute next number from remaining orders so deleted numbers can be reused
    if (settings) {
      const sx = settings as typeof settings & { estimate_prefix?: string; next_estimate_number?: number };
      const prefix = isEstimate ? (sx.estimate_prefix ?? "EST-") : settings.invoice_prefix;
      const orderType = isEstimate ? "estimate" : "sale";
      const { data: remaining } = await supabase
        .from("orders")
        .select("invoice_number")
        .eq("order_type", orderType);
      let maxN = 0;
      const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${esc}(\\d+)$`);
      for (const r of remaining ?? []) {
        const m = r.invoice_number?.match(re);
        if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
      }
      const nextN = maxN + 1;
      const updateField = isEstimate ? { next_estimate_number: nextN } : { next_invoice_number: nextN };
      await supabase.from("app_settings").update(updateField).eq("id", settings.id);
    }

    toast.success(`${docLabel} deleted`);
    setDelOpen(false);
    await refresh();
    navigate(isEstimate ? "/estimates" : "/invoices");
  };

  const due = Number(order.total) - Number(order.amount_paid);
  const editPath = isEstimate ? `/estimates/${order.id}/edit` : `/invoices/${order.id}/edit`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold truncate">{order.invoice_number}</h1>
            <div className="text-xs text-muted-foreground">{docLabel} · {fmtDate(order.invoice_date)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="outline" size="icon" onClick={() => navigate(editPath)} aria-label={`Edit ${docLabel}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setDelOpen(true)} aria-label={`Delete ${docLabel}`} className="text-destructive border-destructive/40">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="card-elevated p-4">
        <div className="text-xs text-muted-foreground">Bill To</div>
        <div className="font-semibold">{order.party_name}</div>
        {order.party_gstin && <div className="text-xs">GSTIN: {order.party_gstin}</div>}
      </Card>

      <Card className="card-elevated p-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2">ITEMS</div>
        {items.map(it => (
          <div key={it.id} className="py-2 border-b last:border-b-0 border-border/60">
            <div className="flex justify-between">
              <div className="font-semibold text-sm">{it.product_name}</div>
              <div className="font-display font-bold text-sm">{inr(it.total)}</div>
            </div>
            <div className="text-xs text-muted-foreground">
              {it.quantity} {it.unit} × {inr(it.price)} · GST {it.gst_rate}%
            </div>
          </div>
        ))}
      </Card>

      <Card className="card-elevated p-4 space-y-1.5 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{inr(order.subtotal)}</span></div>
        {Number(order.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>- {inr(order.discount)}</span></div>}
        {order.is_interstate ? (
          <div className="flex justify-between"><span>IGST</span><span>{inr(order.igst)}</span></div>
        ) : (
          <>
            <div className="flex justify-between"><span>CGST</span><span>{inr(order.cgst)}</span></div>
            <div className="flex justify-between"><span>SGST</span><span>{inr(order.sgst)}</span></div>
          </>
        )}
        <div className="border-t pt-2 flex justify-between font-display font-bold text-lg"><span>Total</span><span>{inr(order.total)}</span></div>
        {!isEstimate && (
          <>
            <div className="flex justify-between text-success"><span>Paid</span><span>{inr(order.amount_paid)}</span></div>
            {due > 0 && <div className="flex justify-between font-semibold text-destructive"><span>Balance Due</span><span>{inr(due)}</span></div>}
          </>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setPrintOpen(true)} variant="outline" className="h-12">
          <Download className="h-4 w-4 mr-2" /> PDF
        </Button>
        <Button onClick={() => shareInvoiceWhatsApp(order, items, business, settings, party?.phone, partyInfo, docKind)} className="h-12 bg-success hover:bg-success/90 text-success-foreground">
          <Share2 className="h-4 w-4 mr-2" /> WhatsApp
        </Button>
      </div>

      <PrintOptionsDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        title={`${docLabel} — Print / Download`}
        allowTwoUp={isEstimate}
        onConfirm={(r: PrintOptionsResult) => {
          const opts = { paperSize: r.paperSize, color: r.color, twoUp: r.twoUp };
          if (r.action === "print") {
            printInvoice(order, items, business, settings, partyInfo, docKind, opts);
          } else {
            downloadInvoice(order, items, business, settings, partyInfo, docKind, opts);
          }
        }}
      />

      {!isEstimate && due > 0 && (
        <Button onClick={() => { setPayAmt(due); setPayOpen(true); }} className="w-full h-12">
          <IndianRupee className="h-4 w-4 mr-2" /> Record Payment
        </Button>
      )}

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <Label>Amount (₹)</Label>
          <Input type="number" inputMode="decimal" value={payAmt || ""} onChange={e => setPayAmt(Number(e.target.value))} className="h-12" />
          <Button onClick={recordPayment} className="h-12">Save</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this invoice?</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground">This will permanently remove the invoice, its line items and any related payment records. Stock will be restored.</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDelOpen(false)} className="flex-1 h-11">Cancel</Button>
            <Button variant="destructive" onClick={deleteInvoice} className="flex-1 h-11">Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoiceDetail;
