import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, Download } from "lucide-react";
import type { PaperSize } from "@/lib/invoice-pdf";

export interface PrintOptionsResult {
  action: "print" | "download";
  paperSize: PaperSize;
  color: boolean;
  twoUp: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (result: PrintOptionsResult) => void;
  title?: string;
  /** Show the "2 estimates on one landscape page" option (estimate-only). */
  allowTwoUp?: boolean;
}

const PrintOptionsDialog = ({ open, onOpenChange, onConfirm, title = "Print options", allowTwoUp = false }: Props) => {
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const [color, setColor] = useState<"color" | "bw">("color");
  const [twoUp, setTwoUp] = useState(false);

  const submit = (action: "print" | "download") => {
    onConfirm({ action, paperSize, color: color === "color", twoUp: allowTwoUp && twoUp });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">
            Choose paper size and color. The printer dialog will let you pick printer & copies.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold">Paper size</Label>
            <RadioGroup value={paperSize} onValueChange={(v) => setPaperSize(v as PaperSize)} className="grid grid-cols-2 gap-2 mt-2">
              {(["a4", "a3", "letter", "legal"] as PaperSize[]).map(s => (
                <Label key={s} className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted">
                  <RadioGroupItem value={s} />
                  <span className="uppercase text-sm">{s}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs font-semibold">Color</Label>
            <RadioGroup value={color} onValueChange={(v) => setColor(v as "color" | "bw")} className="grid grid-cols-2 gap-2 mt-2">
              <Label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted">
                <RadioGroupItem value="color" />
                <span className="text-sm">Color</span>
              </Label>
              <Label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted">
                <RadioGroupItem value="bw" />
                <span className="text-sm">Black & White</span>
              </Label>
            </RadioGroup>
            <div className="text-[10px] text-muted-foreground mt-1">
              Tip: For B&W, also select "Black and white" in the printer dialog.
            </div>
          </div>

          {allowTwoUp && (
            <Label className="flex items-start gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted">
              <Checkbox checked={twoUp} onCheckedChange={(v) => setTwoUp(!!v)} className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">2 estimates on one page (Landscape)</div>
                <div className="text-[10px] text-muted-foreground">Prints the same estimate twice, side by side, on a single A4 landscape page.</div>
              </div>
            </Label>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => submit("download")} className="h-11">
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
            <Button onClick={() => submit("print")} className="h-11">
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintOptionsDialog;
