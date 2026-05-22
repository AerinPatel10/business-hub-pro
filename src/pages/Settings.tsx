import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAppData } from "@/contexts/AppDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, LogOut, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { parseGstin } from "@/lib/gstin";

const Settings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { settings, refresh } = useAppData();
  const [profile, setProfile] = useState({
    business_name: "", gstin: "", pan: "", phone: "", email: "", address: "", state: "", state_code: "",
    bank_name: "", bank_account: "", bank_ifsc: "", bank_branch: "",
  });
  const [s, setS] = useState({
    invoice_prefix: "INV-", next_invoice_number: 1,
    estimate_prefix: "EST-", next_estimate_number: 1,
    default_gst_rate: 18, terms_and_conditions: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setProfile({
        business_name: data.business_name ?? "",
        gstin: data.gstin ?? "",
        pan: data.pan ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        address: data.address ?? "",
        state: data.state ?? "",
        state_code: data.state_code ?? "",
        bank_name: data.bank_name ?? "",
        bank_account: data.bank_account ?? "",
        bank_ifsc: data.bank_ifsc ?? "",
        bank_branch: data.bank_branch ?? "",
      });
    });
  }, [user]);

  useEffect(() => {
    if (settings) setS({
      invoice_prefix: settings.invoice_prefix,
      next_invoice_number: settings.next_invoice_number,
      estimate_prefix: (settings as { estimate_prefix?: string }).estimate_prefix ?? "EST-",
      next_estimate_number: (settings as { next_estimate_number?: number }).next_estimate_number ?? 1,
      default_gst_rate: Number(settings.default_gst_rate),
      terms_and_conditions: settings.terms_and_conditions ?? "",
    });
  }, [settings]);

  const gstinInfo = useMemo(() => (profile.gstin ? parseGstin(profile.gstin) : null), [profile.gstin]);

  const handleGstinChange = (raw: string) => {
    const upper = raw.toUpperCase().replace(/\s+/g, "").slice(0, 15);
    setProfile(p => {
      const next = { ...p, gstin: upper };
      const info = parseGstin(upper);
      if (info.valid) {
        if (!p.state_code) next.state_code = info.stateCode!;
        if (!p.state) next.state = info.state!;
        if (!p.pan) next.pan = info.pan!;
      }
      return next;
    });
  };

  const save = async () => {
    if (!user || !settings) return;
    setBusy(true);
    const [a, b] = await Promise.all([
      supabase.from("profiles").update(profile).eq("id", user.id),
      supabase.from("app_settings").update(s).eq("id", settings.id),
    ]);
    setBusy(false);
    if (a.error || b.error) { toast.error(a.error?.message || b.error?.message || "Failed"); return; }
    toast.success("Settings saved");
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
      </div>

      <Card className="card-elevated p-4 space-y-3">
        <div className="text-sm font-display font-bold">Business</div>
        <div>
          <Label>Business Name</Label>
          <Input value={profile.business_name} onChange={e => setProfile(p => ({ ...p, business_name: e.target.value }))} className="h-12" />
        </div>
        <div>
          <Label className="flex items-center gap-2">
            GSTIN
            {profile.gstin && (
              gstinInfo?.valid ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                  <CheckCircle2 className="h-3 w-3" /> Valid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
                  <AlertCircle className="h-3 w-3" /> {gstinInfo?.reason}
                </span>
              )
            )}
          </Label>
          <Input
            value={profile.gstin}
            onChange={e => handleGstinChange(e.target.value)}
            className={`h-12 font-mono uppercase tracking-wider ${profile.gstin && !gstinInfo?.valid ? "border-destructive" : ""}`}
            placeholder="22AAAAA0000A1Z5"
            maxLength={15}
          />
          {gstinInfo?.valid && (
            <p className="text-[10px] text-success mt-1">Auto-filled state, state code & PAN from GSTIN.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>PAN No</Label>
            <Input value={profile.pan} onChange={e => setProfile(p => ({ ...p, pan: e.target.value.toUpperCase() }))} className="h-12 font-mono uppercase" />
          </div>
          <div>
            <Label>State Code</Label>
            <Input value={profile.state_code} onChange={e => setProfile(p => ({ ...p, state_code: e.target.value }))} className="h-12" />
          </div>
        </div>
        <div>
          <Label>State</Label>
          <Input value={profile.state} onChange={e => setProfile(p => ({ ...p, state: e.target.value }))} className="h-12" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Phone</Label>
            <Input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} className="h-12" inputMode="tel" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} className="h-12" inputMode="email" />
          </div>
        </div>
        <div>
          <Label>Address</Label>
          <Textarea value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} rows={2} />
        </div>
      </Card>

      <Card className="card-elevated p-4 space-y-3">
        <div className="text-sm font-display font-bold">Bank Details (printed on invoice)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Bank Name</Label>
            <Input value={profile.bank_name} onChange={e => setProfile(p => ({ ...p, bank_name: e.target.value }))} className="h-12" />
          </div>
          <div>
            <Label>Branch</Label>
            <Input value={profile.bank_branch} onChange={e => setProfile(p => ({ ...p, bank_branch: e.target.value }))} className="h-12" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Account No</Label>
            <Input value={profile.bank_account} onChange={e => setProfile(p => ({ ...p, bank_account: e.target.value }))} className="h-12" />
          </div>
          <div>
            <Label>IFSC</Label>
            <Input value={profile.bank_ifsc} onChange={e => setProfile(p => ({ ...p, bank_ifsc: e.target.value }))} className="h-12" />
          </div>
        </div>
      </Card>

      <Card className="card-elevated p-4 space-y-3">
        <div className="text-sm font-display font-bold">Invoicing</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Invoice Prefix</Label>
            <Input value={s.invoice_prefix} onChange={e => setS(p => ({ ...p, invoice_prefix: e.target.value }))} className="h-12" />
          </div>
          <div>
            <Label>Next Number</Label>
            <Input type="number" value={s.next_invoice_number} onChange={e => setS(p => ({ ...p, next_invoice_number: Number(e.target.value) }))} className="h-12" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Estimate Prefix</Label>
            <Input value={s.estimate_prefix} onChange={e => setS(p => ({ ...p, estimate_prefix: e.target.value }))} className="h-12" />
          </div>
          <div>
            <Label>Next Estimate #</Label>
            <Input type="number" value={s.next_estimate_number} onChange={e => setS(p => ({ ...p, next_estimate_number: Number(e.target.value) }))} className="h-12" />
          </div>
        </div>
        <div>
          <Label>Default GST %</Label>
          <Input type="number" inputMode="decimal" value={s.default_gst_rate} onChange={e => setS(p => ({ ...p, default_gst_rate: Number(e.target.value) }))} className="h-12" />
        </div>
        <div>
          <Label>Terms & Conditions</Label>
          <Textarea value={s.terms_and_conditions} onChange={e => setS(p => ({ ...p, terms_and_conditions: e.target.value }))} rows={3} />
        </div>
      </Card>

      <Button onClick={save} disabled={busy} className="w-full h-12 font-semibold">Save Settings</Button>

      <Button variant="outline" onClick={signOut} className="w-full h-12">
        <LogOut className="h-4 w-4 mr-2" /> Sign Out
      </Button>
    </div>
  );
};

export default Settings;
