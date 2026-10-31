import { LifeBuoy } from "lucide-react";

// AGPL-3.0 §13: users of this modified version over a network must be offered
// its Corresponding Source. Keep this link pointing at the published fork.
export const SOURCE_URL = "https://github.com/Pyasapanchi/komyosys-pos";

export function BrandFooter() {
  return (
    <div className="flex flex-col gap-2 border-t border-sidebar-border px-4 py-3">
      <a
        href="https://www.komyosys.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 rounded-lg border border-sidebar-border px-3 py-1.5 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LifeBuoy className="h-3.5 w-3.5" />
        Contact support
      </a>
      <a
        href="https://www.komyosys.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-left text-xs font-medium leading-tight text-sidebar-foreground/70 hover:text-sidebar-foreground hover:underline"
      >
        Komyosys POS
      </a>
      <p className="text-[11px] leading-snug text-sidebar-foreground/50">
        Based on OrderRestro (AGPL-3.0).{" "}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-sidebar-foreground">
          Source
        </a>
      </p>
    </div>
  );
}
