import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

const Sheet = ({ open, children }: SheetProps) => {
  // Prevent body scroll when sheet is open
  React.useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  if (!open) return null;
  return <>{children}</>;
};

const SheetTrigger = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);

const SheetClose = ({
  children,
  onClick,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
}) => <button onClick={onClick}>{children}</button>;

interface SheetContentProps {
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  children?: React.ReactNode;
  onClose?: () => void;
}

const sheetVariants = {
  top: "inset-x-0 top-0 border-b animate-in slide-in-from-top",
  bottom: "inset-x-0 bottom-0 border-t animate-in slide-in-from-bottom",
  left: "inset-y-0 left-0 h-full w-3/4 border-r animate-in slide-in-from-left sm:max-w-sm",
  right:
    "inset-y-0 right-0 h-full w-3/4 border-l animate-in slide-in-from-right sm:max-w-lg",
};

interface SheetContentComponentProps extends SheetContentProps {
  onOpenChange?: (open: boolean) => void;
}

const SheetContent = React.forwardRef<
  HTMLDivElement,
  SheetContentComponentProps
>(({ side = "right", className, children, onOpenChange }, ref) => {
  const handleOverlayClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpenChange?.(false);
    },
    [onOpenChange]
  );

  const handleContentClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/80 animate-in fade-in-0"
        onClick={handleOverlayClick}
      />
      {/* Content */}
      <div
        ref={ref}
        className={cn(
          "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out duration-300",
          sheetVariants[side],
          className
        )}
        onClick={handleContentClick}
      >
        {children}
        <button
          onClick={() => onOpenChange?.(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </>
  );
});
SheetContent.displayName = "SheetContent";

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  >
    {children}
  </h2>
);
SheetTitle.displayName = "SheetTitle";

const SheetDescription = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props}>
    {children}
  </p>
);
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
