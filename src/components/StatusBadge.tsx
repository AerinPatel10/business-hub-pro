import { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Send, Loader2, Truck, ShoppingBag, XCircle } from "lucide-react";

type Status = Database["public"]["Enums"]["order_status"];

const config: Record<Status, { label: string; color: string; icon: typeof Send }> = {
  send:       { label: "Sent",       color: "bg-status-send/15 text-status-send",             icon: Send },
  processing: { label: "Processing", color: "bg-status-processing/15 text-status-processing", icon: Loader2 },
  dispatch:   { label: "Dispatched", color: "bg-status-dispatch/15 text-status-dispatch",     icon: Truck },
  sell:       { label: "Sold",       color: "bg-status-sell/15 text-status-sell",             icon: ShoppingBag },
  done:       { label: "Done",       color: "bg-status-done/15 text-status-done",             icon: CheckCircle2 },
  cancelled:  { label: "Cancelled",  color: "bg-status-cancelled/15 text-status-cancelled",   icon: XCircle },
};

export const StatusBadge = ({ status, className }: { status: Status; className?: string }) => {
  const c = config[status];
  const Icon = c.icon;
  return (
    <span className={cn("status-pill", c.color, className)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
};

export const STATUS_FLOW: Status[] = ["send", "processing", "dispatch", "sell", "done"];

export const nextStatus = (s: Status): Status | null => {
  const i = STATUS_FLOW.indexOf(s);
  if (i === -1 || i === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[i + 1];
};
