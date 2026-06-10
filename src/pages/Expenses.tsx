import { useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { useAccountMode } from "@/contexts/AccountModeContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileDown } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/Combobox";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// We encode the optional category AND the account mode (invoice/estimate) as
// prefixes in the existing `notes` column so no schema change is required.
// Format: `#mode:invoice##cat:CategoryName# rest of notes`
// Legacy rows (no #mode:...# prefix) are treated as "invoice" so they keep
// showing in the Bill mode where they were originally entered.
const MODE_RE = /^#mode:(invoice|estimate)#/;
const CAT_RE = /^#cat:([^#]+)#\s?/;
type Mode = "invoice" | "estimate";
type ParsedNotes = { mode: Mode; tag: string; notes: string };
const parseNotes = (raw: string | null | undefined): ParsedNotes => {
  let s = String(raw ?? "");
  let mode: Mode = "invoice";
  const mm = s.match(MODE_RE);
  if (mm) { mode = mm[1] as Mode; s = s.replace(MODE_RE, ""); }
  const cm = s.match(CAT_RE);
  let tag = "";
  if (cm) { tag = cm[1].trim(); s = s.replace(CAT_RE, ""); }
  return { mode, tag, notes: s };
};
const encodeNotes = (mode: Mode, tag: string, notes: string): string => {
  const t = tag.trim(); const n = (notes ?? "").trim();
  const head = `#mode:${mode}#` + (t ? `#cat:${t}#` : "");
  return n ? `${head} ${n}` : head;
};

const Expenses = () => {
  const { expenses, refresh, profile } = useAppData();
  const { mode } = useAccountMode();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [filterTag, setFilterTag] = useState<string>("all");

  // Decorate expenses with parsed tag + clean notes for display/filtering.
  const decorated = useMemo(
    () => expenses.map(e => ({ ...e, ...parseNotes(e.notes) })),
    [expenses]
  );

  const allTags = useMemo(() => {
    const s = new Set<string>();
    decorated.forEach(e => { if (e.tag) s.add(e.tag); });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [decorated]);

  // Scope by current account mode (Bill vs Without).
  const scoped = useMemo(() => decorated.filter(e => e.mode === mode), [decorated, mode]);

  const visible = useMemo(() => {
    if (filterTag === "all") return scoped;
    if (filterTag === "__none__") return scoped.filter(e => !e.tag);
    return scoped.filter(e => e.tag === filterTag);
  }, [scoped, filterTag]);

  const total = useMemo(() => visible.reduce((s, e) => s + Number(e.amount || 0), 0), [visible]);

  const save = async () => {
    const name = category.trim();
    if (!name) { toast.error("Enter expense name"); return; }
    if (amount <= 0) { toast.error("Enter amount"); return; }
    const { error } = await supabase.from("expenses").insert({
      category: name,
      amount,
      expense_date: date,
      payment_method: method,
      notes: encodeNotes(mode, tag, notes),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Expense added");
    setOpen(false);
    setAmount(0); setNotes(""); setCategory(""); setTag("");
    await refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    await refresh();
  };

  const exportPDF = () => {
    if (visible.length === 0) { toast.error("Nothing to export"); return; }
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const biz = (profile as any)?.business_name || "Expenses Report";
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(String(biz), pageW / 2, 40, { align: "center" });
    doc.setFontSize(12);
    const sub = filterTag === "all" ? "All Expenses"
      : filterTag === "__none__" ? "Uncategorised Expenses"
      : `Category: ${filterTag}`;
    doc.text(sub, pageW / 2, 60, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Generated: ${fmtDate(new Date())}`, pageW / 2, 76, { align: "center" });

    const rows = visible.map(e => [
      fmtDate(e.expense_date),
      e.category || "",
      e.tag || "-",
      e.payment_method || "",
      e.notes || "",
      inr(e.amount),
    ]);

    autoTable(doc, {
      startY: 92,
      head: [["Date", "Expense", "Category", "Method", "Notes", "Amount"]],
      body: rows,
      foot: [[
        { content: "Total", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
        { content: inr(total), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: { 5: { halign: "right" } },
      margin: { left: 28, right: 28 },
    });

    const safe = filterTag === "all" ? "all" : filterTag.replace(/[^a-z0-9]+/gi, "_");
    doc.save(`expenses-${safe}-${Date.now()}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Expenses</h1>
        <div className="flex gap-2">
          <Button onClick={exportPDF} size="sm" variant="outline" className="h-10">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button onClick={() => setOpen(true)} size="sm" className="h-10">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <Card className="card-elevated p-3 flex items-center gap-3">
        <Label className="text-xs whitespace-nowrap">Category</Label>
        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="__none__">Uncategorised</SelectItem>
            {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-right">
          <div className="text-[10px] text-muted-foreground">Total</div>
          <div className="font-display font-bold text-destructive">{inr(total)}</div>
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">No expenses to show.</Card>
      ) : (
        <div className="space-y-2">
          {visible.map(e => (
            <Card key={e.id} className="card-elevated p-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">{e.category}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtDate(e.expense_date)} · {e.payment_method ?? ""}
                  {e.tag && <span className="ml-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{e.tag}</span>}
                </div>
                {e.notes && <div className="text-xs mt-0.5">{e.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <div className="font-display font-bold text-destructive">{inr(e.amount)}</div>
                <Button variant="ghost" size="icon" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Expense Name *</Label>
              <Input
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. Rent, Internet bill, Tea, etc."
                className="h-12"
                autoFocus
                maxLength={80}
              />
            </div>
            <div>
              <Label>Category (optional)</Label>
              <Combobox
                value={tag}
                onChange={setTag}
                onPick={(opt) => setTag(opt.label)}
                onCreate={(text) => setTag(text)}
                options={allTags.map(t => ({ value: t, label: t }))}
                placeholder="e.g. Office, Travel, Utilities"
                createLabel="Use new category"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                Group expenses so you can filter the list and PDF by category.
              </div>
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Input type="number" inputMode="decimal" value={amount || ""} onChange={e => setAmount(Number(e.target.value))} className="h-12" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12" />
              </div>
              <div>
                <Label>Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Cash", "UPI", "Bank Transfer", "Card"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-12" />
            </div>
            <Button onClick={save} className="w-full h-12 font-semibold">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
