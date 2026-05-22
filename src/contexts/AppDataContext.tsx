import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import type { Tables } from "@/integrations/supabase/types";

export type Product = Tables<"products">;
export type Party = Tables<"parties">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type Transaction = Tables<"transactions">;
export type Expense = Tables<"expenses">;
export type Category = Tables<"categories">;
export type AppSettings = Tables<"app_settings">;
export type Profile = Tables<"profiles">;

interface AppDataContextValue {
  products: Product[];
  parties: Party[];
  orders: Order[];
  transactions: Transaction[];
  expenses: Expense[];
  categories: Category[];
  settings: AppSettings | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export const AppDataProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [p, pa, o, t, e, c, s, pr] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("parties").select("*").order("name"),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").order("txn_date", { ascending: false }),
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
      supabase.from("app_settings").select("*").maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
    setProducts(p.data ?? []);
    setParties(pa.data ?? []);
    setOrders(o.data ?? []);
    setTransactions(t.data ?? []);
    setExpenses(e.data ?? []);
    setCategories(c.data ?? []);
    setProfile(pr.data ?? null);

    if (!s.data) {
      const { data: created } = await supabase.from("app_settings").insert({ owner_id: user.id }).select().maybeSingle();
      setSettings(created ?? null);
    } else {
      setSettings(s.data);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  // Realtime sync
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("app-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refresh]);

  return (
    <AppDataContext.Provider value={{ products, parties, orders, transactions, expenses, categories, settings, profile, loading, refresh }}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = () => {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
};
