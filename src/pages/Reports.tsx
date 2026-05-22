import { useEffect, useMemo, useState } from "react";
import { useAppData, type OrderItem } from "@/contexts/AppDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr } from "@/lib/format";
import { startOfDay, endOfDay, startOfMonth, startOfYear, isAfter, isBefore, format, eachDayOfInterval, subDays, parseISO } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Download, FileSpreadsheet, ChevronDown, ChevronRight, User, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Range = "today" | "month" | "year" | "all" | "custom";

interface LineRow {
  invoice: string;
  date: string;
  customer: string;
  product: string;
  hsn: string;
  qty: string;
  rate: number;
  taxable: number;
  gstRate: number;
  gstAmt: number;
  total: number;
}

const downloadCSV = (filename: string, header: string[], rows: (string | number)[][]) => {
  const csv = [header, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/[^a-z0-9._-]+/gi, "_")}-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const Reports = () => {
  const { orders, parties, transactions, profile } = useAppData();
  const [range, setRange] = useState<Range>("month");
  const [customFrom, setCustomFrom] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [customerId, setCustomerId] = useState<string>("all");
  const [allItems, setAllItems] = useState<OrderItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statementPartyId, setStatementPartyId] = useState<string>("");

  useEffect(() => {
    supabase.from("order_items").select("*").then(({ data }) => setAllItems(data ?? []));
  }, [orders]);

  const start = useMemo(() => {
    if (range === "today") return startOfDay(new Date());
    if (range === "year") return startOfYear(new Date());
    if (range === "all") return new Date(0);
    if (range === "custom") {
      try { return startOfDay(parseISO(customFrom)); } catch { return new Date(0); }
    }
    return startOfMonth(new Date());
  }, [range, customFrom]);

  const end = useMemo(() => {
    if (range === "custom") {
      try { return endOfDay(parseISO(customTo)); } catch { return new Date(); }
    }
    return null;
  }, [range, customTo]);

  const inRange = (dateStr: string) => {
    const d = new Date(dateStr);
    if (!isAfter(d, start)) return false;
    if (end && isAfter(d, end)) return false;
    return true;
  };

  // Sales filtered orders (for sales tab)
  const filteredSales = useMemo(() => {
    return orders.filter(o =>
      o.order_type === "sale" &&
      o.status !== "cancelled" &&
      inRange(o.created_at) &&
      (customerId === "all" || o.party_id === customerId)
    );
  }, [orders, start, end, customerId]);

  const filteredEstimates = useMemo(() => {
    return orders.filter(o =>
      o.order_type === "estimate" &&
      o.status !== "cancelled" &&
      inRange(o.created_at) &&
      (customerId === "all" || o.party_id === customerId)
    );
  }, [orders, start, end, customerId]);

  const stats = useMemo(() => {
    const sales = filteredSales;
    const salesTotal = sales.reduce((s, o) => s + Number(o.total), 0);
    const taxableTotal = sales.reduce((s, o) => s + Number(o.subtotal), 0);
    const gstCollected = sales.reduce((s, o) => s + Number(o.cgst) + Number(o.sgst) + Number(o.igst), 0);

    const days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() });
    const trend = days.map(d => {
      const day = format(d, "yyyy-MM-dd");
      const total = sales
        .filter(o => format(new Date(o.created_at), "yyyy-MM-dd") === day)
        .reduce((s, o) => s + Number(o.total), 0);
      return { day: format(d, "dd MMM"), total };
    });
    return { salesTotal, taxableTotal, gstCollected, trend, count: sales.length };
  }, [filteredSales]);

  // ----- Sales: grouped by customer -----
  const customerGroups = useMemo(() => {
    const orderIds = new Set(filteredSales.map(o => o.id));
    const itemsByOrder = new Map<string, OrderItem[]>();
    allItems.forEach(it => {
      if (!orderIds.has(it.order_id)) return;
      if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
      itemsByOrder.get(it.order_id)!.push(it);
    });

    const groups = new Map<string, { name: string; rows: LineRow[]; totals: { taxable: number; gst: number; grand: number; invoiceCount: number } }>();

    filteredSales.forEach(o => {
      const key = o.party_id ?? `walkin:${o.party_name ?? "Walk-in"}`;
      const name = o.party_name || "Walk-in";
      if (!groups.has(key)) {
        groups.set(key, { name, rows: [], totals: { taxable: 0, gst: 0, grand: 0, invoiceCount: 0 } });
      }
      const g = groups.get(key)!;
      g.totals.invoiceCount += 1;

      const its = itemsByOrder.get(o.id) ?? [];
      if (its.length === 0) {
        g.rows.push({
          invoice: o.invoice_number,
          date: format(new Date(o.invoice_date), "dd MMM yyyy"),
          customer: name,
          product: "—",
          hsn: "—",
          qty: "0",
          rate: 0,
          taxable: Number(o.subtotal),
          gstRate: 0,
          gstAmt: Number(o.cgst) + Number(o.sgst) + Number(o.igst),
          total: Number(o.total),
        });
      } else {
        its.forEach(it => {
          g.rows.push({
            invoice: o.invoice_number,
            date: format(new Date(o.invoice_date), "dd MMM yyyy"),
            customer: name,
            product: it.product_name,
            hsn: it.hsn_code ?? "—",
            qty: `${it.quantity} ${it.unit ?? ""}`.trim(),
            rate: Number(it.price),
            taxable: Number(it.taxable_amount),
            gstRate: Number(it.gst_rate),
            gstAmt: Number(it.tax_amount),
            total: Number(it.total),
          });
        });
      }
      g.totals.taxable += Number(o.subtotal);
      g.totals.gst += Number(o.cgst) + Number(o.sgst) + Number(o.igst);
      g.totals.grand += Number(o.total);
    });

    return Array.from(groups.entries())
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => b.totals.grand - a.totals.grand);
  }, [filteredSales, allItems]);

  // ----- Parties report: every party with full details + sales/outstanding rollup -----
  const partiesReport = useMemo(() => {
    return parties.map(p => {
      const ords = orders.filter(o => o.party_id === p.id && o.order_type === "sale" && o.status !== "cancelled");
      const total = ords.reduce((s, o) => s + Number(o.total), 0);
      const paid = ords.reduce((s, o) => s + Number(o.amount_paid), 0);
      return {
        ...p,
        invoiceCount: ords.length,
        totalBilled: total,
        paid,
        outstanding: total - paid,
      };
    }).sort((a, b) => b.totalBilled - a.totalBilled);
  }, [parties, orders]);

  // ----- Party statement (selected party) -----
  const statementParty = parties.find(p => p.id === statementPartyId);
  const statementRows = useMemo(() => {
    if (!statementPartyId) return [];
    type Row = { date: string; type: string; ref: string; debit: number; credit: number; balance: number };
    const events: { date: string; type: string; ref: string; debit: number; credit: number }[] = [];

    orders
      .filter(o => o.party_id === statementPartyId && o.order_type === "sale" && o.status !== "cancelled")
      .forEach(o => {
        events.push({
          date: o.invoice_date,
          type: "Invoice",
          ref: o.invoice_number,
          debit: Number(o.total),
          credit: 0,
        });
      });

    transactions
      .filter(t => t.party_id === statementPartyId)
      .forEach(t => {
        events.push({
          date: t.txn_date,
          type: t.type === "credit" ? "Payment Received" : "Payment Made",
          ref: t.notes ?? t.payment_method ?? "—",
          debit: t.type === "debit" ? Number(t.amount) : 0,
          credit: t.type === "credit" ? Number(t.amount) : 0,
        });
      });

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let bal = Number(statementParty?.opening_balance ?? 0);
    const rows: Row[] = [];
    if (statementParty?.opening_balance) {
      rows.push({ date: "—", type: "Opening Balance", ref: "—", debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0, balance: bal });
    }
    events.forEach(e => {
      bal = bal + e.debit - e.credit;
      rows.push({ ...e, balance: bal });
    });
    return rows;
  }, [statementPartyId, orders, transactions, statementParty]);

  // ----- Parties report by items (sales of each item per customer) -----
  const partiesByItems = useMemo(() => {
    const orderIds = new Set(filteredSales.map(o => o.id));
    const orderById = new Map(filteredSales.map(o => [o.id, o] as const));
    // key: party|product
    const map = new Map<string, { partyName: string; productName: string; qty: number; taxable: number; total: number }>();
    allItems.forEach(it => {
      if (!orderIds.has(it.order_id)) return;
      const o = orderById.get(it.order_id);
      if (!o) return;
      const partyName = o.party_name || "Walk-in";
      const k = `${partyName}|||${it.product_name}`;
      const ex = map.get(k) ?? { partyName, productName: it.product_name, qty: 0, taxable: 0, total: 0 };
      ex.qty += Number(it.quantity);
      ex.taxable += Number(it.taxable_amount);
      ex.total += Number(it.total);
      map.set(k, ex);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [allItems, filteredSales]);

  // ----- Items report: per-product totals -----
  const itemsReport = useMemo(() => {
    const orderIds = new Set(filteredSales.map(o => o.id));
    const map = new Map<string, { name: string; hsn: string; qty: number; taxable: number; gst: number; total: number; count: number }>();
    allItems.forEach(it => {
      if (!orderIds.has(it.order_id)) return;
      const k = it.product_name;
      const ex = map.get(k) ?? { name: it.product_name, hsn: it.hsn_code ?? "—", qty: 0, taxable: 0, gst: 0, total: 0, count: 0 };
      ex.qty += Number(it.quantity);
      ex.taxable += Number(it.taxable_amount);
      ex.gst += Number(it.tax_amount);
      ex.total += Number(it.total);
      ex.count += 1;
      map.set(k, ex);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [allItems, filteredSales]);

  // ----- Estimates report -----
  const estimatesReport = useMemo(() => {
    return filteredEstimates.map(o => ({
      number: o.invoice_number,
      date: format(new Date(o.invoice_date), "dd MMM yyyy"),
      party: o.party_name || "Walk-in",
      subtotal: Number(o.subtotal),
      gst: Number(o.cgst) + Number(o.sgst) + Number(o.igst),
      total: Number(o.total),
    })).sort((a, b) => b.total - a.total);
  }, [filteredEstimates]);

  const toggle = (key: string) => {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const downloadCustomerCSV = (customerName: string, rows: LineRow[]) => {
    downloadCSV(`${customerName}-sales`,
      ["Invoice No", "Date", "Customer", "Product", "HSN", "Qty", "Rate", "Taxable", "GST %", "GST Amount", "Total"],
      rows.map(r => [r.invoice, r.date, r.customer, r.product, r.hsn, r.qty,
        r.rate.toFixed(2), r.taxable.toFixed(2), `${r.gstRate}%`, r.gstAmt.toFixed(2), r.total.toFixed(2)]));
  };

  const exportAllSalesCSV = () => {
    const allRows = customerGroups.flatMap(g => g.rows);
    downloadCustomerCSV("all-customers", allRows);
  };

  const exportPartiesCSV = () => {
    downloadCSV("parties-report",
      ["Name", "Type", "Phone", "Email", "GSTIN", "PAN", "State", "Address", "Invoices", "Total Billed", "Paid", "Outstanding"],
      partiesReport.map(p => [
        p.name, p.type, p.phone ?? "", p.email ?? "", p.gstin ?? "", p.pan ?? "",
        p.state ?? "", p.address ?? "", p.invoiceCount, p.totalBilled.toFixed(2),
        p.paid.toFixed(2), p.outstanding.toFixed(2),
      ]));
  };

  const exportStatementCSV = () => {
    if (!statementParty) return;
    downloadCSV(`${statementParty.name}-statement`,
      ["Date", "Type", "Reference", "Debit", "Credit", "Balance"],
      statementRows.map(r => [r.date, r.type, r.ref, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)]));
  };

  const exportPartiesByItemsCSV = () => {
    downloadCSV("parties-by-items",
      ["Party", "Product", "Qty", "Taxable", "Total"],
      partiesByItems.map(r => [r.partyName, r.productName, r.qty, r.taxable.toFixed(2), r.total.toFixed(2)]));
  };

  const exportItemsCSV = () => {
    downloadCSV("items-report",
      ["Item", "HSN", "Times Sold", "Qty", "Taxable", "GST", "Total"],
      itemsReport.map(r => [r.name, r.hsn, r.count, r.qty, r.taxable.toFixed(2), r.gst.toFixed(2), r.total.toFixed(2)]));
  };

  const exportEstimatesCSV = () => {
    downloadCSV("estimates-report",
      ["Estimate No", "Date", "Party", "Subtotal", "GST", "Total"],
      estimatesReport.map(r => [r.number, r.date, r.party, r.subtotal.toFixed(2), r.gst.toFixed(2), r.total.toFixed(2)]));
  };

  const exportBackup = () => {
    const backup = { generated_at: new Date().toISOString(), orders, parties, items: allItems };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vyaparbook-backup-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const customers = parties.filter(p => p.type === "customer");

  return (
    <div className="space-y-4 pb-6">
      <h1 className="font-display text-2xl font-bold">Reports</h1>

      {/* Filters */}
      <Card className="card-elevated p-3 space-y-3">
        <div>
          <Label className="text-xs">Date Range</Label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {(["today", "month", "year", "all", "custom"] as const).map(r => (
              <button key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${range === r ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                {r === "today" ? "Today" : r === "month" ? "This Month" : r === "year" ? "This Year" : r === "all" ? "All Time" : "Custom"}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">From</Label>
                <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-10" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">To</Label>
                <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-10" />
              </div>
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="w-full grid grid-cols-3 h-auto">
          <TabsTrigger value="sales" className="text-xs">Sales</TabsTrigger>
          <TabsTrigger value="parties" className="text-xs">Parties</TabsTrigger>
          <TabsTrigger value="statement" className="text-xs">Statement</TabsTrigger>
        </TabsList>
        <TabsList className="w-full grid grid-cols-3 h-auto mt-2">
          <TabsTrigger value="items" className="text-xs">Items</TabsTrigger>
          <TabsTrigger value="byItems" className="text-xs">Party × Item</TabsTrigger>
          <TabsTrigger value="estimates" className="text-xs">Estimates</TabsTrigger>
        </TabsList>

        {/* SALES TAB */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="stat-tile">
            <div className="text-xs uppercase tracking-wider opacity-80">Total Sales</div>
            <div className="font-display text-3xl font-bold mt-1">{inr(stats.salesTotal)}</div>
            <div className="text-xs mt-1 opacity-90">{stats.count} invoice{stats.count === 1 ? "" : "s"}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card className="card-elevated p-4"><div className="text-xs text-muted-foreground">Taxable Value</div><div className="font-display text-xl font-bold">{inr(stats.taxableTotal)}</div></Card>
            <Card className="card-elevated p-4"><div className="text-xs text-muted-foreground">GST Collected</div><div className="font-display text-xl font-bold">{inr(stats.gstCollected)}</div></Card>
          </div>

          <Card className="card-elevated p-4">
            <div className="text-sm font-display font-bold mb-3">Sales — last 14 days</div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => inr(v)} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="card-elevated p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-display font-bold">Detailed Sales Report</div>
              <Button onClick={exportAllSalesCSV} size="sm" variant="outline" className="h-9">
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export All
              </Button>
            </div>

            {customerGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No invoices in this filter.</div>
            ) : (
              <div className="space-y-2">
                {customerGroups.map(g => {
                  const isOpen = expanded.has(g.key);
                  return (
                    <div key={g.key} className="border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggle(g.key)}
                        className="w-full flex items-center justify-between gap-3 p-3 bg-muted/30 hover:bg-muted/50 transition text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <User className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate">{g.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {g.totals.invoiceCount} invoice{g.totals.invoiceCount === 1 ? "" : "s"} · GST {inr(g.totals.gst)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-display font-bold text-sm">{inr(g.totals.grand)}</div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="bg-card">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs min-w-[700px]">
                              <thead className="bg-muted/40">
                                <tr className="text-left">
                                  <th className="px-2 py-2 font-semibold">Invoice #</th>
                                  <th className="px-2 py-2 font-semibold">Date</th>
                                  <th className="px-2 py-2 font-semibold">Product</th>
                                  <th className="px-2 py-2 font-semibold">HSN</th>
                                  <th className="px-2 py-2 font-semibold text-right">Qty</th>
                                  <th className="px-2 py-2 font-semibold text-right">Rate</th>
                                  <th className="px-2 py-2 font-semibold text-right">Taxable</th>
                                  <th className="px-2 py-2 font-semibold text-right">GST</th>
                                  <th className="px-2 py-2 font-semibold text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.rows.map((r, i) => (
                                  <tr key={i} className="border-t border-border">
                                    <td className="px-2 py-2 font-semibold text-primary whitespace-nowrap">{r.invoice}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{r.date}</td>
                                    <td className="px-2 py-2">{r.product}</td>
                                    <td className="px-2 py-2">{r.hsn}</td>
                                    <td className="px-2 py-2 text-right">{r.qty}</td>
                                    <td className="px-2 py-2 text-right">{inr(r.rate)}</td>
                                    <td className="px-2 py-2 text-right">{inr(r.taxable)}</td>
                                    <td className="px-2 py-2 text-right">{inr(r.gstAmt)} <span className="text-muted-foreground">({r.gstRate}%)</span></td>
                                    <td className="px-2 py-2 text-right font-semibold">{inr(r.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-muted/30 font-semibold">
                                <tr className="border-t-2 border-border">
                                  <td className="px-2 py-2" colSpan={6}>Total</td>
                                  <td className="px-2 py-2 text-right">{inr(g.totals.taxable)}</td>
                                  <td className="px-2 py-2 text-right">{inr(g.totals.gst)}</td>
                                  <td className="px-2 py-2 text-right">{inr(g.totals.grand)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                          <div className="p-3 border-t border-border">
                            <Button onClick={() => downloadCustomerCSV(g.name, g.rows)} size="sm" variant="outline" className="w-full h-10">
                              <Download className="h-3.5 w-3.5 mr-2" /> Download {g.name} report (CSV)
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* PARTIES TAB */}
        <TabsContent value="parties" className="space-y-3 mt-4">
          <Card className="card-elevated p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-display font-bold">All Parties ({partiesReport.length})</div>
              <Button onClick={exportPartiesCSV} size="sm" variant="outline" className="h-9">
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </div>
            {partiesReport.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No parties yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[800px]">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="px-2 py-2 font-semibold">Name</th>
                      <th className="px-2 py-2 font-semibold">Type</th>
                      <th className="px-2 py-2 font-semibold">Phone</th>
                      <th className="px-2 py-2 font-semibold">GSTIN</th>
                      <th className="px-2 py-2 font-semibold">State</th>
                      <th className="px-2 py-2 font-semibold text-right">Invoices</th>
                      <th className="px-2 py-2 font-semibold text-right">Billed</th>
                      <th className="px-2 py-2 font-semibold text-right">Paid</th>
                      <th className="px-2 py-2 font-semibold text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partiesReport.map(p => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-2 py-2 font-semibold">{p.name}</td>
                        <td className="px-2 py-2 capitalize">{p.type}</td>
                        <td className="px-2 py-2">{p.phone ?? "—"}</td>
                        <td className="px-2 py-2">{p.gstin ?? "—"}</td>
                        <td className="px-2 py-2">{p.state ?? "—"}</td>
                        <td className="px-2 py-2 text-right">{p.invoiceCount}</td>
                        <td className="px-2 py-2 text-right">{inr(p.totalBilled)}</td>
                        <td className="px-2 py-2 text-right text-success">{inr(p.paid)}</td>
                        <td className={`px-2 py-2 text-right font-semibold ${p.outstanding > 0 ? "text-destructive" : ""}`}>{inr(p.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* STATEMENT TAB */}
        <TabsContent value="statement" className="space-y-3 mt-4">
          <Card className="card-elevated p-4 space-y-3">
            <Label className="text-xs">Select Party</Label>
            <Select value={statementPartyId} onValueChange={setStatementPartyId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Choose a party..." /></SelectTrigger>
              <SelectContent>
                {parties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {statementParty && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-display font-bold">{statementParty.name} — Statement</div>
                  <Button onClick={exportStatementCSV} size="sm" variant="outline" className="h-9">
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export
                  </Button>
                </div>
                {statementRows.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-6">No transactions for this party.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="px-2 py-2 font-semibold">Date</th>
                          <th className="px-2 py-2 font-semibold">Type</th>
                          <th className="px-2 py-2 font-semibold">Reference</th>
                          <th className="px-2 py-2 font-semibold text-right">Debit</th>
                          <th className="px-2 py-2 font-semibold text-right">Credit</th>
                          <th className="px-2 py-2 font-semibold text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statementRows.map((r, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="px-2 py-2 whitespace-nowrap">{r.date}</td>
                            <td className="px-2 py-2">{r.type}</td>
                            <td className="px-2 py-2">{r.ref}</td>
                            <td className="px-2 py-2 text-right">{r.debit ? inr(r.debit) : "—"}</td>
                            <td className="px-2 py-2 text-right text-success">{r.credit ? inr(r.credit) : "—"}</td>
                            <td className={`px-2 py-2 text-right font-semibold ${r.balance > 0 ? "text-destructive" : "text-success"}`}>{inr(Math.abs(r.balance))} {r.balance > 0 ? "Dr" : r.balance < 0 ? "Cr" : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Card>
        </TabsContent>

        {/* ITEMS TAB */}
        <TabsContent value="items" className="space-y-3 mt-4">
          <Card className="card-elevated p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-display font-bold">Items Report</div>
              <Button onClick={exportItemsCSV} size="sm" variant="outline" className="h-9">
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </div>
            {itemsReport.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No items sold in this filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="px-2 py-2 font-semibold">Item</th>
                      <th className="px-2 py-2 font-semibold">HSN</th>
                      <th className="px-2 py-2 font-semibold text-right">Sold (×)</th>
                      <th className="px-2 py-2 font-semibold text-right">Qty</th>
                      <th className="px-2 py-2 font-semibold text-right">Taxable</th>
                      <th className="px-2 py-2 font-semibold text-right">GST</th>
                      <th className="px-2 py-2 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsReport.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-2 font-semibold">{r.name}</td>
                        <td className="px-2 py-2">{r.hsn}</td>
                        <td className="px-2 py-2 text-right">{r.count}</td>
                        <td className="px-2 py-2 text-right">{r.qty}</td>
                        <td className="px-2 py-2 text-right">{inr(r.taxable)}</td>
                        <td className="px-2 py-2 text-right">{inr(r.gst)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{inr(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* PARTY × ITEM TAB */}
        <TabsContent value="byItems" className="space-y-3 mt-4">
          <Card className="card-elevated p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-display font-bold">Parties Report by Items</div>
              <Button onClick={exportPartiesByItemsCSV} size="sm" variant="outline" className="h-9">
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </div>
            {partiesByItems.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No data in this filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="px-2 py-2 font-semibold">Party</th>
                      <th className="px-2 py-2 font-semibold">Product</th>
                      <th className="px-2 py-2 font-semibold text-right">Qty</th>
                      <th className="px-2 py-2 font-semibold text-right">Taxable</th>
                      <th className="px-2 py-2 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partiesByItems.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-2 font-semibold">{r.partyName}</td>
                        <td className="px-2 py-2">{r.productName}</td>
                        <td className="px-2 py-2 text-right">{r.qty}</td>
                        <td className="px-2 py-2 text-right">{inr(r.taxable)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{inr(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ESTIMATES TAB */}
        <TabsContent value="estimates" className="space-y-3 mt-4">
          <Card className="card-elevated p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-display font-bold">Estimates Report ({estimatesReport.length})</div>
              <Button onClick={exportEstimatesCSV} size="sm" variant="outline" className="h-9">
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </div>
            {estimatesReport.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No estimates in this filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="px-2 py-2 font-semibold">Estimate #</th>
                      <th className="px-2 py-2 font-semibold">Date</th>
                      <th className="px-2 py-2 font-semibold">Party</th>
                      <th className="px-2 py-2 font-semibold text-right">Subtotal</th>
                      <th className="px-2 py-2 font-semibold text-right">GST</th>
                      <th className="px-2 py-2 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimatesReport.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-2 font-semibold text-primary">{r.number}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.date}</td>
                        <td className="px-2 py-2">{r.party}</td>
                        <td className="px-2 py-2 text-right">{inr(r.subtotal)}</td>
                        <td className="px-2 py-2 text-right">{inr(r.gst)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{inr(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* SALE / ESTIMATE REPORT (printable, like the reference image) */}
        <TabsList className="w-full grid grid-cols-2 h-auto mt-2">
          <TabsTrigger value="saleReport" className="text-xs">Sale Report (PDF)</TabsTrigger>
          <TabsTrigger value="estimateReport" className="text-xs">Estimate Report (PDF)</TabsTrigger>
        </TabsList>

        <TabsContent value="saleReport" className="mt-4">
          <PrintableReport
            kind="sale"
            orders={filteredSales}
            items={allItems}
            transactions={transactions}
            profile={profile}
            from={start}
            to={end ?? new Date()}
          />
        </TabsContent>
        <TabsContent value="estimateReport" className="mt-4">
          <PrintableReport
            kind="estimate"
            orders={filteredEstimates}
            items={allItems}
            transactions={transactions}
            profile={profile}
            from={start}
            to={end ?? new Date()}
          />
        </TabsContent>
      </Tabs>

      <Button variant="outline" onClick={exportBackup} className="w-full h-12">
        <Download className="h-4 w-4 mr-2" /> Download Full Backup (JSON)
      </Button>
    </div>
  );
};

// =====================================================================
// PrintableReport — on-screen preview + PDF download mirroring the
// classic "Sale Report" / "Estimate Report" layout (per-bill block with
// nested item table, totals, sub-total and round-off).
// =====================================================================
type PrintOrder = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  party_name: string | null;
  party_gstin: string | null;
  total: number | string;
  amount_paid: number | string;
  subtotal: number | string;
  cgst: number | string;
  sgst: number | string;
  igst: number | string;
};

const ddmmyy = (s: string) => {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const PrintableReport = ({
  kind, orders, items, transactions, profile, from, to,
}: {
  kind: "sale" | "estimate";
  orders: PrintOrder[];
  items: OrderItem[];
  transactions: { order_id: string | null; payment_method: string | null; amount: number | string; type: string }[];
  profile: { business_name?: string | null; address?: string | null; phone?: string | null; email?: string | null; gstin?: string | null; state?: string | null } | null;
  from: Date;
  to: Date;
}) => {
  const title = kind === "sale" ? "Sale Report" : "Estimate Report";
  const sectionLabel = kind === "sale" ? "Sale" : "Estimate";

  // Sort by date asc to match the image's chronological feel (image is desc — keep desc to match)
  const sorted = [...orders].sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());

  const itemsByOrder = new Map<string, OrderItem[]>();
  items.forEach((it) => {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id)!.push(it);
  });

  const paymentFor = (orderId: string) => {
    const t = transactions.find((x) => x.order_id === orderId && x.type === "credit");
    return t?.payment_method ?? "Cash";
  };

  const generatePdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const M = 28;

    // Business header
    let y = 32;
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(profile?.business_name || "Business", W / 2, y, { align: "center" }); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const addrLine = [
      profile?.address ? `Address: ${profile.address}` : "",
      profile?.phone ? `Ph. no.: ${profile.phone}` : "",
    ].filter(Boolean).join(", ");
    if (addrLine) { doc.text(addrLine, W / 2, y, { align: "center" }); y += 11; }
    if (profile?.email) { doc.text(`Email: ${profile.email}`, W / 2, y, { align: "center" }); y += 11; }
    const gstLine = [
      profile?.gstin ? `GSTIN: ${profile.gstin}` : "",
      profile?.state ? `State: ${profile.state}` : "",
    ].filter(Boolean).join(", ");
    if (gstLine) { doc.text(gstLine, W / 2, y, { align: "center" }); y += 14; }

    // Title
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(title, W / 2, y, { align: "center" });
    const tw = doc.getTextWidth(title);
    doc.setLineWidth(0.6);
    doc.line(W / 2 - tw / 2, y + 2, W / 2 + tw / 2, y + 2);
    y += 16;

    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(`Duration: From ${ddmmyy(from.toISOString())} to ${ddmmyy(to.toISOString())}`, M, y);
    y += 12;

    // Section label
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(sectionLabel, W / 2, y, { align: "center" });
    const sw = doc.getTextWidth(sectionLabel);
    doc.line(W / 2 - sw / 2, y + 2, W / 2 + sw / 2, y + 2);
    y += 8;

    const headHeader = [["Date", "Order No", "Ref No", "Party Name", "Party's GSTIN No.", "Txn Type", "Total Amount", "Payment Type", "Received/Paid Amount", "Balance Amount"]];

    sorted.forEach((o) => {
      const its = itemsByOrder.get(o.id) ?? [];
      const total = Number(o.total);
      const paid = Number(o.amount_paid);
      const balance = round2(total - paid);
      const subtotal = its.reduce((s, it) => s + Number(it.taxable_amount) + Number(it.tax_amount), 0);
      const roundOff = round2(total - subtotal);
      const qtyTotal = its.reduce((s, it) => s + Number(it.quantity), 0);
      const gstTotal = its.reduce((s, it) => s + Number(it.tax_amount), 0);

      // Header row (each bill)
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: headHeader,
        body: [[
          ddmmyy(o.invoice_date),
          o.invoice_number,
          "",
          o.party_name || "Walk-in",
          o.party_gstin || "—",
          kind === "sale" ? "Sale" : "Estimate",
          total.toFixed(2),
          paymentFor(o.id),
          paid.toFixed(2),
          balance.toFixed(2),
        ]],
        theme: "grid",
        styles: { fontSize: 8, lineColor: [80, 80, 80], lineWidth: 0.3, cellPadding: 3 },
        headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 8 },
        columnStyles: {
          6: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      // Items sub-table
      const itemRows = its.map((it, i) => [
        String(i + 1),
        it.product_name,
        it.hsn_code ?? "—",
        `${Number(it.quantity)}`,
        Number(it.price).toFixed(2),
        `${Number(it.tax_amount).toFixed(2)} (${Number(it.gst_rate)}%)`,
        Number(it.total).toFixed(2),
      ]);

      itemRows.push([
        "", "Total", "", String(qtyTotal), "", gstTotal.toFixed(2), subtotal.toFixed(2),
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: M + 80, right: M },
        head: [["#", "Item name", "HSN/SAC", "Quantity", "Price/unit", "GST", "Amount"]],
        body: itemRows,
        theme: "grid",
        styles: { fontSize: 8, lineColor: [80, 80, 80], lineWidth: 0.3, cellPadding: 3 },
        headStyles: { fillColor: [250, 250, 250], textColor: 0, fontStyle: "bold", fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 22, halign: "center" },
          3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      // Sub Total + Round off
      autoTable(doc, {
        startY: y,
        margin: { left: M + 80, right: M },
        body: [
          ["Sub Total", subtotal.toFixed(2)],
          ["Round off", (roundOff >= 0 ? "" : "- ") + Math.abs(roundOff).toFixed(2)],
        ],
        theme: "plain",
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { halign: "right", fontStyle: "bold" },
          1: { halign: "right" },
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

      if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 32; }
    });

    doc.save(`${title.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  if (sorted.length === 0) {
    return (
      <Card className="card-elevated p-6 text-sm text-muted-foreground text-center">
        No {kind === "sale" ? "invoices" : "estimates"} in this date range.
      </Card>
    );
  }

  return (
    <Card className="card-elevated p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-display font-bold">{title}</div>
          <div className="text-xs text-muted-foreground">
            Duration: From {ddmmyy(from.toISOString())} to {ddmmyy(to.toISOString())} · {sorted.length} {kind === "sale" ? "bill" : "estimate"}{sorted.length === 1 ? "" : "s"}
          </div>
        </div>
        <Button onClick={generatePdf} size="sm" className="h-9">
          <FileText className="h-3.5 w-3.5 mr-1.5" /> Download PDF
        </Button>
      </div>

      {/* Preview header */}
      <div className="text-center border-b pb-3">
        <div className="font-display text-base font-bold">{profile?.business_name || "Business"}</div>
        {profile?.address && <div className="text-[10px] text-muted-foreground">Address: {profile.address}{profile.phone ? `, Ph. no.: ${profile.phone}` : ""}</div>}
        {profile?.email && <div className="text-[10px] text-muted-foreground">Email: {profile.email}</div>}
        {(profile?.gstin || profile?.state) && (
          <div className="text-[10px] text-muted-foreground">
            {profile?.gstin && `GSTIN: ${profile.gstin}`}{profile?.state ? `, State: ${profile.state}` : ""}
          </div>
        )}
        <div className="font-bold underline mt-2 text-sm">{title}</div>
      </div>

      <div className="text-xs font-semibold">
        Duration: From {ddmmyy(from.toISOString())} to {ddmmyy(to.toISOString())}
      </div>
      <div className="text-center font-bold text-sm underline">{sectionLabel}</div>

      <div className="space-y-4 overflow-x-auto">
        {sorted.map((o) => {
          const its = itemsByOrder.get(o.id) ?? [];
          const total = Number(o.total);
          const paid = Number(o.amount_paid);
          const balance = round2(total - paid);
          const subtotal = its.reduce((s, it) => s + Number(it.taxable_amount) + Number(it.tax_amount), 0);
          const roundOff = round2(total - subtotal);
          const qtyTotal = its.reduce((s, it) => s + Number(it.quantity), 0);
          const gstTotal = its.reduce((s, it) => s + Number(it.tax_amount), 0);

          return (
            <div key={o.id} className="min-w-[900px]">
              <table className="w-full text-[10px] border-collapse">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="border px-1.5 py-1">Date</th>
                    <th className="border px-1.5 py-1">Order No</th>
                    <th className="border px-1.5 py-1">Ref No</th>
                    <th className="border px-1.5 py-1">Party Name</th>
                    <th className="border px-1.5 py-1">Party's GSTIN No.</th>
                    <th className="border px-1.5 py-1">Txn Type</th>
                    <th className="border px-1.5 py-1 text-right">Total Amount</th>
                    <th className="border px-1.5 py-1">Payment Type</th>
                    <th className="border px-1.5 py-1 text-right">Received/Paid Amount</th>
                    <th className="border px-1.5 py-1 text-right">Balance Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border px-1.5 py-1">{ddmmyy(o.invoice_date)}</td>
                    <td className="border px-1.5 py-1">{o.invoice_number}</td>
                    <td className="border px-1.5 py-1">—</td>
                    <td className="border px-1.5 py-1 font-semibold">{o.party_name || "Walk-in"}</td>
                    <td className="border px-1.5 py-1">{o.party_gstin || "—"}</td>
                    <td className="border px-1.5 py-1">{kind === "sale" ? "Sale" : "Estimate"}</td>
                    <td className="border px-1.5 py-1 text-right">{inr(total)}</td>
                    <td className="border px-1.5 py-1">{paymentFor(o.id)}</td>
                    <td className="border px-1.5 py-1 text-right">{inr(paid)}</td>
                    <td className="border px-1.5 py-1 text-right font-semibold">{inr(balance)}</td>
                  </tr>
                </tbody>
              </table>

              <table className="w-full text-[10px] border-collapse mt-1 ml-10">
                <thead className="bg-muted/30">
                  <tr className="text-left">
                    <th className="border px-1.5 py-1 w-8 text-center">#</th>
                    <th className="border px-1.5 py-1">Item name</th>
                    <th className="border px-1.5 py-1">HSN/SAC</th>
                    <th className="border px-1.5 py-1 text-right">Quantity</th>
                    <th className="border px-1.5 py-1 text-right">Price/unit</th>
                    <th className="border px-1.5 py-1 text-right">GST</th>
                    <th className="border px-1.5 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {its.map((it, i) => (
                    <tr key={it.id}>
                      <td className="border px-1.5 py-1 text-center">{i + 1}</td>
                      <td className="border px-1.5 py-1">{it.product_name}</td>
                      <td className="border px-1.5 py-1">{it.hsn_code ?? "—"}</td>
                      <td className="border px-1.5 py-1 text-right">{Number(it.quantity)}</td>
                      <td className="border px-1.5 py-1 text-right">{inr(it.price)}</td>
                      <td className="border px-1.5 py-1 text-right">{inr(it.tax_amount)} <span className="text-muted-foreground">({Number(it.gst_rate)}%)</span></td>
                      <td className="border px-1.5 py-1 text-right">{inr(it.total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-muted/20">
                    <td className="border px-1.5 py-1"></td>
                    <td className="border px-1.5 py-1">Total</td>
                    <td className="border px-1.5 py-1"></td>
                    <td className="border px-1.5 py-1 text-right">{qtyTotal}</td>
                    <td className="border px-1.5 py-1"></td>
                    <td className="border px-1.5 py-1 text-right">{inr(gstTotal)}</td>
                    <td className="border px-1.5 py-1 text-right">{inr(subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="border-0 px-1.5 py-0.5" colSpan={5}></td>
                    <td className="px-1.5 py-0.5 text-right font-semibold">Sub Total</td>
                    <td className="px-1.5 py-0.5 text-right">{inr(subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="border-0 px-1.5 py-0.5" colSpan={5}></td>
                    <td className="px-1.5 py-0.5 text-right font-semibold">Round off</td>
                    <td className="px-1.5 py-0.5 text-right">{(roundOff < 0 ? "- " : "") + inr(Math.abs(roundOff))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default Reports;
