import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { Plus } from "lucide-react";

export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (text: string) => void;
  onPick: (option: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  minChars?: number;
  limit?: number;
  /** When set, shows an "Add new …" row at the bottom if the typed text has no exact match. */
  onCreate?: (text: string) => void;
  createLabel?: string; // e.g. "Add new item"
}

export const Combobox = ({
  value,
  onChange,
  onPick,
  options,
  placeholder,
  className,
  inputClassName,
  minChars = 1,
  limit = 8,
  onCreate,
  createLabel = "Add new",
}: ComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const term = value.trim().toLowerCase();
  const filtered =
    term.length >= minChars
      ? options
          .filter(o => o.label.toLowerCase().includes(term) || (o.hint?.toLowerCase().includes(term) ?? false))
          .slice(0, limit)
      : options.slice(0, limit);

  const exactMatch = options.some(o => o.label.toLowerCase() === term);
  const showCreate = !!onCreate && term.length >= minChars && !exactMatch;
  const totalRows = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (opt: ComboOption) => {
    onPick(opt);
    setOpen(false);
  };

  const create = () => {
    onCreate?.(value.trim());
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || totalRows === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, totalRows - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (active < filtered.length) choose(filtered[active]);
            else if (showCreate) create();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn("h-12 text-base", inputClassName)}
      />
      {open && totalRows > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => choose(opt)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "w-full text-left px-3 py-2.5 text-base flex items-center justify-between gap-2",
                i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
            >
              <span className="truncate font-medium">{opt.label}</span>
              {opt.hint && <span className="text-sm text-muted-foreground shrink-0">{opt.hint}</span>}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={create}
              onMouseEnter={() => setActive(filtered.length)}
              className={cn(
                "w-full text-left px-3 py-2.5 text-base flex items-center gap-2 border-t border-border font-semibold",
                active === filtered.length ? "bg-primary text-primary-foreground" : "hover:bg-muted text-primary"
              )}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">{createLabel} “{value.trim()}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
