import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppData, type Product } from "@/contexts/AppDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit2, Trash2, ArrowLeft } from "lucide-react";
import { inr } from "@/lib/format";
import { toast } from "sonner";

export const InventoryList = () => {
  const { products } = useAppData();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) return products;
    return products.filter(p => p.name.toLowerCase().includes(term) || (p.sku ?? "").toLowerCase().includes(term));
  }, [products, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Inventory</h1>
        <Button asChild size="sm" className="h-10"><Link to="/inventory/new"><Plus className="h-4 w-4 mr-1" /> Add</Link></Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items or SKU" className="pl-9 h-12" />
      </div>

      {filtered.length === 0 ? (
        <Card className="card-elevated p-8 text-center text-sm text-muted-foreground">
          No products yet. Add your first item.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <Link key={p.id} to={`/inventory/${p.id}`}>
              <Card className="card-elevated p-3 flex items-center justify-between active:scale-[0.99] transition">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.sku ? `SKU ${p.sku} · ` : ""}HSN {p.hsn_code || "-"} · GST {p.gst_rate}%
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display font-bold">{inr(p.price)}</div>
                  <div className="text-xs text-muted-foreground">per {p.unit}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const blank: Partial<Product> = {
  name: "", sku: "", hsn_code: "", price: 0, cost: 0, stock: 0, unit: "pcs", gst_rate: 18, low_stock_threshold: 5, is_active: true,
};

export const ProductForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, categories, refresh } = useAppData();
  const editing = id && id !== "new" ? products.find(p => p.id === id) : null;
  const [form, setForm] = useState<Partial<Product>>(editing ?? blank);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    const payload = {
      name: form.name!,
      sku: form.sku || null,
      hsn_code: form.hsn_code || null,
      category_id: form.category_id || null,
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0,
      unit: form.unit || "pcs",
      gst_rate: Number(form.gst_rate) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
      is_active: form.is_active ?? true,
    };
    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Item updated" : "Item added");
    await refresh();
    navigate("/inventory");
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("products").delete().eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Item deleted");
    await refresh();
    navigate("/inventory");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="font-display text-2xl font-bold">{editing ? "Edit Item" : "Add Item"}</h1>
      </div>

      <Card className="card-elevated p-4 space-y-3">
        <div>
          <Label>Name *</Label>
          <Input value={form.name ?? ""} onChange={e => set("name", e.target.value)} className="h-12" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>SKU</Label>
            <Input value={form.sku ?? ""} onChange={e => set("sku", e.target.value)} className="h-12" />
          </div>
          <div>
            <Label>HSN Code</Label>
            <Input value={form.hsn_code ?? ""} onChange={e => set("hsn_code", e.target.value)} className="h-12" />
          </div>
        </div>
        <div>
          <Label>Category</Label>
          <Select value={form.category_id ?? "none"} onValueChange={v => set("category_id", v === "none" ? null : v)}>
            <SelectTrigger className="h-12"><SelectValue placeholder="No category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Sale Price (₹) *</Label>
            <Input type="number" inputMode="decimal" value={form.price ?? 0} onChange={e => set("price", Number(e.target.value))} className="h-12" />
          </div>
          <div>
            <Label>Cost Price (₹)</Label>
            <Input type="number" inputMode="decimal" value={form.cost ?? 0} onChange={e => set("cost", Number(e.target.value))} className="h-12" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Unit</Label>
            <Input value={form.unit ?? "pcs"} onChange={e => set("unit", e.target.value)} className="h-12" />
          </div>
          <div>
            <Label>GST %</Label>
            <Input type="number" inputMode="decimal" value={form.gst_rate ?? 18} onChange={e => set("gst_rate", Number(e.target.value))} className="h-12" />
          </div>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={busy} className="flex-1 h-12 text-base font-semibold">
          {editing ? <Edit2 className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          {editing ? "Save Changes" : "Add Item"}
        </Button>
        {editing && (
          <Button variant="destructive" onClick={handleDelete} className="h-12">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
