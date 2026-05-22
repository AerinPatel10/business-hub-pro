import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppData } from "@/contexts/AppDataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, FileText, FileSpreadsheet, UserPlus } from "lucide-react";
import { inr } from "@/lib/format";

const Ledger = () => {
  const { parties, orders } = useAppData();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as "invoice" | "estimate") ?? "invoice";
  const [tab, setTab] = useState<"invoice" | "estimate">(initial);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const t = (params.get("tab") as "invoice" | "estimate") ?? "invoice";
    setTab(t);
  }, [params]);

  const partySummaries = useMemo(() => {
    type S = {
      id: string;          // real party id OR "walkin:<name>"
      name: string;
      isWalkin: boolean;
      invoiceCount: number;
      invTotal: number;
      invDue: number;
      estimateCount: number;
      estTotal: number;
    };
    const map = new Map<string, S>();

    // Seed with real parties
    parties.forEach((p) => {
      map.set(p.id, {
        id: p.id, name: p.name, isWalkin: false,
        invoiceCount: 0, invTotal: 0, invDue: 0, estimateCount: 0, estTotal: 0,
      });
    });

    // Walk every order — including those without a saved party
    orders.forEach((o) => {
      let key: string;
      let name: string;
      let isWalkin = false;

      if (o.party_id && map.has(o.party_id)) {
        key = o.party_id;
        name = map.get(o.party_id)!.name;
      } else {
        // Walk-in / un-added: group by name (case-insensitive)
        name = (o.party_name?.trim() || "Walk-in Customer");
        key = `walkin:${name.toLowerCase()}`;
        isWalkin = true;
        if (!map.has(key)) {
          map.set(key, {
            id: key, name, isWalkin: true,
            invoiceCount: 0, invTotal: 0, invDue: 0, estimateCount: 0, estTotal: 0,
          });
        }
      }

      const s = map.get(key)!;
      s.isWalkin = s.isWalkin || isWalkin;

      if (o.order_type === "sale") {
        s.invoiceCount += 1;
        s.invTotal += Number(o.total);
        s.invDue += Math.max(Number(o.total) - Number(o.amount_paid), 0);
      } else if (o.order_type === "estimate") {
        s.estimateCount += 1;
        s.estTotal += Number(o.total);
      }
    });

    return Array.from(map.values());
  }, [parties, orders]);

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    let list = partySummaries;
    if (tab === "invoice") list = list.filter((s) => s.invoiceCount > 0);
    else list = list.filter((s) => s.estimateCount > 0);
    if (term) list = list.filter((s) => s.name.toLowerCase().includes(term));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [partySummaries, tab, q]);

  const goTo = (partyId: string) => {
    navigate(`/ledger/${tab}/${encodeURIComponent(partyId)}`);
  };

  const handleTab = (v: string) => {
    setTab(v as "invoice" | "estimate");
    setParams({ tab: v }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-extrabold tracking-tight">Ledger</h1>
        <p className="text-sm text-muted-foreground">Party-wise invoice & estimate statements</p>
      </div>

      <Tabs value={tab} onValueChange={handleTab}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="invoice"><FileText className="h-4 w-4 mr-1.5" />Invoice</TabsTrigger>
          <TabsTrigger value="estimate"><FileSpreadsheet className="h-4 w-4 mr-1.5" />Estimate</TabsTrigger>
        </TabsList>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search party"
            className="pl-9 h-11"
          />
        </div>

        <TabsContent value="invoice" className="mt-3">
          <PartyCardList list={filtered} kind="invoice" onClick={goTo} />
        </TabsContent>
        <TabsContent value="estimate" className="mt-3">
          <PartyCardList list={filtered} kind="estimate" onClick={goTo} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

type Summary = {
  id: string;
  name: string;
  isWalkin: boolean;
  invoiceCount: number;
  invTotal: number;
  invDue: number;
  estimateCount: number;
  estTotal: number;
};

const PartyCardList = ({
  list,
  kind,
  onClick,
}: {
  list: Summary[];
  kind: "invoice" | "estimate";
  onClick: (id: string) => void;
}) => {
  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No parties to show
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {list.map((s) => (
        <Card
          key={s.id}
          onClick={() => onClick(s.id)}
          className="cursor-pointer hover:border-primary/50 active:scale-[0.99] transition"
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
              {s.isWalkin ? <UserPlus className="h-4 w-4" /> : s.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate flex items-center gap-2">
                {s.name}
                {s.isWalkin && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    walk-in
                  </span>
                )}
              </div>
              {kind === "invoice" ? (
                <div className="text-xs text-muted-foreground">
                  {s.invoiceCount} {s.invoiceCount === 1 ? "bill" : "bills"} · Total {inr(s.invTotal)}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {s.estimateCount} {s.estimateCount === 1 ? "estimate" : "estimates"} · Total {inr(s.estTotal)}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              {kind === "invoice" ? (
                <div className={`font-bold text-sm ${s.invDue > 0 ? "text-destructive" : "text-green-600"}`}>
                  {s.invDue > 0 ? inr(s.invDue) : "Settled"}
                </div>
              ) : (
                <div className="font-bold text-sm">{inr(s.estTotal)}</div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default Ledger;
