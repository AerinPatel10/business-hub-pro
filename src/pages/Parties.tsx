import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppData, type Party, type Transaction, type OrderItem } from "@/contexts/AppDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ArrowLeft, Trash2, Phone, FileSpreadsheet, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { parseGstin } from "@/lib/gstin";

const balanceFor = (partyId: string, transactions: Transaction[]) => {
  return transactions
    .filter(t => t.party_id === partyId)
    .reduce((s, t) => s + (t.type === "debit" ? Number(t.amount) : -Number(t.amount)), 0);
};

export const PartyList = () => {
  const { parties, transactions } = useAppData();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "customer" | "supplier">("all");

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    return parties.filter(p =>
      (tab === "all" || p.type === tab) &&
      (!term || p.name.toLowerCase().includes(term) || (p.phone ?? "").includes(term))
    );
  }, [parties, q, tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Parties</h1>
        <Button asChild size="sm" className="h-10"><Link to={`/parties/new${tab === "supplier" ? "?type=supplier" : tab === "customer" ? "?type=customer" : ""}`}><Plus className="h-4 w-4 mr-1" /> Add {tab === "supplier" ? "Supplier" : tab === "customer" ? "Customer" : ""}</Link></Button>
      </div>

      <div className="flex gap-2">
        {(["all", "customer", "supplier"] as const).map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or phone" className="pl-9 h-12" />
      </div>

      {filtered.length === 0 ? (
        <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">No parties yet.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const bal = balanceFor(p.id, transactions) + Number(p.opening_balance);
            return (
              <Link key={p.id} to={`/parties/${p.id}`}>
                <Card className="card-elevated p-3 flex items-center justify-between active:scale-[0.99] transition">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate capitalize">
                      {p.type} {p.phone && `· ${p.phone}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {bal === 0 ? (
                      <div className="text-xs text-muted-foreground">Settled</div>
                    ) : bal > 0 ? (
                      <>
                        <div className="font-display font-bold text-destructive">{inr(bal)}</div>
                        <div className="text-[10px] text-destructive">Udhar (to collect)</div>
                      </>
                    ) : (
                      <>
                        <div className="font-display font-bold text-success">{inr(Math.abs(bal))}</div>
                        <div className="text-[10px] text-success">Jama (advance)</div>
                      </>
                    )}
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

const blank: Partial<Party> = { name: "", type: "customer", phone: "", email: "", address: "", gstin: "", pan: "", state: "", state_code: "", opening_balance: 0 };

export const PartyForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { parties, refresh } = useAppData();
  const editing = id && id !== "new" ? parties.find(p => p.id === id) : null;
  const [form, setForm] = useState<Partial<Party>>(editing ?? blank);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Party>(k: K, v: Party[K]) => setForm(f => ({ ...f, [k]: v }));

  const gstinInfo = useMemo(() => (form.gstin ? parseGstin(form.gstin) : null), [form.gstin]);

  const handleGstinChange = (raw: string) => {
    const upper = raw.toUpperCase().replace(/\s+/g, "").slice(0, 15);
    setForm(f => {
      const next: Partial<Party> = { ...f, gstin: upper };
      const info = parseGstin(upper);
      if (info.valid) {
        // Auto-fill state, state code, PAN if empty (don't overwrite user input)
        if (!f.state_code) next.state_code = info.stateCode!;
        if (!f.state) next.state = info.state!;
        if (!f.pan) next.pan = info.pan!;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const payload = {
      name: form.name!,
      type: form.type ?? "customer",
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      gstin: form.gstin || null,
      pan: form.pan || null,
      state: form.state || null,
      state_code: form.state_code || null,
      opening_balance: Number(form.opening_balance) || 0,
    };
    const { error } = editing
      ? await supabase.from("parties").update(payload).eq("id", editing.id)
      : await supabase.from("parties").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Party updated" : "Party added");
    await refresh();
    navigate("/parties");
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm("Delete this party?")) return;
    await supabase.from("parties").delete().eq("id", editing.id);
    await refresh();
    toast.success("Deleted");
    navigate("/parties");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="font-display text-2xl font-bold">{editing ? "Edit Party" : "Add Party"}</h1>
      </div>

      <Card className="card-elevated p-4 space-y-3">
        <div>
          <Label>Name *</Label>
          <Input value={form.name ?? ""} onChange={e => set("name", e.target.value)} className="h-12" />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={form.type ?? "customer"} onValueChange={v => set("type", v as "customer" | "supplier")}>
            <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} className="h-12" inputMode="tel" />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.state ?? ""} onChange={e => set("state", e.target.value)} className="h-12" />
          </div>
        </div>
        <div>
          <Label className="flex items-center gap-2">
            GSTIN
            {gstinInfo && form.gstin && (
              gstinInfo.valid ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                  <CheckCircle2 className="h-3 w-3" /> Valid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
                  <AlertCircle className="h-3 w-3" /> {gstinInfo.reason}
                </span>
              )
            )}
          </Label>
          <Input
            value={form.gstin ?? ""}
            onChange={e => handleGstinChange(e.target.value)}
            className={`h-12 font-mono uppercase tracking-wider ${gstinInfo && form.gstin && !gstinInfo.valid ? "border-destructive" : ""}`}
            placeholder="22AAAAA0000A1Z5"
            maxLength={15}
          />
          {gstinInfo?.valid && (
            <p className="text-[10px] text-success mt-1">Auto-filled state, state code & PAN from GSTIN.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>State Code</Label>
            <Input value={form.state_code ?? ""} onChange={e => set("state_code", e.target.value)} className="h-12" />
          </div>
          <div>
            <Label>PAN No</Label>
            <Input value={form.pan ?? ""} onChange={e => set("pan", e.target.value.toUpperCase())} className="h-12 font-mono uppercase" />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <Input value={form.email ?? ""} onChange={e => set("email", e.target.value)} className="h-12" inputMode="email" />
        </div>
        <div>
          <Label>Address</Label>
          <Textarea value={form.address ?? ""} onChange={e => set("address", e.target.value)} rows={2} />
        </div>
        <div>
          <Label>Opening Balance (₹) — positive = they owe you</Label>
          <Input type="number" inputMode="decimal" value={form.opening_balance ?? 0} onChange={e => set("opening_balance", Number(e.target.value))} className="h-12" />
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={busy} className="flex-1 h-12 font-semibold">{editing ? "Save" : "Add Party"}</Button>
        {editing && <Button variant="destructive" onClick={handleDelete} className="h-12"><Trash2 className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
};

export const PartyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { parties, transactions, orders } = useAppData();
  const party = parties.find(p => p.id === id);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportItems, setReportItems] = useState<OrderItem[] | null>(null);

  if (!party) return <div className="p-4">Party not found.</div>;

  const txns = transactions.filter(t => t.party_id === party.id);
  const partyOrders = orders.filter(o => o.party_id === party.id);
  const balance =
    txns.reduce((s, t) => s + (t.type === "debit" ? Number(t.amount) : -Number(t.amount)), 0) +
    Number(party.opening_balance);

  const openReport = async () => {
    setReportOpen(true);
    if (reportItems === null) {
      const ids = partyOrders.map(o => o.id);
      if (ids.length === 0) { setReportItems([]); return; }
      const { data } = await supabase.from("order_items").select("*").in("order_id", ids);
      setReportItems(data ?? []);
    }
  };

  const downloadReport = (mode: "summary" | "detailed") => {
    const fname = `${party.name.replace(/[^a-z0-9]/gi, "_")}-${mode}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    let header: string[];
    let rows: (string | number)[][];

    if (mode === "summary") {
      header = ["Invoice No", "Date", "Amount", "Paid", "Due", "Status"];
      rows = partyOrders.map(o => [
        o.invoice_number,
        format(new Date(o.invoice_date), "dd MMM yyyy"),
        Number(o.total).toFixed(2),
        Number(o.amount_paid).toFixed(2),
        (Number(o.total) - Number(o.amount_paid)).toFixed(2),
        o.payment_status,
      ]);
    } else {
      header = ["Invoice No", "Date", "Product", "HSN", "Qty", "Unit", "Rate", "Taxable", "GST %", "GST Amt", "Total"];
      const itemsByOrder = new Map<string, OrderItem[]>();
      (reportItems ?? []).forEach(it => {
        if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
        itemsByOrder.get(it.order_id)!.push(it);
      });
      rows = [];
      partyOrders.forEach(o => {
        const its = itemsByOrder.get(o.id) ?? [];
        if (its.length === 0) {
          rows.push([o.invoice_number, format(new Date(o.invoice_date), "dd MMM yyyy"), "—", "—", "0", "", 0, Number(o.subtotal).toFixed(2), "", (Number(o.cgst) + Number(o.sgst) + Number(o.igst)).toFixed(2), Number(o.total).toFixed(2)]);
        } else {
          its.forEach(it => {
            rows.push([
              o.invoice_number,
              format(new Date(o.invoice_date), "dd MMM yyyy"),
              it.product_name,
              it.hsn_code ?? "—",
              Number(it.quantity),
              it.unit ?? "",
              Number(it.price).toFixed(2),
              Number(it.taxable_amount).toFixed(2),
              `${it.gst_rate}%`,
              Number(it.tax_amount).toFixed(2),
              Number(it.total).toFixed(2),
            ]);
          });
        }
      });
    }

    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  const totalInvoiced = partyOrders.reduce((s, o) => s + Number(o.total), 0);
  const totalPaid = partyOrders.reduce((s, o) => s + Number(o.amount_paid), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold truncate">{party.name}</h1>
            <div className="text-xs text-muted-foreground capitalize truncate">{party.type}{party.phone && ` · ${party.phone}`}</div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={openReport}><FileSpreadsheet className="h-4 w-4 mr-1" />Report</Button>
          <Button asChild variant="outline" size="sm"><Link to={`/parties/${party.id}/edit`}>Edit</Link></Button>
        </div>
      </div>

      <Card className="card-elevated p-4">
        <div className="text-xs text-muted-foreground">Net Balance</div>
        <div className={`font-display text-3xl font-bold mt-1 ${balance > 0 ? "text-destructive" : balance < 0 ? "text-success" : ""}`}>
          {inr(Math.abs(balance))}
        </div>
        <div className="text-xs mt-1">
          {balance > 0 ? "Outstanding (to collect)" : balance < 0 ? "Advance paid" : "Settled"}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Total Invoiced</div>
            <div className="font-display font-bold text-sm">{inr(totalInvoiced)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Total Paid</div>
            <div className="font-display font-bold text-sm text-success">{inr(totalPaid)}</div>
          </div>
        </div>
        {party.phone && (
          <a href={`tel:${party.phone}`} className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary font-semibold">
            <Phone className="h-3 w-3" /> Call {party.phone}
          </a>
        )}
      </Card>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Report — {party.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Choose how detailed the export should be.</p>
            <button
              onClick={() => downloadReport("summary")}
              className="w-full text-left card-elevated p-4 active:scale-[0.99] transition flex items-center gap-3"
            >
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-sm">Summary</div>
                <div className="text-xs text-muted-foreground">Invoice numbers and amounts only</div>
              </div>
            </button>
            <button
              onClick={() => downloadReport("detailed")}
              className="w-full text-left card-elevated p-4 active:scale-[0.99] transition flex items-center gap-3"
            >
              <FileSpreadsheet className="h-5 w-5 text-accent shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-sm">Detailed</div>
                <div className="text-xs text-muted-foreground">Every line item with HSN, qty, GST</div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div>
        <h2 className="font-display font-bold text-sm mb-2">All Invoices ({partyOrders.length})</h2>
        {partyOrders.length === 0 ? (
          <Card className="card-elevated p-6 text-center text-sm text-muted-foreground">No invoices yet.</Card>
        ) : (
          <div className="space-y-2">
            {partyOrders.map(o => {
              const due = Number(o.total) - Number(o.amount_paid);
              return (
                <Link key={o.id} to={`/invoices/${o.id}`}>
                  <Card className="card-elevated p-3 flex items-center justify-between active:scale-[0.99] transition">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{o.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(o.invoice_date)} · <span className="capitalize">{o.payment_status}</span></div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display font-bold">{inr(o.total)}</div>
                      {due > 0 && <div className="text-[10px] text-destructive">Due {inr(due)}</div>}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
