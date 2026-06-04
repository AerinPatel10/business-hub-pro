import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/Combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { inr } from "@/lib/format";
import { toast } from "sonner";

interface LineItem {
  product_id: string | null;
  product_name: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  price: number;
  discount: number;
  gst_rate: number;
}

const newLine = (): LineItem => ({
  product_id: null, product_name: "", hsn_code: "", quantity: 1, unit: "pcs", price: 0, discount: 0, gst_rate: 18,
});

interface InvoiceNewProps {
  /** "estimate" hides payment fields and saves with order_type='estimate'. "purchase" uses suppliers and saves with order_type='purchase'. */
  mode?: "invoice" | "estimate" | "purchase";
}

const InvoiceNew = ({ mode = "invoice" }: InvoiceNewProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEdit = location.pathname.endsWith("/edit") && !!id;
  const { user } = useAuth();
  const { products, parties, settings, profile, orders, refresh } = useAppData();

  const [partyId, setPartyId] = useState<string | null>(null);  // null = walk-in / freetext
  const [partyName, setPartyName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  // taxMode: "auto" decides based on party state vs business state; user can override
  const [taxMode, setTaxMode] = useState<"auto" | "intra" | "inter">("auto");
  const [discount, setDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([newLine()]);
  const [busy, setBusy] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [loadedEdit, setLoadedEdit] = useState(false);

  // Quick-add new product dialog
  const [quickAdd, setQuickAdd] = useState<{ rowIndex: number; name: string; price: string; hsn: string; gst: string; unit: string } | null>(null);
  const [quickAddBusy, setQuickAddBusy] = useState(false);

  const isEstimate = mode === "estimate";
  const isPurchase = mode === "purchase";
  const docLabel = isEstimate ? "Estimate" : isPurchase ? "Purchase" : "Invoice";
  const estimatePrefix = (settings as { estimate_prefix?: string } | null)?.estimate_prefix ?? "EST-";
  const nextEstimateNumber = (settings as { next_estimate_number?: number } | null)?.next_estimate_number ?? 1;
  const purchasePrefix = "PUR-";
  const numberPrefix = isEstimate ? estimatePrefix : (settings?.invoice_prefix ?? "INV-");

  // Compute smallest missing positive integer for a given prefix from existing orders
  const nextAvailableNumber = (prefix: string, orderType: "sale" | "estimate" | "purchase") => {
    const used = new Set<number>();
    for (const o of orders) {
      if (o.order_type !== orderType) continue;
      const num = o.invoice_number ?? "";
      if (!num.startsWith(prefix)) continue;
      const n = parseInt(num.slice(prefix.length), 10);
      if (!isNaN(n) && n > 0) used.add(n);
    }
    let n = 1;
    while (used.has(n)) n++;
    return n;
  };

  // Generate next number for new docs — fills gaps from deleted/manually-entered numbers
  useEffect(() => {
    if (settings && !isEdit) {
      if (isEstimate) {
        const n = nextAvailableNumber(estimatePrefix, "estimate");
        setInvoiceNumber(`${estimatePrefix}${String(n).padStart(4, "0")}`);
      } else if (isPurchase) {
        const n = nextAvailableNumber(purchasePrefix, "purchase");
        setInvoiceNumber(`${purchasePrefix}${String(n).padStart(4, "0")}`);
      } else {
        const prefix = settings.invoice_prefix ?? "INV-";
        const n = nextAvailableNumber(prefix, "sale");
        setInvoiceNumber(`${prefix}${String(n).padStart(4, "0")}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, isEdit, isEstimate, isPurchase, estimatePrefix, orders]);

  // Pre-fill party from ?partyId=... or ?walkin=Name (used when coming from a party page)
  useEffect(() => {
    if (isEdit) return;
    const params = new URLSearchParams(location.search);
    const pid = params.get("partyId");
    const walkin = params.get("walkin");
    if (pid) {
      const p = parties.find(x => x.id === pid);
      if (p) {
        setPartyId(p.id);
        setPartyName(p.name);
      }
    } else if (walkin) {
      setPartyId(null);
      setPartyName(walkin);
    }
  }, [isEdit, location.search, parties]);

  // Load existing for edit
  useEffect(() => {
    if (!isEdit || !id || loadedEdit) return;
    const ord = orders.find(o => o.id === id);
    if (!ord) return;
    setPartyId(ord.party_id);
    setPartyName(ord.party_name ?? "");
    setInvoiceDate(ord.invoice_date);
    setTaxMode(ord.is_interstate ? "inter" : "intra");
    setDiscount(Number(ord.discount));
    setAmountPaid(Number(ord.amount_paid));
    setNotes(ord.notes ?? "");
    setInvoiceNumber(ord.invoice_number);
    supabase.from("order_items").select("*").eq("order_id", id).then(({ data }) => {
      if (data && data.length) {
        setItems(data.map(it => ({
          product_id: it.product_id,
          product_name: it.product_name,
          hsn_code: it.hsn_code ?? "",
          quantity: Number(it.quantity),
          unit: it.unit,
          price: Number(it.price),
          discount: Number(it.discount),
          gst_rate: Number(it.gst_rate),
        })));
      }
      setLoadedEdit(true);
    });
  }, [isEdit, id, orders, loadedEdit]);

  const selectedParty = partyId ? parties.find(p => p.id === partyId) : null;

  // Party autocomplete options (customers only)
  const partyOptions = useMemo(() => parties
    .filter(p => isPurchase ? p.type === "supplier" : p.type === "customer")
    .map(p => ({ value: p.id, label: p.name, hint: p.phone ?? p.gstin ?? undefined })), [parties, isPurchase]);

  const productOptions = useMemo(() => products.map(p => ({
    value: p.id, label: p.name, hint: inr(p.price),
  })), [products]);

  const updateItem = (i: number, patch: Partial<LineItem>) => {
    setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };

  const pickProduct = (i: number, productId: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    updateItem(i, {
      product_id: p.id,
      product_name: p.name,
      hsn_code: p.hsn_code ?? "",
      price: Number(p.price),
      gst_rate: Number(p.gst_rate),
      unit: p.unit,
    });
  };

  const removeItem = (i: number) => setItems(arr => arr.filter((_, idx) => idx !== i));

  const openQuickAdd = (rowIndex: number, name: string) => {
    setQuickAdd({
      rowIndex,
      name,
      price: "",
      hsn: "",
      gst: String(settings?.default_gst_rate ?? 18),
      unit: "pcs",
    });
  };

  const saveQuickAdd = async () => {
    if (!quickAdd || !user) return;
    if (!quickAdd.name.trim()) { toast.error("Item name required"); return; }
    setQuickAddBusy(true);
    const { data, error } = await supabase.from("products").insert({
      name: quickAdd.name.trim(),
      hsn_code: quickAdd.hsn.trim() || null,
      price: Number(quickAdd.price) || 0,
      gst_rate: Number(quickAdd.gst) || 0,
      unit: quickAdd.unit.trim() || "pcs",
    }).select().single();
    if (error || !data) { setQuickAddBusy(false); toast.error(error?.message ?? "Failed to add item"); return; }
    updateItem(quickAdd.rowIndex, {
      product_id: data.id,
      product_name: data.name,
      hsn_code: data.hsn_code ?? "",
      price: Number(data.price),
      gst_rate: Number(data.gst_rate),
      unit: data.unit,
    });
    toast.success(`“${data.name}” added to your items`);
    setQuickAdd(null);
    setQuickAddBusy(false);
    await refresh();
  };

  // Auto-detect interstate: business state vs party state. If states differ → IGST.
  const businessState = (profile?.state ?? "").trim().toLowerCase();
  const partyState = (selectedParty?.state ?? "").trim().toLowerCase();
  const autoInterstate = !!(businessState && partyState && businessState !== partyState);
  const isInterstate = taxMode === "auto" ? autoInterstate : taxMode === "inter";

  const totals = useMemo(() => {
    let subtotal = 0, totalTax = 0;
    const enriched = items.map(it => {
      const lineGross = (Number(it.quantity) || 0) * (Number(it.price) || 0);
      // For estimate: `discount` field stores a percentage (Less %). For invoice: rupee amount.
      const lineDiscount = isEstimate
        ? lineGross * ((Number(it.discount) || 0) / 100)
        : (Number(it.discount) || 0);
      const taxable = Math.max(0, lineGross - lineDiscount);
      const tax = isEstimate ? 0 : taxable * ((Number(it.gst_rate) || 0) / 100);
      subtotal += taxable;
      totalTax += tax;
      return { ...it, taxable_amount: taxable, tax_amount: tax, total: taxable + tax };
    });
    // For estimate: bottom `discount` is %, for invoice: rupees.
    const bottomDiscountAmt = isEstimate
      ? subtotal * ((Number(discount) || 0) / 100)
      : (Number(discount) || 0);
    const afterDiscount = Math.max(0, subtotal - bottomDiscountAmt);
    const ratio = subtotal > 0 ? afterDiscount / subtotal : 1;
    const finalTax = totalTax * ratio;
    const cgst = isInterstate ? 0 : finalTax / 2;
    const sgst = isInterstate ? 0 : finalTax / 2;
    const igst = isInterstate ? finalTax : 0;
    const total = afterDiscount + finalTax;
    return { subtotal, cgst, sgst, igst, total, enriched, bottomDiscountAmt };
  }, [items, discount, isInterstate, isEstimate]);

  const save = async () => {
    if (!user) return;
    if (items.length === 0 || items.every(i => !i.product_name.trim())) {
      toast.error("Add at least one item");
      return;
    }
    if (!invoiceNumber.trim()) { toast.error(`${docLabel} number required`); return; }
    if (!partyName.trim()) { toast.error("Customer name required"); return; }

    setBusy(true);
    const partyData = selectedParty
      ? { party_id: selectedParty.id, party_name: selectedParty.name, party_gstin: selectedParty.gstin, party_state: selectedParty.state }
      : { party_id: null, party_name: partyName.trim(), party_gstin: null, party_state: null };

    const orderPayload = {
      invoice_number: invoiceNumber.trim(),
      order_type: (isEstimate ? "estimate" : isPurchase ? "purchase" : "sale") as "estimate" | "sale" | "purchase",
      ...partyData,
      invoice_date: invoiceDate,
      is_interstate: isInterstate,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      discount: totals.bottomDiscountAmt,
      total: totals.total,
      amount_paid: isEstimate ? 0 : (Number(amountPaid) || 0),
      payment_status: (isEstimate
        ? "unpaid"
        : (amountPaid >= totals.total ? "paid" : amountPaid > 0 ? "partial" : "unpaid")) as "paid" | "partial" | "unpaid",
      notes: notes || null,
    };

    let orderId = id;
    if (isEdit && id) {
      const { error } = await supabase.from("orders").update(orderPayload).eq("id", id);
      if (error) { setBusy(false); toast.error(error.message); return; }
      await supabase.from("order_items").delete().eq("order_id", id);
      await supabase.from("transactions").delete().eq("order_id", id);
    } else {
      const { data: order, error } = await supabase.from("orders").insert({
        ...orderPayload,
        status: "send",
      }).select().single();
      if (error || !order) { setBusy(false); toast.error(error?.message ?? "Failed"); return; }
      orderId = order.id;
    }

    const itemRows = totals.enriched.filter(it => it.product_name.trim()).map(it => ({
      order_id: orderId!,
      product_id: it.product_id,
      product_name: it.product_name,
      hsn_code: it.hsn_code || null,
      quantity: Number(it.quantity) || 0,
      unit: it.unit || "pcs",
      price: Number(it.price) || 0,
      discount: isEstimate
        ? ((Number(it.quantity) || 0) * (Number(it.price) || 0)) * ((Number(it.discount) || 0) / 100)
        : (Number(it.discount) || 0),
      gst_rate: Number(it.gst_rate) || 0,
      taxable_amount: it.taxable_amount,
      tax_amount: it.tax_amount,
      total: it.total,
    }));

    const { error: itemErr } = await supabase.from("order_items").insert(itemRows);
    if (itemErr) { setBusy(false); toast.error(itemErr.message); return; }

    // Only record the payment (credit). The invoice itself is the debit entry on the ledger.
    if (!isEstimate && selectedParty && Number(amountPaid) > 0) {
      await supabase.from("transactions").insert({
        party_id: selectedParty.id, order_id: orderId!, type: "credit",
        amount: Number(amountPaid), payment_method: "Cash",
        notes: `Payment for ${invoiceNumber}`,
      });
    }

    if (!isEdit && settings) {
      // Parse the just-saved number so settings tracks the highest used, not a blind +1
      const parseNum = (s: string, prefix: string) => {
        const n = parseInt((s ?? "").startsWith(prefix) ? s.slice(prefix.length) : s, 10);
        return isNaN(n) ? 0 : n;
      };
      if (isEstimate) {
        const justUsed = parseNum(invoiceNumber.trim(), estimatePrefix);
        const newNext = Math.max(nextEstimateNumber, justUsed + 1);
        await supabase.from("app_settings").update({ next_estimate_number: newNext }).eq("id", settings.id);
      } else if (!isPurchase) {
        const prefix = settings.invoice_prefix ?? "INV-";
        const justUsed = parseNum(invoiceNumber.trim(), prefix);
        const newNext = Math.max(settings.next_invoice_number, justUsed + 1);
        await supabase.from("app_settings").update({ next_invoice_number: newNext }).eq("id", settings.id);
      }
    }

    setBusy(false);
    toast.success(isEdit ? `${docLabel} updated` : `${docLabel} created`);
    await refresh();
    navigate(isEstimate ? `/estimates/${orderId}` : isPurchase ? `/purchases/${orderId}` : `/invoices/${orderId}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="font-display text-2xl font-bold">{isEdit ? `Edit ${docLabel}` : `New ${docLabel}`}</h1>
      </div>

      <Card className="card-elevated p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{docLabel} #</Label>
            <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="h-12" />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="h-12" />
          </div>
        </div>

        <div>
          <Label>{isPurchase ? "Supplier" : "Customer"}</Label>
          <Combobox
            value={partyName}
            onChange={text => { setPartyName(text); setPartyId(null); }}
            onPick={opt => { setPartyId(opt.value); setPartyName(opt.label); }}
            options={partyOptions}
            placeholder={isPurchase ? "Type supplier name…" : "Type customer name…"}
            inputClassName="h-12"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {isPurchase
              ? "Type to search saved suppliers, or enter a new name."
              : "Type to search saved customers, or enter a new name for a walk-in."}
          </p>
        </div>

        {!isEstimate && (
          <div className="p-3 rounded-lg bg-secondary/60 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">GST Type</div>
                <div className="text-xs text-muted-foreground">
                  {taxMode === "auto"
                    ? (businessState && partyState
                        ? (autoInterstate
                            ? `Auto: IGST (${profile?.state} → ${selectedParty?.state})`
                            : `Auto: CGST + SGST (same state)`)
                        : "Auto: set business & party state to detect")
                    : taxMode === "inter"
                      ? "Manual: IGST (other state)"
                      : "Manual: CGST + SGST (same state)"}
                </div>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded ${isInterstate ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"}`}>
                {isInterstate ? "IGST" : "CGST+SGST"}
              </span>
            </div>
            <RadioGroup
              value={taxMode}
              onValueChange={v => setTaxMode(v as "auto" | "intra" | "inter")}
              className="grid grid-cols-3 gap-2"
            >
              <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${taxMode === "auto" ? "border-primary bg-primary/10" : "border-border"}`}>
                <RadioGroupItem value="auto" /> <span className="text-xs font-semibold">Auto</span>
              </label>
              <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${taxMode === "intra" ? "border-primary bg-primary/10" : "border-border"}`}>
                <RadioGroupItem value="intra" /> <span className="text-xs font-semibold">Same State</span>
              </label>
              <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${taxMode === "inter" ? "border-primary bg-primary/10" : "border-border"}`}>
                <RadioGroupItem value="inter" /> <span className="text-xs font-semibold">Other State</span>
              </label>
            </RadioGroup>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="font-display font-bold text-sm">Items</h2>
        {items.map((it, i) => (
          <Card key={i} className="card-elevated p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Label className="text-xs">Product / Service</Label>
                <Combobox
                  value={it.product_name}
                  onChange={text => updateItem(i, { product_name: text, product_id: null })}
                  onPick={opt => pickProduct(i, opt.value)}
                  options={productOptions}
                  placeholder="Type item name…"
                  onCreate={text => openQuickAdd(i, text)}
                  createLabel="Add new item"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Type to search your items, or pick <span className="font-semibold text-primary">+ Add new item</span> to save it.
                </p>
              </div>
              {items.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeItem(i)} className="mt-5">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Qty</Label>
                <Input type="number" inputMode="decimal" value={it.quantity} onChange={e => updateItem(i, { quantity: Number(e.target.value) })} className="h-11" />
              </div>
              <div>
                <Label className="text-xs">Price</Label>
                <Input type="number" inputMode="decimal" value={it.price} onChange={e => updateItem(i, { price: Number(e.target.value) })} className="h-11" />
              </div>
              {isEstimate ? (
                <div>
                  <Label className="text-xs">Less %</Label>
                  <Input type="number" inputMode="decimal" value={it.discount} onChange={e => updateItem(i, { discount: Number(e.target.value) })} className="h-11" />
                </div>
              ) : (
                <div>
                  <Label className="text-xs">GST %</Label>
                  <Input type="number" inputMode="decimal" value={it.gst_rate} onChange={e => updateItem(i, { gst_rate: Number(e.target.value) })} className="h-11" />
                </div>
              )}
            </div>
            <div className="text-right text-sm">
              Line total: <span className="font-display font-bold">{inr(
                isEstimate
                  ? (it.quantity * it.price) * (1 - (it.discount || 0) / 100)
                  : (it.quantity * it.price - it.discount) * (1 + it.gst_rate / 100)
              )}</span>
            </div>
          </Card>
        ))}
        <Button onClick={() => setItems(arr => [...arr, newLine()])} variant="outline" className="w-full h-12">
          <Plus className="h-4 w-4 mr-2" /> Add Item
        </Button>
      </div>

      <Card className="card-elevated p-4 space-y-2">
        <div className="flex justify-between text-sm"><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
        <div className="flex justify-between items-center text-sm">
          <Label className="m-0">{isEstimate ? "Discount (%)" : "Discount (₹)"}</Label>
          <Input type="number" inputMode="decimal" value={discount} onChange={e => setDiscount(Number(e.target.value))} className="h-9 w-28 text-right" />
        </div>
        {isEstimate ? (
          (Number(discount) || 0) > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Less</span><span>− {inr(totals.bottomDiscountAmt)}</span>
            </div>
          )
        ) : isInterstate ? (
          <div className="flex justify-between text-sm"><span>IGST</span><span>{inr(totals.igst)}</span></div>
        ) : (
          <>
            <div className="flex justify-between text-sm"><span>CGST</span><span>{inr(totals.cgst)}</span></div>
            <div className="flex justify-between text-sm"><span>SGST</span><span>{inr(totals.sgst)}</span></div>
          </>
        )}
        <div className="border-t pt-2 flex justify-between font-display font-bold text-lg"><span>Total</span><span>{inr(totals.total)}</span></div>
        {!isEstimate && (
          <>
            <div className="flex justify-between items-center text-sm">
              <Label className="m-0">Paid Now (₹)</Label>
              <Input type="number" inputMode="decimal" value={amountPaid} onChange={e => setAmountPaid(Number(e.target.value))} className="h-9 w-28 text-right" />
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Balance</span>
              <span className="text-destructive">{inr(Math.max(0, totals.total - amountPaid))}</span>
            </div>
          </>
        )}
      </Card>

      <Card className="card-elevated p-4">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      </Card>

      <Button onClick={save} disabled={busy} className="w-full h-14 text-base font-semibold">
        <Save className="h-5 w-5 mr-2" /> {isEdit ? `Update ${docLabel}` : `Save ${docLabel}`} · {inr(totals.total)}
      </Button>

      {/* Quick-add new product dialog */}
      <Dialog open={!!quickAdd} onOpenChange={o => !o && setQuickAdd(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
          </DialogHeader>
          {quickAdd && (
            <div className="space-y-3">
              <div>
                <Label>Item Name</Label>
                <Input
                  value={quickAdd.name}
                  onChange={e => setQuickAdd({ ...quickAdd, name: e.target.value })}
                  className="h-12"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Price (₹)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={quickAdd.price}
                    onChange={e => setQuickAdd({ ...quickAdd, price: e.target.value })}
                    className="h-12"
                  />
                </div>
                <div>
                  <Label>GST %</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={quickAdd.gst}
                    onChange={e => setQuickAdd({ ...quickAdd, gst: e.target.value })}
                    className="h-12"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>HSN / SAC</Label>
                  <Input
                    value={quickAdd.hsn}
                    onChange={e => setQuickAdd({ ...quickAdd, hsn: e.target.value })}
                    className="h-12"
                  />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Input
                    value={quickAdd.unit}
                    onChange={e => setQuickAdd({ ...quickAdd, unit: e.target.value })}
                    className="h-12"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This item will be saved to your inventory and added to the invoice.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAdd(null)} disabled={quickAddBusy}>Cancel</Button>
            <Button onClick={saveQuickAdd} disabled={quickAddBusy}>
              {quickAddBusy ? "Saving…" : "Save & Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoiceNew;
