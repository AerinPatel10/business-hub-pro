import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppData, type Order, type Transaction } from "@/contexts/AppDataContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { inr, fmtDate } from "@/lib/format";

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque"];

const today = () => new Date().toISOString().slice(0, 10);

// Recompute amount_paid + payment_status for the order from current transactions.
async function recomputeOrderTotals(orderId: string, total: number) {
  const { data } = await supabase
    .from("transactions")
    .select("amount,type")
    .eq("order_id", orderId);
  const paid = (data ?? [])
    .filter(t => t.type === "credit")
    .reduce((s, t) => s + Number(t.amount), 0);
  const status: "paid" | "partial" | "unpaid" =
    paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial";
  await supabase.from("orders").update({ amount_paid: paid, payment_status: status }).eq("id", orderId);
}

export const LedgerRowActions = ({
  order,
  kind,
}: {
  order: Order;
  kind: "invoice" | "estimate";
}) => {
  const navigate = useNavigate();
  const { transactions, settings, refresh } = useAppData();

  const [payOpen, setPayOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [editWarnOpen, setEditWarnOpen] = useState(false);

  // payment form
  const [amount, setAmount] = useState<string>("");
  const [mode, setMode] = useState<string>("Cash");
  const [date, setDate] = useState<string>(today());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // edit payment
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState("Cash");
  const [editDate, setEditDate] = useState(today());
  const [editNote, setEditNote] = useState("");

  // delete payment
  const [delTxn, setDelTxn] = useState<Transaction | null>(null);

  const totalAmt = Number(order.total);
  const paid = Number(order.amount_paid);
  const balance = Math.max(totalAmt - paid, 0);
  const showAddPayment = order.payment_status !== "paid";

  const orderTxns = transactions
    .filter(t => t.order_id === order.id && t.type === "credit")
    .sort((a, b) => new Date(b.txn_date).getTime() - new Date(a.txn_date).getTime());

  const hasPayments = orderTxns.length > 0;

  useEffect(() => {
    if (payOpen) {
      setAmount(balance > 0 ? String(balance) : "");
      setMode("Cash");
      setDate(today());
      setNote("");
    }
  }, [payOpen, balance]);

  const handleRecord = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > balance + 0.01) { toast.error("Amount exceeds balance due"); return; }
    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      party_id: order.party_id,
      order_id: order.id,
      type: "credit",
      amount: amt,
      payment_method: mode,
      txn_date: date,
      notes: note || `Payment for ${order.invoice_number}`,
    });
    if (error) { setSaving(false); toast.error(error.message); return; }
    await recomputeOrderTotals(order.id, totalAmt);
    setSaving(false);
    setPayOpen(false);
    toast.success("Payment recorded");
    await refresh();
  };

  const openEdit = (t: Transaction) => {
    setEditTxn(t);
    setEditAmount(String(t.amount));
    setEditMode(t.payment_method ?? "Cash");
    setEditDate(t.txn_date);
    setEditNote(t.notes ?? "");
  };

  const handleEditPayment = async () => {
    if (!editTxn) return;
    const amt = Number(editAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const { error } = await supabase.from("transactions").update({
      amount: amt,
      payment_method: editMode,
      txn_date: editDate,
      notes: editNote,
    }).eq("id", editTxn.id);
    if (error) { toast.error(error.message); return; }
    await recomputeOrderTotals(order.id, totalAmt);
    setEditTxn(null);
    toast.success("Payment updated");
    await refresh();
  };

  const handleDeletePayment = async () => {
    if (!delTxn) return;
    const { error } = await supabase.from("transactions").delete().eq("id", delTxn.id);
    if (error) { toast.error(error.message); return; }
    await recomputeOrderTotals(order.id, totalAmt);
    setDelTxn(null);
    toast.success("Payment deleted");
    await refresh();
  };

  const goEdit = () => {
    const path = kind === "estimate" ? `/estimates/${order.id}/edit` : `/invoices/${order.id}/edit`;
    navigate(path);
  };

  const handleEditClick = () => {
    if (hasPayments) setEditWarnOpen(true);
    else goEdit();
  };

  const handleDeleteOrder = async () => {
    await supabase.from("order_items").delete().eq("order_id", order.id);
    await supabase.from("transactions").delete().eq("order_id", order.id);
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    if (error) { toast.error(error.message); return; }

    // Recompute next number so deleted numbers can be reused
    if (settings) {
      const sx = settings as typeof settings & { estimate_prefix?: string; next_estimate_number?: number };
      const isEstimate = kind === "estimate";
      const prefix = isEstimate ? (sx.estimate_prefix ?? "EST-") : settings.invoice_prefix;
      const orderType = isEstimate ? "estimate" : "sale";
      const { data: remaining } = await supabase
        .from("orders").select("invoice_number").eq("order_type", orderType);
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

    setDelOpen(false);
    toast.success(`${kind === "estimate" ? "Estimate" : "Invoice"} deleted`);
    await refresh();
  };

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {showAddPayment && (
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setPayOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Payment
        </Button>
      )}
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setHistOpen(true)} aria-label="Payment history">
        <Eye className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleEditClick} aria-label="Edit">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDelOpen(true)} aria-label="Delete">
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* RECORD PAYMENT */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Party</Label>
                <Input readOnly value={order.party_name ?? "—"} className="h-9" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{kind === "estimate" ? "Estimate No" : "Invoice No"}</Label>
                <Input readOnly value={order.invoice_number} className="h-9" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Total</Label>
                <Input readOnly value={inr(totalAmt)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Already Paid</Label>
                <Input readOnly value={inr(paid)} className="h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Balance Due</Label>
                <Input readOnly value={inr(balance)} className="h-9 font-bold" />
              </div>
            </div>
            <div>
              <Label>Amount Received Now *</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
              </div>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={handleRecord} disabled={saving}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PAYMENT HISTORY */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment History — {order.invoice_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="font-bold text-sm">{inr(totalAmt)}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Paid</div>
                <div className="font-bold text-sm text-green-600">{inr(paid)}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Balance</div>
                <div className="font-bold text-sm text-destructive">{inr(balance)}</div>
              </div>
            </div>
            {orderTxns.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">No payments yet</div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {orderTxns.map(t => (
                  <div key={t.id} className="border rounded-md p-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <div className="font-medium">{inr(t.amount)} · {t.payment_method ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(t.txn_date)}</div>
                      {t.notes && <div className="text-xs mt-0.5 truncate">{t.notes}</div>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDelTxn(t)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT PAYMENT */}
      <Dialog open={!!editTxn} onOpenChange={(o) => !o && setEditTxn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount *</Label>
              <Input type="number" inputMode="decimal" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mode</Label>
                <Select value={editMode} onValueChange={setEditMode}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-10" />
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea rows={2} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTxn(null)}>Cancel</Button>
            <Button onClick={handleEditPayment}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE PAYMENT */}
      <AlertDialog open={!!delTxn} onOpenChange={(o) => !o && setDelTxn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment of {delTxn ? inr(delTxn.amount) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This will recalculate the balance due.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePayment} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* EDIT WARNING */}
      <AlertDialog open={editWarnOpen} onOpenChange={setEditWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Payments recorded</AlertDialogTitle>
            <AlertDialogDescription>Editing this {kind} may affect the balance. Continue?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setEditWarnOpen(false); goEdit(); }}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE ORDER */}
      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              All payments for this {kind} will also be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LedgerRowActions;
