import { CheckCircle2, Circle, FileText, Image, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowStatusProps {
  scenarioKey: string;
  scenarioName: string;
  stepCount: number;
  assetCount?: number;
  lastRunAt?: string | null;
  lastPublishAt?: string | null;
  hasAssets?: boolean;
}

/**
 * Compact inline workflow status - shows progress as small badges
 */
export default function WorkflowStatus({
  stepCount,
  assetCount = 0,
  hasAssets = false,
  lastPublishAt,
}: WorkflowStatusProps) {
  const isConfigured = stepCount > 0;
  const isGenerated = hasAssets;
  const isPublished = !!lastPublishAt;

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Configured */}
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full border",
          isConfigured
            ? "bg-green-500/10 border-green-500/30 text-green-500"
            : "bg-muted/50 border-border text-muted-foreground"
        )}
      >
        {isConfigured ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <Circle className="h-3 w-3" />
        )}
        <FileText className="h-3 w-3" />
        <span>{stepCount} steps</span>
      </div>

      <span className="text-muted-foreground">→</span>

      {/* Generated */}
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full border",
          isGenerated
            ? "bg-green-500/10 border-green-500/30 text-green-500"
            : "bg-muted/50 border-border text-muted-foreground"
        )}
      >
        {isGenerated ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <Circle className="h-3 w-3" />
        )}
        <Image className="h-3 w-3" />
        <span>{assetCount} assets</span>
      </div>

      <span className="text-muted-foreground">→</span>

      {/* Published */}
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full border",
          isPublished
            ? "bg-green-500/10 border-green-500/30 text-green-500"
            : "bg-muted/50 border-border text-muted-foreground"
        )}
      >
        {isPublished ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <Circle className="h-3 w-3" />
        )}
        <Upload className="h-3 w-3" />
        <span>{isPublished ? "Published" : "Not published"}</span>
      </div>
    </div>
  );
}
