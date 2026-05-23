import { useMemo } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr } from "@/lib/format";
import { Download, Scale } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface Computed {
  cashInHand: number;
  bankBalance: number;
  sundryDebtors: number;
  sundryCreditors: number;
  closingStock: number;
  gstPayable: number;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  netProfit: number; // positive = profit, negative = loss
  capital: number;   // balancing capital figure
}

const BalanceSheet = () => {
  const { orders, parties, transactions, products, expenses, profile } = useAppData();

  const c: Computed = useMemo(() => {
    // Sundry Debtors (customers): invoice debit + opening_balance - credit payments
    let sundryDebtors = 0;
    parties.filter(p => p.type === "customer").forEach(p => {
      const inv = orders
        .filter(o => o.party_id === p.id && o.order_type === "sale" && o.status !== "cancelled")
        .reduce((s, o) => s + Number(o.total), 0);
      const paid = transactions
        .filter(t => t.party_id === p.id && t.type === "credit")
        .reduce((s, t) => s + Number(t.amount), 0);
      const bal = Number(p.opening_balance || 0) + inv - paid;
      if (bal > 0) sundryDebtors += bal;
    });
    // Also walk-in unpaid invoices
    orders
      .filter(o => !o.party_id && o.order_type === "sale" && o.status !== "cancelled")
      .forEach(o => { sundryDebtors += Math.max(0, Number(o.total) - Number(o.amount_paid)); });

    // Sundry Creditors (suppliers): purchase debit + opening_balance - payments out
    let sundryCreditors = 0;
    parties.filter(p => p.type === "supplier").forEach(p => {
      const pur = orders
        .filter(o => o.party_id === p.id && o.order_type === "purchase" && o.status !== "cancelled")
        .reduce((s, o) => s + Number(o.total), 0);
      const paid = transactions
        .filter(t => t.party_id === p.id && t.type === "debit")
        .reduce((s, t) => s + Number(t.amount), 0);
      const bal = Number(p.opening_balance || 0) + pur - paid;
      if (bal > 0) sundryCreditors += bal;
    });

    // Closing Stock = Σ(stock × cost)
    const closingStock = products.reduce((s, p) => s + Number(p.stock) * Number(p.cost), 0);

    // Sales / Purchases / Expenses (lifetime)
    const totalSales = orders
      .filter(o => o.order_type === "sale" && o.status !== "cancelled")
      .reduce((s, o) => s + Number(o.subtotal), 0);
    const totalPurchases = orders
      .filter(o => o.order_type === "purchase" && o.status !== "cancelled")
      .reduce((s, o) => s + Number(o.subtotal), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

    // GST payable = output GST collected − input GST paid
    const outputGst = orders
      .filter(o => o.order_type === "sale" && o.status !== "cancelled")
      .reduce((s, o) => s + Number(o.cgst) + Number(o.sgst) + Number(o.igst), 0);
    const inputGst = orders
      .filter(o => o.order_type === "purchase" && o.status !== "cancelled")
      .reduce((s, o) => s + Number(o.cgst) + Number(o.sgst) + Number(o.igst), 0);
    const gstPayable = Math.max(0, outputGst - inputGst);

    // Cash & Bank from transactions payment_method
    let cashInHand = 0, bankBalance = 0;
    transactions.forEach(t => {
      const isCash = (t.payment_method ?? "").toLowerCase().includes("cash");
      const amt = Number(t.amount);
      // credit = money received (customer paid us) -> +cash/bank
      // debit  = money paid out (we paid supplier) -> -cash/bank
      const sign = t.type === "credit" ? 1 : -1;
      if (isCash) cashInHand += sign * amt;
      else bankBalance += sign * amt;
    });
    // Subtract expenses from cash (assumed paid out)
    expenses.forEach(e => {
      const isCash = (e.payment_method ?? "").toLowerCase().includes("cash");
      if (isCash) cashInHand -= Number(e.amount);
      else bankBalance -= Number(e.amount);
    });

    const netProfit = totalSales - totalPurchases - totalExpenses;

    // Balancing capital: Capital = Total Assets - (Sundry Creditors + GST Payable + Net Profit if positive)
    const totalAssets = cashInHand + bankBalance + sundryDebtors + closingStock;
    const otherLiab = sundryCreditors + gstPayable + Math.max(0, netProfit);
    const capital = totalAssets - otherLiab;

    return {
      cashInHand, bankBalance, sundryDebtors, sundryCreditors, closingStock,
      gstPayable, totalSales, totalPurchases, totalExpenses, netProfit, capital,
    };
  }, [orders, parties, transactions, products, expenses]);

  const totalAssetsSummary = c.cashInHand + c.bankBalance + c.sundryDebtors + c.closingStock + Math.max(0, -c.netProfit);
  const totalLiabSummary = c.sundryCreditors + c.gstPayable + c.capital + Math.max(0, c.netProfit);

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(profile?.business_name || "Business", W / 2, 36, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    if (profile?.address) doc.text(profile.address, W / 2, 52, { align: "center" });
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text(`Balance Sheet as on ${format(new Date(), "dd MMM yyyy")}`, W / 2, 74, { align: "center" });

    const liabBody: (string | number)[][] = [
      ["Capital Account", "", c.capital.toFixed(2)],
      ["  Owner's Capital (balancing)", c.capital.toFixed(2), ""],
      ["Current Liabilities", "", (c.sundryCreditors + c.gstPayable).toFixed(2)],
      ["  Sundry Creditors", c.sundryCreditors.toFixed(2), ""],
      ["  Duties & Taxes (GST Payable)", c.gstPayable.toFixed(2), ""],
    ];
    if (c.netProfit > 0) liabBody.push(["Profit & Loss A/c (Net Profit)", "", c.netProfit.toFixed(2)]);

    const assetBody: (string | number)[][] = [
      ["Current Assets", "", (c.sundryDebtors + c.closingStock + c.cashInHand + c.bankBalance).toFixed(2)],
      ["  Sundry Debtors", c.sundryDebtors.toFixed(2), ""],
      ["  Closing Stock", c.closingStock.toFixed(2), ""],
      ["  Cash-in-Hand", c.cashInHand.toFixed(2), ""],
      ["  Bank Accounts", c.bankBalance.toFixed(2), ""],
    ];
    if (c.netProfit < 0) assetBody.push(["Profit & Loss A/c (Net Loss)", "", Math.abs(c.netProfit).toFixed(2)]);

    autoTable(doc, {
      startY: 90,
      head: [["Liabilities", "", "Amount"]],
      body: [...liabBody, [{ content: "TOTAL", styles: { fontStyle: "bold" } }, "", { content: totalLiabSummary.toFixed(2), styles: { fontStyle: "bold" } }]],
      theme: "grid",
      styles: { fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.3 },
      headStyles: { fillColor: [230, 230, 230], textColor: 0 },
      columnStyles: { 0: { cellWidth: 220 }, 1: { halign: "right", cellWidth: 100 }, 2: { halign: "right", cellWidth: 100 } },
      margin: { left: 30, right: W / 2 + 10 },
    });
    autoTable(doc, {
      startY: 90,
      head: [["Assets", "", "Amount"]],
      body: [...assetBody, [{ content: "TOTAL", styles: { fontStyle: "bold" } }, "", { content: totalAssetsSummary.toFixed(2), styles: { fontStyle: "bold" } }]],
      theme: "grid",
      styles: { fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.3 },
      headStyles: { fillColor: [230, 230, 230], textColor: 0 },
      columnStyles: { 0: { cellWidth: 220 }, 1: { halign: "right", cellWidth: 100 }, 2: { halign: "right", cellWidth: 100 } },
      margin: { left: W / 2 + 10, right: 30 },
    });

    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("Generated by VyaparBook", 30, doc.internal.pageSize.getHeight() - 20);
    doc.save(`Balance_Sheet_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const SummaryRow = ({ label, value, indent = false, bold = false }: { label: string; value: number; indent?: boolean; bold?: boolean }) => (
    <div className={`flex justify-between text-sm py-1 ${bold ? "font-bold border-t mt-1 pt-2" : ""} ${indent ? "pl-4 text-muted-foreground" : ""}`}>
      <span>{label}</span><span>{inr(value)}</span>
    </div>
  );

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Scale className="h-6 w-6" /> Balance Sheet</h1>
          <p className="text-xs text-muted-foreground">As on {format(new Date(), "dd MMM yyyy")}</p>
        </div>
        <Button onClick={downloadPdf} size="sm" variant="outline" className="h-9">
          <Download className="h-4 w-4 mr-1" /> PDF
        </Button>
      </div>

      <Tabs defaultValue="summary">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="complete">Complete (Tally-style)</TabsTrigger>
        </TabsList>

        {/* SUMMARY */}
        <TabsContent value="summary" className="mt-4 grid md:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="font-display font-bold text-sm mb-2 uppercase tracking-wider">Assets</div>
              <SummaryRow label="Cash in Hand" value={c.cashInHand} />
              <SummaryRow label="Bank Balance" value={c.bankBalance} />
              <SummaryRow label="Sundry Debtors" value={c.sundryDebtors} />
              <SummaryRow label="Closing Stock" value={c.closingStock} />
              {c.netProfit < 0 && <SummaryRow label="Net Loss" value={Math.abs(c.netProfit)} />}
              <SummaryRow label="Total Assets" value={totalAssetsSummary} bold />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="font-display font-bold text-sm mb-2 uppercase tracking-wider">Liabilities</div>
              <SummaryRow label="Capital Account" value={c.capital} />
              <SummaryRow label="Sundry Creditors" value={c.sundryCreditors} />
              <SummaryRow label="GST Payable" value={c.gstPayable} />
              {c.netProfit > 0 && <SummaryRow label="Net Profit" value={c.netProfit} />}
              <SummaryRow label="Total Liabilities" value={totalLiabSummary} bold />
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPLETE TALLY-STYLE */}
        <TabsContent value="complete" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[640px]">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-2 text-left font-bold">Liabilities</th>
                    <th className="border p-2 text-right font-bold w-32">Amount</th>
                    <th className="border p-2 text-left font-bold">Assets</th>
                    <th className="border p-2 text-right font-bold w-32">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-2 font-semibold">Capital Account</td>
                    <td className="border p-2 text-right">{c.capital.toFixed(2)}</td>
                    <td className="border p-2 font-semibold">Fixed Assets</td>
                    <td className="border p-2 text-right">0.00</td>
                  </tr>
                  <tr>
                    <td className="border p-2 pl-6 text-muted-foreground">Owner's Capital</td>
                    <td className="border p-2 text-right text-muted-foreground">{c.capital.toFixed(2)}</td>
                    <td className="border p-2 font-semibold">Investments</td>
                    <td className="border p-2 text-right">0.00</td>
                  </tr>
                  <tr>
                    <td className="border p-2 font-semibold">Loans (Liability)</td>
                    <td className="border p-2 text-right">0.00</td>
                    <td className="border p-2 font-semibold">Current Assets</td>
                    <td className="border p-2 text-right">{(c.sundryDebtors + c.closingStock + c.cashInHand + c.bankBalance).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 font-semibold">Current Liabilities</td>
                    <td className="border p-2 text-right">{(c.sundryCreditors + c.gstPayable).toFixed(2)}</td>
                    <td className="border p-2 pl-6 text-muted-foreground">Sundry Debtors</td>
                    <td className="border p-2 text-right text-muted-foreground">{c.sundryDebtors.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 pl-6 text-muted-foreground">Sundry Creditors</td>
                    <td className="border p-2 text-right text-muted-foreground">{c.sundryCreditors.toFixed(2)}</td>
                    <td className="border p-2 pl-6 text-muted-foreground">Closing Stock</td>
                    <td className="border p-2 text-right text-muted-foreground">{c.closingStock.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 pl-6 text-muted-foreground">Duties & Taxes (GST)</td>
                    <td className="border p-2 text-right text-muted-foreground">{c.gstPayable.toFixed(2)}</td>
                    <td className="border p-2 pl-6 text-muted-foreground">Cash-in-Hand</td>
                    <td className="border p-2 text-right text-muted-foreground">{c.cashInHand.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 pl-6 text-muted-foreground">Provisions</td>
                    <td className="border p-2 text-right text-muted-foreground">0.00</td>
                    <td className="border p-2 pl-6 text-muted-foreground">Bank Accounts</td>
                    <td className="border p-2 text-right text-muted-foreground">{c.bankBalance.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 font-semibold">Profit & Loss A/c</td>
                    <td className="border p-2 text-right">{c.netProfit > 0 ? c.netProfit.toFixed(2) : "—"}</td>
                    <td className="border p-2 font-semibold">Profit & Loss A/c</td>
                    <td className="border p-2 text-right">{c.netProfit < 0 ? Math.abs(c.netProfit).toFixed(2) : "—"}</td>
                  </tr>
                  <tr className="bg-muted font-bold">
                    <td className="border p-2">TOTAL</td>
                    <td className="border p-2 text-right">{totalLiabSummary.toFixed(2)}</td>
                    <td className="border p-2">TOTAL</td>
                    <td className="border p-2 text-right">{totalAssetsSummary.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardContent className="p-4 space-y-1">
              <div className="font-display font-bold text-sm uppercase tracking-wider mb-2">Profit & Loss Snapshot</div>
              <SummaryRow label="Total Sales (taxable)" value={c.totalSales} />
              <SummaryRow label="Less: Purchases" value={-c.totalPurchases} />
              <SummaryRow label="Less: Expenses" value={-c.totalExpenses} />
              <SummaryRow label={c.netProfit >= 0 ? "Net Profit" : "Net Loss"} value={Math.abs(c.netProfit)} bold />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground">
        Note: Cash and Bank balances are inferred from recorded payments and expenses. Capital is a balancing figure.
      </p>
    </div>
  );
};

export default BalanceSheet;
