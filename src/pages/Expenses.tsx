import { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORIES = ["Rent", "Salary", "Electricity", "Travel", "Stationery", "Marketing", "Misc"];

const Expenses = () => {
  const { expenses, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("Misc");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Cash");
  const [notes, setNotes] = useState("");

  const save = async () => {
    if (amount <= 0) { toast.error("Enter amount"); return; }
    const { error } = await supabase.from("expenses").insert({
      category, amount, expense_date: date, payment_method: method, notes: notes || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Expense added");
    setOpen(false); setAmount(0); setNotes("");
    await refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Expenses</h1>
        <Button onClick={() => setOpen(true)} size="sm" className="h-10"><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      {expenses.length === 0 ? (
        <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">No expenses recorded.</Card>
      ) : (
        <div className="space-y-2">
          {expenses.map(e => (
            <Card key={e.id} className="card-elevated p-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">{e.category}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(e.expense_date)} · {e.payment_method ?? ""}</div>
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
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
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
