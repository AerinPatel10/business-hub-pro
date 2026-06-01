import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppData, type Order, type Transaction } from "@/contexts/AppDataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, FileText, Pencil, Trash2 } from "lucide-react";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque"];

const fmt = (d: string) => {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = dt.toLocaleString("en-US", { month: "short" });
  const yy = String(dt.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
};

const Header = ({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) => (
  <div className="flex items-center gap-2">
    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onBack}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
    <div className="min-w-0">
      <h1 className="font-display text-xl font-bold truncate">{title}</h1>
      {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
    </div>
  </div>
);

async function recomputeOrderTotals(orderId: string, total: number) {
  const { data } = await supabase
    .from("transactions").select("amount,type").eq("order_id", orderId);
  const paid = (data ?? []).filter(t => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const status: "paid" | "partial" | "unpaid" =
    paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial";
  await supabase.from("orders").update({ amount_paid: paid, payment_status: status }).eq("id", orderId);
}

// =================================================================
// Statement view — two-column Dr/Cr for invoices OR estimates
// =================================================================
type Entry = { date: string; ref: string; particulars: string; amount: number; orderId?: string; txnId?: string };

function buildStatement(
  party: { opening_balance: number; created_at: string } | undefined,
  partyOrders: Order[],
  partyTxns: Transaction[],
  kind: "invoice" | "estimate"
) {
  const dbList: Entry[] = [];
  const crList: Entry[] = [];
  const ob = party ? Number(party.opening_balance) || 0 : 0;
  const obDate = party?.created_at?.slice(0, 10) ?? "";

  // Opening balance — only on Invoice statement (estimates aren't a money owed concept)
  if (kind === "invoice") {
    if (ob > 0) dbList.push({ date: obDate, ref: "—", particulars: "OPENING BALANCE", amount: ob });
    else if (ob < 0) crList.push({ date: obDate, ref: "—", particulars: "OPENING BALANCE", amount: -ob });
  }

  // Documents → Debit side
  const label = kind === "invoice" ? "SALES A/C" : "ESTIMATE A/C";
  partyOrders.forEach((o) => {
    dbList.push({
      date: o.invoice_date, ref: o.invoice_number, particulars: label,
      amount: Number(o.total), orderId: o.id,
    });
  });

  // Payments tied to those orders → Credit side
  const orderIds = new Set(partyOrders.map((o) => o.id));
  partyTxns
    .filter((t) => t.type === "credit" && t.order_id && orderIds.has(t.order_id))
    .forEach((t) => {
      crList.push({
        date: t.txn_date, ref: t.payment_method?.toUpperCase() ?? "CASH",
        particulars: "CASH A/C", amount: Number(t.amount), txnId: t.id, orderId: t.order_id ?? undefined,
      });
    });

  dbList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  crList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalDebit = dbList.reduce((s, e) => s + e.amount, 0);
  const totalCredit = crList.reduce((s, e) => s + e.amount, 0);

  return { dbList, crList, ob, totalDebit, totalCredit };
}

const StatementView = ({ kind }: { kind: "invoice" | "estimate" }) => {
  const { partyId: rawId = "" } = useParams();
  const partyId = decodeURIComponent(rawId);
  const navigate = useNavigate();
  const { parties, orders, transactions, profile } = useAppData();

  const isWalkin = partyId.startsWith("walkin:");
  const walkinName = isWalkin ? partyId.slice("walkin:".length) : "";

  const realParty = parties.find((p) => p.id === partyId);
  const party = realParty ?? (isWalkin
    ? { id: partyId, name: walkinName || "Walk-in Customer", opening_balance: 0, created_at: new Date().toISOString() }
    : undefined);

  const partyOrders = useMemo(
    () => orders.filter((o) => {
      if (o.order_type !== (kind === "invoice" ? "sale" : "estimate")) return false;
      if (isWalkin) {
        const nm = (o.party_name?.trim() || "Walk-in Customer").toLowerCase();
        return !o.party_id && nm === (walkinName || "walk-in customer").toLowerCase();
      }
      return o.party_id === partyId;
    }),
    [orders, partyId, kind, isWalkin, walkinName]
  );
  const partyTxns = useMemo(
    () => transactions.filter((t) => isWalkin
      ? !t.party_id && partyOrders.some(o => o.id === t.order_id)
      : t.party_id === partyId),
    [transactions, partyId, isWalkin, partyOrders]
  );

  const { dbList, crList, ob, totalDebit, totalCredit } = useMemo(
    () => buildStatement(party, partyOrders, partyTxns, kind),
    [party, partyOrders, partyTxns, kind]
  );

  const netDr = totalDebit - totalCredit;
  const grand = Math.max(totalDebit, totalCredit);
  const maxRows = Math.max(dbList.length, crList.length);
  const rows = Array.from({ length: maxRows }).map((_, i) => ({ d: dbList[i], c: crList[i] }));

  const subtitle = kind === "invoice" ? "Invoice Statement" : "Estimate Statement";

  // Delete order
  const [delOrderId, setDelOrderId] = useState<string | null>(null);
  const handleDeleteOrder = async () => {
    if (!delOrderId) return;
    await supabase.from("order_items").delete().eq("order_id", delOrderId);
    await supabase.from("transactions").delete().eq("order_id", delOrderId);
    const { error } = await supabase.from("orders").delete().eq("id", delOrderId);
    if (error) toast.error(error.message);
    else toast.success(`${kind === "invoice" ? "Invoice" : "Estimate"} deleted`);
    setDelOrderId(null);
  };

  // Delete payment
  const [delTxnId, setDelTxnId] = useState<string | null>(null);
  const handleDeleteTxn = async () => {
    if (!delTxnId) return;
    const t = partyTxns.find(x => x.id === delTxnId);
    const { error } = await supabase.from("transactions").delete().eq("id", delTxnId);
    if (error) { toast.error(error.message); return; }
    if (t?.order_id) {
      const o = partyOrders.find(o => o.id === t.order_id);
      if (o) await recomputeOrderTotals(o.id, Number(o.total));
    }
    toast.success("Payment deleted");
    setDelTxnId(null);
  };

  const exportPdf = () => {
    if (!party) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(profile?.business_name || "Business", W / 2, 36, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    if (profile?.address) doc.text(profile.address, W / 2, 52, { align: "center" });
    doc.setLineWidth(0.8); doc.line(40, 70, W - 40, 70);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`${subtitle} For: ${party.name}`, W / 2, 90, { align: "center" });

    const body = rows.map(({ d, c }) => [
      d?.ref ?? "", d ? fmt(d.date) : "", d?.particulars ?? "", d ? d.amount.toFixed(2) : "",
      c?.ref ?? "", c ? fmt(c.date) : "", c?.particulars ?? "", c ? c.amount.toFixed(2) : "",
    ]);
    body.push([
      "", "", `Transaction Total Dr : ${dbList.length}`, totalDebit.toFixed(2),
      "", "", `Transaction Total Cr : ${crList.length}`, totalCredit.toFixed(2),
    ]);
    if (netDr > 0) body.push(["", "", "", "", "", "", "Closing Bal. Dr.", netDr.toFixed(2)]);
    else if (netDr < 0) body.push(["", "", "Closing Bal. Cr.", Math.abs(netDr).toFixed(2), "", "", "", ""]);
    body.push(["", "", "Total", grand.toFixed(2), "", "", "Total", grand.toFixed(2)]);

    autoTable(doc, {
      startY: 110,
      head: [["V.No", "Date", "Particulars", "Debit", "V.No", "Date", "Particulars", "Credit"]],
      body, theme: "grid",
      styles: { fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
    });
    doc.setFontSize(8);
    doc.text("Generated by VyaparBook", 40, doc.internal.pageSize.getHeight() - 20);
    doc.save(`${kind === "invoice" ? "Invoice" : "Estimate"}_Statement_${party.name.replace(/\s+/g, "_")}.pdf`);
  };

  if (!party) {
    return (
      <div className="space-y-4">
        <Header title="Not found" onBack={() => navigate(`/ledger?tab=${kind}`)} />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Party not found</CardContent></Card>
      </div>
    );
  }

  const openPay = (orderId: string) => navigate(`/ledger/${kind}/${encodeURIComponent(partyId)}/pay/${orderId}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Header title={party.name} subtitle={subtitle} onBack={() => navigate(`/ledger?tab=${kind}`)} />
        <Button variant="outline" size="sm" onClick={exportPdf} className="h-9">
          <Download className="h-4 w-4 mr-1" /> PDF
        </Button>
      </div>

      {kind === "invoice" && (
        <Card className={netDr >= 0 ? "border-destructive/40" : "border-green-500/40"}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Net Balance</div>
              <div className="text-lg font-bold">
                {netDr >= 0 ? `Party owes you ${inr(netDr)}` : `You owe party ${inr(Math.abs(netDr))}`}
              </div>
            </div>
            <FileText className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-muted">
                <th className="border p-1.5 text-left">V.No</th>
                <th className="border p-1.5 text-left">Date</th>
                <th className="border p-1.5 text-left">Particulars</th>
                <th className="border p-1.5 text-right">Debit</th>
                <th className="border p-1.5 text-left">V.No</th>
                <th className="border p-1.5 text-left">Date</th>
                <th className="border p-1.5 text-left">Particulars</th>
                <th className="border p-1.5 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center p-6 text-muted-foreground">No transactions</td></tr>
              ) : rows.map(({ d, c }, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="border p-1.5">
                    {d?.orderId ? (
                      <button onClick={() => openPay(d.orderId!)} className="text-primary hover:underline font-semibold">
                        {d.ref}
                      </button>
                    ) : d?.ref ?? ""}
                  </td>
                  <td className="border p-1.5">{d ? fmt(d.date) : ""}</td>
                  <td className="border p-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span>{d?.particulars ?? ""}</span>
                      {d?.orderId && (
                        <button onClick={() => setDelOrderId(d.orderId!)} className="text-destructive/70 hover:text-destructive shrink-0" aria-label="Delete">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border p-1.5 text-right">{d ? d.amount.toFixed(2) : ""}</td>
                  <td className="border p-1.5">{c?.ref ?? ""}</td>
                  <td className="border p-1.5">{c ? fmt(c.date) : ""}</td>
                  <td className="border p-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span>{c?.particulars ?? ""}</span>
                      {c?.txnId && (
                        <div className="flex gap-1 shrink-0">
                          {c.orderId && (
                            <button onClick={() => navigate(`/ledger/${kind}/${encodeURIComponent(partyId)}/pay/${c.orderId}?edit=${c.txnId}`)} className="text-muted-foreground hover:text-foreground" aria-label="Edit">
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button onClick={() => setDelTxnId(c.txnId!)} className="text-destructive/70 hover:text-destructive" aria-label="Delete">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="border p-1.5 text-right">{c ? c.amount.toFixed(2) : ""}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-muted/50">
                <td className="border p-1.5" colSpan={2}></td>
                <td className="border p-1.5">Transaction Total Dr : {dbList.length}</td>
                <td className="border p-1.5 text-right">{totalDebit.toFixed(2)}</td>
                <td className="border p-1.5" colSpan={2}></td>
                <td className="border p-1.5">Transaction Total Cr : {crList.length}</td>
                <td className="border p-1.5 text-right">{totalCredit.toFixed(2)}</td>
              </tr>
              {netDr > 0 ? (
                <tr className="font-semibold">
                  <td className="border p-1.5" colSpan={6}></td>
                  <td className="border p-1.5">Closing Bal. Dr.</td>
                  <td className="border p-1.5 text-right">{netDr.toFixed(2)}</td>
                </tr>
              ) : netDr < 0 ? (
                <tr className="font-semibold">
                  <td className="border p-1.5" colSpan={2}></td>
                  <td className="border p-1.5">Closing Bal. Cr.</td>
                  <td className="border p-1.5 text-right">{Math.abs(netDr).toFixed(2)}</td>
                  <td className="border p-1.5" colSpan={4}></td>
                </tr>
              ) : null}
              <tr className="font-bold bg-muted">
                <td className="border p-1.5" colSpan={2}></td>
                <td className="border p-1.5">Total</td>
                <td className="border p-1.5 text-right">{grand.toFixed(2)}</td>
                <td className="border p-1.5" colSpan={2}></td>
                <td className="border p-1.5">Total</td>
                <td className="border p-1.5 text-right">{grand.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {kind === "invoice" && ob !== 0 && (
        <p className="text-xs text-muted-foreground">
          Opening balance: {inr(Math.abs(ob))} ({ob > 0 ? "party owes you" : "you owe party"})
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Tip: Tap a voucher number (V.No) to record or view payments on that {kind}.
      </p>

      <AlertDialog open={!!delOrderId} onOpenChange={(o) => !o && setDelOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {kind}?</AlertDialogTitle>
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

      <AlertDialog open={!!delTxnId} onOpenChange={(o) => !o && setDelTxnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>The balance will be recalculated.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTxn} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const LedgerInvoiceParty = () => <StatementView kind="invoice" />;
export const LedgerEstimateParty = () => <StatementView kind="estimate" />;

// =================================================================
// LedgerPaymentPage — separate page for adding / editing a payment
// =================================================================
export const LedgerPaymentPage = () => {
  const { kind = "invoice", partyId = "", orderId = "" } = useParams<{ kind: "invoice" | "estimate"; partyId: string; orderId: string }>();
  const navigate = useNavigate();
  const { parties, orders, transactions, refresh } = useAppData();
  const [params] = useSearchParamsLocal();
  const editId = params.get("edit");

  const party = parties.find((p) => p.id === partyId);
  const order = orders.find((o) => o.id === orderId);
  const orderTxns = transactions
    .filter((t) => t.order_id === orderId)
    .sort((a, b) => new Date(b.txn_date).getTime() - new Date(a.txn_date).getTime());
  const editingTxn = editId ? orderTxns.find(t => t.id === editId) : null;

  const totalAmt = order ? Number(order.total) : 0;
  const paid = order ? Number(order.amount_paid) : 0;
  const balance = Math.max(totalAmt - paid + (editingTxn?.type === "credit" ? Number(editingTxn.amount) : 0), 0);

  // credit = money received (what I receive); debit = money given out (what I give)
  const [txnType, setTxnType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState<string>("");
  const [mode, setMode] = useState<string>("Cash");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingTxn) {
      setTxnType((editingTxn.type as "credit" | "debit") ?? "credit");
      setAmount(String(editingTxn.amount));
      setMode(editingTxn.payment_method ?? "Cash");
      setDate(editingTxn.txn_date);
      setNote(editingTxn.notes ?? "");
    } else {
      setAmount(balance > 0 ? String(balance) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, order?.id]);

  const back = () => navigate(`/ledger/${kind}/${partyId}`);
  const isReceive = txnType === "credit";

  const handleSave = async () => {
    if (!order) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (isReceive && amt > balance + 0.01) { toast.error("Amount exceeds balance due"); return; }
    setSaving(true);
    if (editingTxn) {
      const { error } = await supabase.from("transactions")
        .update({ type: txnType, amount: amt, payment_method: mode, txn_date: date, notes: note })
        .eq("id", editingTxn.id);
      if (error) { setSaving(false); toast.error(error.message); return; }
    } else {
      const defaultNote = isReceive
        ? `Payment received for ${order.invoice_number}`
        : `Payment given against ${order.invoice_number}`;
      const { error } = await supabase.from("transactions").insert({
        party_id: partyId, order_id: orderId, type: txnType,
        amount: amt, payment_method: mode, txn_date: date,
        notes: note || defaultNote,
      });
      if (error) { setSaving(false); toast.error(error.message); return; }
    }
    await recomputeOrderTotals(orderId, totalAmt);
    setSaving(false);
    toast.success(editingTxn ? "Entry updated" : isReceive ? "Money received" : "Money given recorded");
    await refresh();
    back();
  };

  if (!party || !order) {
    return (
      <div className="space-y-4">
        <Header title="Not found" onBack={back} />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Record not found</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header
        title={editingTxn ? "Edit Entry" : "Record Money"}
        subtitle={`${party.name} · ${order.invoice_number}`}
        onBack={back}
      />

      <Card>
        <CardContent className="p-4 grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xs text-muted-foreground">Total</div><div className="font-bold text-sm">{inr(totalAmt)}</div></div>
          <div><div className="text-xs text-muted-foreground">Received</div><div className="font-bold text-sm text-green-600">{inr(paid)}</div></div>
          <div><div className="text-xs text-muted-foreground">Balance</div><div className="font-bold text-sm text-destructive">{inr(balance - (editingTxn?.type === "credit" ? Number(editingTxn.amount) : 0))}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label className="mb-1.5 block">Entry Type *</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTxnType("credit")}
                className={cn(
                  "rounded-md border-2 px-3 py-2.5 text-left transition-all",
                  isReceive
                    ? "border-green-600 bg-green-50 dark:bg-green-950/30"
                    : "border-border bg-card hover:border-green-600/40"
                )}
              >
                <div className="text-[10px] uppercase tracking-widest font-bold text-green-700 dark:text-green-400">
                  Credit · Money In
                </div>
                <div className="text-sm font-semibold">What I Receive</div>
              </button>
              <button
                type="button"
                onClick={() => setTxnType("debit")}
                className={cn(
                  "rounded-md border-2 px-3 py-2.5 text-left transition-all",
                  !isReceive
                    ? "border-destructive bg-destructive/5"
                    : "border-border bg-card hover:border-destructive/40"
                )}
              >
                <div className="text-[10px] uppercase tracking-widest font-bold text-destructive">
                  Debit · Money Out
                </div>
                <div className="text-sm font-semibold">What I Give</div>
              </button>
            </div>
          </div>

          <div>
            <Label>{isReceive ? "Amount Received" : "Amount Given"} *</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </div>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={back}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {editingTxn ? "Save Changes" : isReceive ? "Record Receipt" : "Record Payment Out"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {orderTxns.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-2">Previous Entries</div>
            <div className="space-y-1.5">
              {orderTxns.map(t => {
                const inFlow = t.type === "credit";
                return (
                  <div key={t.id} className="flex items-center justify-between text-xs border-b pb-1.5 last:border-0">
                    <div>
                      <div className="font-medium flex items-center gap-1.5">
                        <span className={cn(
                          "text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded",
                          inFlow ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                                 : "bg-destructive/10 text-destructive"
                        )}>{inFlow ? "Cr · In" : "Dr · Out"}</span>
                        {inr(t.amount)} · {t.payment_method ?? "—"}
                      </div>
                      <div className="text-muted-foreground">{fmt(t.txn_date)}</div>
                    </div>
                    {!editingTxn && t.id !== editId && (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => navigate(`/ledger/${kind}/${partyId}/pay/${orderId}?edit=${t.id}`)}>
                        Edit
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// tiny local hook to avoid extra top-level import (kept here for cohesion)
import { useSearchParams as useSearchParamsLocal } from "react-router-dom";
import { cn } from "@/lib/utils";
