import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppData } from "@/contexts/AppDataContext";
import { useAccountMode, type AccountMode } from "@/contexts/AccountModeContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/Combobox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, ArrowDownCircle, ArrowUpCircle, Trash2, Pencil,
  ChevronRight, Search, Wallet,
} from "lucide-react";

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque"];

// Standalone payments are tagged in the notes field so we can split them per account.
const tagFor = (m: AccountMode) => (m === "invoice" ? "[ACCT:invoice]" : "[ACCT:estimate]");
const isStandaloneFor = (notes: string | null | undefined, m: AccountMode) =>
  !!notes && notes.startsWith(tagFor(m));
const stripTag = (notes: string | null | undefined) =>
  !notes ? "" : notes.replace(/^\[ACCT:(invoice|estimate)\]\s?/, "");

const fmt = (d: string) => {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${dt.toLocaleString("en-US", { month: "short" })}/${String(dt.getFullYear()).slice(2)}`;
};

const useAcctFromUrl = () => {
  const { mode, setMode } = useAccountMode();
  const [params, setParams] = useSearchParams();
  const urlAcct = params.get("acct") as AccountMode | null;
  useEffect(() => {
    if (urlAcct && urlAcct !== mode) setMode(urlAcct);
    if (!urlAcct) setParams((p) => { p.set("acct", mode); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAcct, mode]);
  return mode;
};

// ============================================================
// Payments — list + add standalone payments (not tied to invoice)
// ============================================================
export const PaymentsPage = () => {
  const acct = useAcctFromUrl();
  const { parties, transactions, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    return transactions
      .filter((t) => !t.order_id && isStandaloneFor(t.notes, acct))
      .filter((t) => {
        if (!q.trim()) return true;
        const partyName = parties.find((p) => p.id === t.party_id)?.name ?? "";
        return partyName.toLowerCase().includes(q.toLowerCase().trim());
      })
      .sort((a, b) => new Date(b.txn_date).getTime() - new Date(a.txn_date).getTime());
  }, [transactions, parties, q, acct]);

  const totals = useMemo(() => {
    let inAmt = 0, outAmt = 0;
    list.forEach((t) => {
      if (t.type === "credit") inAmt += Number(t.amount);
      else outAmt += Number(t.amount);
    });
    return { inAmt, outAmt, net: inAmt - outAmt };
  }, [list]);

  const handleDelete = async () => {
    if (!delId) return;
    const { error } = await supabase.from("transactions").delete().eq("id", delId);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment deleted");
    setDelId(null);
    await refresh();
  };

  const acctTone = acct === "invoice" ? "text-primary" : "text-amber-600 dark:text-amber-400";
  const acctLabel = acct === "invoice" ? "Bill" : "Without";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-tight">Payments</h1>
          <p className={cn("text-xs uppercase tracking-widest font-bold", acctTone)}>
            {acctLabel} Account · standalone money in / out
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="h-10">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-green-700 dark:text-green-400 font-bold">Received</div>
          <div className="font-bold text-sm text-green-600">{inr(totals.inAmt)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-destructive font-bold">Given</div>
          <div className="font-bold text-sm text-destructive">{inr(totals.outAmt)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Net</div>
          <div className={cn("font-bold text-sm", totals.net >= 0 ? "text-green-600" : "text-destructive")}>
            {inr(Math.abs(totals.net))} {totals.net >= 0 ? "In" : "Out"}
          </div>
        </CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by party" className="pl-9 h-11" />
      </div>

      <div className="space-y-2">
        {list.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No payments yet for the {acctLabel} account.
          </CardContent></Card>
        ) : list.map((t) => {
          const partyName = parties.find((p) => p.id === t.party_id)?.name ?? "—";
          const inFlow = t.type === "credit";
          return (
            <Card key={t.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                  inFlow ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                         : "bg-destructive/10 text-destructive"
                )}>
                  {inFlow ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{partyName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {fmt(t.txn_date)} · {t.payment_method ?? "Cash"}
                    {stripTag(t.notes) && ` · ${stripTag(t.notes)}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn("font-bold text-sm", inFlow ? "text-green-600" : "text-destructive")}>
                    {inFlow ? "+" : "−"} {inr(t.amount)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    {inFlow ? "Credit · In" : "Debit · Out"}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => { setEditing(t); setOpen(true); }} className="text-muted-foreground hover:text-foreground" aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDelId(t.id)} className="text-destructive/70 hover:text-destructive" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PaymentDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        acct={acct}
        editing={editing}
        onSaved={refresh}
      />

      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const PaymentDialog = ({
  open, onOpenChange, acct, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  acct: AccountMode;
  editing: any | null;
  onSaved: () => Promise<void> | void;
}) => {
  const { parties } = useAppData();
  const [txnType, setTxnType] = useState<"credit" | "debit">("credit");
  const [partyId, setPartyId] = useState<string>("");
  const [partyName, setPartyName] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTxnType(editing.type);
      setPartyId(editing.party_id ?? "");
      setPartyName(parties.find((p) => p.id === editing.party_id)?.name ?? "");
      setAmount(String(editing.amount));
      setMode(editing.payment_method ?? "Cash");
      setDate(editing.txn_date);
      setNote(stripTag(editing.notes));
    } else {
      setTxnType("credit"); setPartyId(""); setPartyName("");
      setAmount(""); setMode("Cash");
      setDate(new Date().toISOString().slice(0, 10)); setNote("");
    }
  }, [open, editing, parties]);

  const handleSave = async () => {
    if (!partyId) { toast.error("Pick a party"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const tagged = `${tagFor(acct)} ${note}`.trim();
    if (editing) {
      const { error } = await supabase.from("transactions")
        .update({ type: txnType, party_id: partyId, amount: amt, payment_method: mode, txn_date: date, notes: tagged })
        .eq("id", editing.id);
      if (error) { setSaving(false); toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("transactions").insert({
        type: txnType, party_id: partyId, order_id: null,
        amount: amt, payment_method: mode, txn_date: date, notes: tagged,
      });
      if (error) { setSaving(false); toast.error(error.message); return; }
    }
    setSaving(false);
    toast.success(editing ? "Payment updated" : "Payment saved");
    await onSaved();
    onOpenChange(false);
  };

  const isReceive = txnType === "credit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Payment" : "Add Payment"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Entry Type *</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTxnType("credit")}
                className={cn("rounded-md border-2 px-3 py-2.5 text-left transition-all",
                  isReceive ? "border-green-600 bg-green-50 dark:bg-green-950/30"
                            : "border-border bg-card hover:border-green-600/40")}>
                <div className="text-[10px] uppercase tracking-widest font-bold text-green-700 dark:text-green-400">
                  Credit · Money In
                </div>
                <div className="text-sm font-semibold">What I Receive</div>
              </button>
              <button type="button" onClick={() => setTxnType("debit")}
                className={cn("rounded-md border-2 px-3 py-2.5 text-left transition-all",
                  !isReceive ? "border-destructive bg-destructive/5"
                             : "border-border bg-card hover:border-destructive/40")}>
                <div className="text-[10px] uppercase tracking-widest font-bold text-destructive">
                  Debit · Money Out
                </div>
                <div className="text-sm font-semibold">What I Give</div>
              </button>
            </div>
          </div>

          <div>
            <Label>Party *</Label>
            <Combobox
              value={partyName}
              onChange={(t) => { setPartyName(t); setPartyId(""); }}
              onPick={(o) => { setPartyName(o.label); setPartyId(o.value); }}
              options={parties.map((p) => ({ value: p.id, label: p.name, hint: p.phone ?? undefined }))}
              placeholder="Pick a party"
              inputClassName="h-11"
            />
          </div>

          <div>
            <Label>Amount *</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
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

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {editing ? "Save" : isReceive ? "Record Receipt" : "Record Payment Out"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================
// Payment Ledger — party-wise totals: I gave vs I received
// ============================================================
export const PaymentLedgerPage = () => {
  const acct = useAcctFromUrl();
  const { parties, transactions } = useAppData();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"received" | "given">("received");
  const [q, setQ] = useState("");

  const summaries = useMemo(() => {
    type S = { id: string; name: string; received: number; given: number; count: number };
    const map = new Map<string, S>();
    transactions
      .filter((t) => !t.order_id && isStandaloneFor(t.notes, acct) && t.party_id)
      .forEach((t) => {
        const id = t.party_id!;
        const name = parties.find((p) => p.id === id)?.name ?? "—";
        if (!map.has(id)) map.set(id, { id, name, received: 0, given: 0, count: 0 });
        const s = map.get(id)!;
        s.count += 1;
        if (t.type === "credit") s.received += Number(t.amount);
        else s.given += Number(t.amount);
      });
    return Array.from(map.values());
  }, [transactions, parties, acct]);

  const filtered = useMemo(() => {
    const list = summaries.filter((s) =>
      tab === "received" ? s.received > 0 : s.given > 0
    );
    const term = q.toLowerCase().trim();
    return (term ? list.filter((s) => s.name.toLowerCase().includes(term)) : list)
      .sort((a, b) => (tab === "received" ? b.received - a.received : b.given - a.given));
  }, [summaries, tab, q]);

  const totals = useMemo(() => {
    const received = summaries.reduce((s, x) => s + x.received, 0);
    const given = summaries.reduce((s, x) => s + x.given, 0);
    return { received, given, net: received - given };
  }, [summaries]);

  const acctLabel = acct === "invoice" ? "Bill" : "Without";
  const acctTone = acct === "invoice" ? "text-primary" : "text-amber-600 dark:text-amber-400";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-extrabold tracking-tight">Payment Ledger</h1>
        <p className={cn("text-xs uppercase tracking-widest font-bold", acctTone)}>
          {acctLabel} Account · party-wise money flow
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest font-bold text-green-700 dark:text-green-400">From parties</div>
          <div className="font-bold text-sm text-green-600">{inr(totals.received)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest font-bold text-destructive">To parties</div>
          <div className="font-bold text-sm text-destructive">{inr(totals.given)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Net</div>
          <div className={cn("font-bold text-sm", totals.net >= 0 ? "text-green-600" : "text-destructive")}>
            {inr(Math.abs(totals.net))} {totals.net >= 0 ? "In" : "Out"}
          </div>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "received" | "given")}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="received">
            <ArrowDownCircle className="h-4 w-4 mr-1.5 text-green-600" />
            Money I Received
          </TabsTrigger>
          <TabsTrigger value="given">
            <ArrowUpCircle className="h-4 w-4 mr-1.5 text-destructive" />
            Money I Gave
          </TabsTrigger>
        </TabsList>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party" className="pl-9 h-11" />
        </div>

        <TabsContent value="received" className="mt-3">
          <PartyFlowList list={filtered} kind="received" onClick={(id) => navigate(`/payments?acct=${acct}`)} />
        </TabsContent>
        <TabsContent value="given" className="mt-3">
          <PartyFlowList list={filtered} kind="given" onClick={(id) => navigate(`/payments?acct=${acct}`)} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const PartyFlowList = ({
  list, kind, onClick,
}: {
  list: { id: string; name: string; received: number; given: number; count: number }[];
  kind: "received" | "given";
  onClick: (id: string) => void;
}) => {
  if (list.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        No parties to show
      </CardContent></Card>
    );
  }
  return (
    <div className="space-y-2">
      {list.map((s) => {
        const amt = kind === "received" ? s.received : s.given;
        const tone = kind === "received" ? "text-green-600" : "text-destructive";
        return (
          <Card key={s.id} onClick={() => onClick(s.id)} className="cursor-pointer hover:border-primary/50 active:scale-[0.99] transition">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.count} {s.count === 1 ? "entry" : "entries"}
                </div>
              </div>
              <div className={cn("font-bold text-sm shrink-0", tone)}>{inr(amt)}</div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PaymentsPage;
