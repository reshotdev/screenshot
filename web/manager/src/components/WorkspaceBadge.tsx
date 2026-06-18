import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderPlus, FolderMinus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceBadgeProps {
  scenarioKey: string;
  className?: string;
  showActions?: boolean;
  onStatusChange?: (inWorkspace: boolean) => void;
}

/**
 * WorkspaceBadge - Shows if a scenario is in the workspace and allows quick add/remove
 */
export default function WorkspaceBadge({
  scenarioKey,
  className,
  showActions = true,
  onStatusChange,
}: WorkspaceBadgeProps) {
  const [inWorkspace, setInWorkspace] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if scenario is in workspace
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      const data = await res.json();
      const isInWorkspace = data.workspace?.scenarios?.includes(scenarioKey) || false;
      setInWorkspace(isInWorkspace);
    } catch {
      setInWorkspace(false);
    }
  }, [scenarioKey]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const toggleWorkspace = async () => {
    setLoading(true);
    try {
      if (inWorkspace) {
        await fetch(`/api/workspace/scenarios/${encodeURIComponent(scenarioKey)}`, {
          method: "DELETE",
        });
        setInWorkspace(false);
        onStatusChange?.(false);
      } else {
        await fetch("/api/workspace/scenarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioKeys: [scenarioKey] }),
        });
        setInWorkspace(true);
        onStatusChange?.(true);
      }
    } catch {
      // Revert on error
      checkStatus();
    } finally {
      setLoading(false);
    }
  };

  if (inWorkspace === null) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Badge
        variant={inWorkspace ? "default" : "secondary"}
        className={cn(
          "text-[10px] h-5 px-2 font-medium",
          inWorkspace && "bg-primary/90"
        )}
      >
        {inWorkspace ? "In Workspace" : "Not in Workspace"}
      </Badge>
      
      {showActions && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={toggleWorkspace}
          disabled={loading}
          title={inWorkspace ? "Remove from workspace" : "Add to workspace"}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : inWorkspace ? (
            <FolderMinus className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          ) : (
            <FolderPlus className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
          )}
        </Button>
      )}
    </div>
  );
}
