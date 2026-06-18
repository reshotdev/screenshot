import { useEffect, useState, useCallback, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Copy,
  ExternalLink,
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Asset {
  assetKey?: string;
  captureKey?: string;
  path: string;
  relativePath: string;
  filename: string;
  size: number;
  mtime: string;
  url: string;
  diff?: {
    status: "new" | "changed" | "unchanged";
    hasDiff: boolean;
    score?: number;
    diffUrl?: string;
  };
  isSentinel?: boolean;
}

interface Step {
  action: string;
  selector?: string;
  key?: string;
  captureKey?: string;
  clip?: any;
  selectorPadding?: number;
  deviceScaleFactor?: number;
  path?: string;
}

interface AssetDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset | null;
  scenarioKey: string;
  variationSlug: string;
  allAssets?: Asset[];
  onNavigate?: (asset: Asset) => void;
}

export default function AssetDetailSheet({
  open,
  onOpenChange,
  asset,
  scenarioKey,
  variationSlug,
  allAssets = [],
  onNavigate,
}: AssetDetailSheetProps) {
  const { toast } = useToast();
  const [linkedStep, setLinkedStep] = useState<{
    step: Step;
    index: number;
  } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Use refs to store stable references for callbacks
  const allAssetsRef = useRef(allAssets);
  const onNavigateRef = useRef(onNavigate);
  const onOpenChangeRef = useRef(onOpenChange);

  // Keep refs updated
  useEffect(() => {
    allAssetsRef.current = allAssets;
    onNavigateRef.current = onNavigate;
    onOpenChangeRef.current = onOpenChange;
  });

  const captureKey =
    asset?.captureKey || asset?.filename.replace(/\.[^/.]+$/, "");

  // Find current asset index for navigation - use stable computation
  const currentIndex = allAssets.findIndex(
    (a) => a.filename === asset?.filename
  );
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allAssets.length - 1 && currentIndex >= 0;

  // Store navigation state in refs for stable keyboard handler
  const navStateRef = useRef({ currentIndex, hasPrev, hasNext });
  useEffect(() => {
    navStateRef.current = { currentIndex, hasPrev, hasNext };
  });

  // Reset state when asset changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [asset?.url]);

  // Load linked step - only on initial open, not on every navigation
  const lastLoadedScenarioKey = useRef<string | null>(null);
  useEffect(() => {
    if (!scenarioKey || !open) return;
    // Only load once per scenario, not on every asset change
    if (lastLoadedScenarioKey.current === scenarioKey) return;
    lastLoadedScenarioKey.current = scenarioKey;

    fetch(`/api/config/scenarios/${scenarioKey}`)
      .then((res) => res.json())
      .then((data) => {
        const scenario = data.scenario;
        if (scenario?.steps) {
          const stepIndex = scenario.steps.findIndex(
            (step: Step) =>
              step.key === captureKey ||
              step.captureKey === captureKey ||
              step.path?.replace(/\.[^/.]+$/, "") === captureKey
          );
          if (stepIndex !== -1) {
            setLinkedStep({
              step: scenario.steps[stepIndex],
              index: stepIndex,
            });
          } else {
            setLinkedStep(null);
          }
        }
      })
      .catch(() => {
        setLinkedStep(null);
      });
  }, [scenarioKey, open]);

  // Stable navigation handlers using refs
  const goToPrev = useCallback(() => {
    const { currentIndex, hasPrev } = navStateRef.current;
    const assets = allAssetsRef.current;
    const navigate = onNavigateRef.current;
    if (hasPrev && navigate && assets[currentIndex - 1]) {
      navigate(assets[currentIndex - 1]);
    }
  }, []);

  const goToNext = useCallback(() => {
    const { currentIndex, hasNext } = navStateRef.current;
    const assets = allAssetsRef.current;
    const navigate = onNavigateRef.current;
    if (hasNext && navigate && assets[currentIndex + 1]) {
      navigate(assets[currentIndex + 1]);
    }
  }, []);

  const handleClose = useCallback(() => {
    onOpenChangeRef.current?.(false);
  }, []);

  // Keyboard navigation - stable handler using refs
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }

      // Arrow keys for navigation - use stable handlers
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        goToPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        goToNext();
      }
    };

    // Use capture phase to intercept before other handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, goToPrev, goToNext, handleClose]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCopyPath = () => {
    if (asset?.path) {
      navigator.clipboard.writeText(asset.path);
      toast({
        title: "Copied",
        description: "File path copied to clipboard",
        variant: "success",
      });
    }
  };

  const handleCopyUrl = () => {
    if (asset?.url) {
      const fullUrl = `${window.location.origin}${asset.url}`;
      navigator.clipboard.writeText(fullUrl);
      toast({
        title: "Copied",
        description: "Asset URL copied to clipboard",
        variant: "success",
      });
    }
  };

  if (!asset) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
        onOpenChange={onOpenChange}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="truncate">{asset.filename}</span>
            {asset.diff && (
              <>
                {asset.diff.status === "new" && (
                  <Badge variant="success" className="text-xs">
                    New
                  </Badge>
                )}
                {asset.diff.status === "changed" && (
                  <Badge variant="warning" className="text-xs">
                    {asset.diff.score !== undefined
                      ? `${(asset.diff.score * 100).toFixed(1)}% diff`
                      : "Changed"}
                  </Badge>
                )}
                {asset.diff.status === "unchanged" && (
                  <Badge variant="approved" className="text-xs">
                    Match
                  </Badge>
                )}
              </>
            )}
          </SheetTitle>
          <SheetDescription>
            {scenarioKey} / {variationSlug}
            {allAssets.length > 1 && (
              <span className="ml-2">
                ({currentIndex + 1} of {allAssets.length})
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Navigation arrows */}
        {allAssets.length > 1 && onNavigate && (
          <div className="flex items-center justify-between my-4">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrev}
              disabled={!hasPrev}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Use ← → arrow keys to navigate
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNext}
              disabled={!hasNext}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Preview */}
        <div className="mt-4 space-y-4">
          <div className="relative rounded-lg border bg-muted overflow-hidden">
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">
                  Loading...
                </div>
              </div>
            )}
            {imageError ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Failed to load image
              </div>
            ) : (
              <img
                src={asset.url}
                alt={asset.filename}
                className={cn(
                  "w-full h-auto max-h-[50vh] object-contain transition-opacity",
                  imageLoaded ? "opacity-100" : "opacity-0"
                )}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleCopyPath}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy Path
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyUrl}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy URL
            </Button>
            <a
              href={asset.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Full Size
            </a>
          </div>

          {/* Metadata */}
          <div className="space-y-3 border-t pt-4">
            <div>
              <Label className="text-xs text-muted-foreground">File Size</Label>
              <div className="text-sm font-medium mt-0.5">
                {formatFileSize(asset.size)}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Modified</Label>
              <div className="text-sm font-medium mt-0.5">
                {new Date(asset.mtime).toLocaleString()}
              </div>
            </div>

            {captureKey && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  Capture Key
                </Label>
                <code className="block text-sm font-mono bg-muted px-2 py-1 rounded mt-0.5">
                  {captureKey}
                </code>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">File Path</Label>
              <div className="text-xs font-mono bg-muted px-2 py-1 rounded mt-0.5 break-all">
                {asset.relativePath}
              </div>
            </div>

            {linkedStep && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  Linked Step
                </Label>
                <div className="mt-1">
                  <div className="inline-flex items-center gap-1.5 text-sm">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    Step #{linkedStep.index + 1}: {linkedStep.step.action}
                  </div>
                </div>
                {linkedStep.step.selector && (
                  <div className="text-xs font-mono bg-muted px-2 py-1 rounded mt-1">
                    {linkedStep.step.selector}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Diff comparison */}
          {asset.diff?.diffUrl && (
            <div className="space-y-2 border-t pt-4">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                Visual Diff
              </Label>
              <div className="rounded-lg border overflow-hidden">
                <img
                  src={asset.diff.diffUrl}
                  alt="Visual diff"
                  className="w-full h-auto"
                />
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
