import * as React from "react";
import { cn } from "@/lib/utils";

interface OptionCardProps {
  selected: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}

const OptionCard = React.forwardRef<HTMLButtonElement, OptionCardProps>(
  ({ selected, onClick, label, children, className }, ref) => (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-1.5 rounded-lg p-3 cursor-pointer transition-all duration-150",
        "active:scale-[0.98]",
        selected
          ? "ring-2 ring-primary bg-primary/5 border-transparent"
          : "border border-border/40 bg-card/30 hover:bg-card/60 hover:border-border/60 hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
        className
      )}
    >
      <div className="w-full h-12 flex items-center justify-center">
        {children}
      </div>
      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-150">
        {label}
      </span>
    </button>
  )
);
OptionCard.displayName = "OptionCard";

export { OptionCard };
