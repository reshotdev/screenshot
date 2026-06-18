import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/20 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/20 text-destructive",
        success: "border-transparent bg-success/20 text-success",
        approved:
          "border-transparent bg-green-500/20 text-green-600 dark:text-green-400",
        pending:
          "border-transparent bg-amber-500/20 text-amber-600 dark:text-amber-400",
        warning: "border-transparent bg-warning/20 text-warning",
        info: "border-transparent bg-blue-500/20 text-blue-600 dark:text-blue-400",
        outline: "border-border/60 text-muted-foreground bg-transparent",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
