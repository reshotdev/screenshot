import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AssetPreview from "@/components/AssetPreview";
import AssetDetailSheet from "@/components/AssetDetailSheet";
import {
  Video,
  Image,
  History,
  ChevronDown,
  ChevronRight,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AssetDiff {
  status: "new" | "changed" | "unchanged";
  hasDiff: boolean;
  score?: number;
  diffUrl?: string;
}

interface Asset {
  assetKey?: string;
  captureKey?: string;
  path: string;
  relativePath: string;
  filename: string;
  size: number;
  mtime: string;
  url: string;
  diff?: AssetDiff;
  isSentinel?: boolean;
}

interface DiffManifest {
  comparedAgainst: string | null;
  summary: {
    total: number;
    new: number;
    changed: number;
    unchanged: number;
  } | null;
}

interface Version {
  timestamp: string;
  label: string;
  date: string;
  assetCount: number;
  isLatest: boolean;
}

interface ScenarioAssetsProps {
  scenarioKey: string;
}

function ScenarioAssetsInner({ scenarioKey }: ScenarioAssetsProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [diffManifest, setDiffManifest] = useState<DiffManifest | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [collapsedVariants, setCollapsedVariants] = useState<Set<string>>(
    new Set()
  );

  // Load versions
  useEffect(() => {
    if (!scenarioKey) {
      setLoading(false);
      return;
    }

    fetch(`/api/output/${scenarioKey}/versions`)
      .then((res) => res.json())
      .then((data) => {
        const versionList = data.versions || [];
        setVersions(versionList);
        if (versionList.length > 0) {
          setSelectedVersion(versionList[0].timestamp);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load versions:", err);
        setLoading(false);
      });
  }, [scenarioKey]);

  // Load assets for selected version
  useEffect(() => {
    if (!scenarioKey || !selectedVersion) return;

    setLoading(true);
    fetch(`/api/output/${scenarioKey}/version/${selectedVersion}`)
      .then((res) => res.json())
      .then((data) => {
        setAssets(data.assets || []);
        setDiffManifest(data.diffManifest || null);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load assets:", err);
        setLoading(false);
      });
  }, [scenarioKey, selectedVersion]);

  // Filter and categorize assets
  const nonSentinelAssets = useMemo(
    () => assets.filter((a) => !a.isSentinel),
    [assets]
  );

  const { images, videos, stepsByVariant } = useMemo(() => {
    const imgs = nonSentinelAssets.filter(
      (a) =>
        a.filename.endsWith(".png") ||
        a.filename.endsWith(".jpg") ||
        a.filename.endsWith(".jpeg") ||
        a.filename.endsWith(".webp")
    );
    const vids = nonSentinelAssets.filter(
      (a) => a.filename.endsWith(".mp4") || a.filename.endsWith(".webm")
    );

    // Group images by variant AND step
    const byVariant: Record<string, Record<string, Asset[]>> = {};
    for (const asset of imgs) {
      const parts = asset.assetKey?.split("/") || [];
      let variant = "default";
      if (parts.length > 1) {
        variant = parts.slice(0, -1).join("/");
      }

      // Extract step key (e.g., "step-0" from "step-0_after.png")
      const stepMatch = asset.filename.match(/(step-\d+)/);
      const stepKey = stepMatch ? stepMatch[1] : "other";

      if (!byVariant[variant]) byVariant[variant] = {};
      if (!byVariant[variant][stepKey]) byVariant[variant][stepKey] = [];
      byVariant[variant][stepKey].push(asset);
    }

    return { images: imgs, videos: vids, stepsByVariant: byVariant };
  }, [nonSentinelAssets]);

  const variantKeys = Object.keys(stepsByVariant).sort();
  const totalAssets = nonSentinelAssets.length;

  const toggleVariant = useCallback((variant: string) => {
    setCollapsedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variant)) next.delete(variant);
      else next.add(variant);
      return next;
    });
  }, []);

  const handleAssetClick = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
    setIsSheetOpen(true);
  }, []);

  const handleAssetNavigate = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
  }, []);

  const handleSheetOpenChange = useCallback((open: boolean) => {
    setIsSheetOpen(open);
    if (!open) setSelectedAsset(null);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="text-muted-foreground text-center py-4 text-sm">
        Loading assets...
      </div>
    );
  }

  // Empty state
  if (totalAssets === 0 && versions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-6 text-sm">
        <p>No assets found. Run the scenario to generate assets.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Header: Version selector + Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <Select
            value={selectedVersion || ""}
            onValueChange={setSelectedVersion}
          >
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem
                  key={v.timestamp}
                  value={v.timestamp}
                  className="text-xs"
                >
                  {v.label} {v.isLatest && "(Latest)"} · {v.assetCount}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-xs h-6">
            <Image className="h-3 w-3 mr-1" />
            {images.length}
          </Badge>
          {videos.length > 0 && (
            <Badge variant="secondary" className="text-xs h-6">
              <Video className="h-3 w-3 mr-1" />
              {videos.length}
            </Badge>
          )}
          {diffManifest?.summary && (
            <>
              {diffManifest.summary.new > 0 && (
                <Badge variant="info" className="text-xs h-6">
                  +{diffManifest.summary.new}
                </Badge>
              )}
              {diffManifest.summary.changed > 0 && (
                <Badge variant="warning" className="text-xs h-6">
                  ⚠{diffManifest.summary.changed}
                </Badge>
              )}
              {diffManifest.summary.unchanged > 0 && (
                <Badge variant="approved" className="text-xs h-6">
                  ✓{diffManifest.summary.unchanged}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* ALL Variants Matrix View */}
      {selectedVersion && images.length > 0 && (
        <div className="space-y-2">
          {variantKeys.map((variant) => {
            const steps = stepsByVariant[variant];
            const stepKeys = Object.keys(steps).sort((a, b) => {
              const aNum = parseInt(a.match(/\d+/)?.[0] || "0");
              const bNum = parseInt(b.match(/\d+/)?.[0] || "0");
              return aNum - bNum;
            });
            const isCollapsed = collapsedVariants.has(variant);
            const totalInVariant = Object.values(steps).flat().length;

            return (
              <div key={variant} className="border rounded-lg bg-card">
                {/* Variant Header - Clickable to collapse */}
                <button
                  onClick={() => toggleVariant(variant)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {variant === "default"
                      ? "Default"
                      : variant.replace(/_/g, " / ").replace(/-/g, ": ")}
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {totalInVariant} assets
                  </Badge>
                </button>

                {/* Assets Grid - Horizontal scroll for all steps */}
                {!isCollapsed && (
                  <div className="px-3 pb-3">
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {stepKeys.map((stepKey) => {
                        const stepAssets = steps[stepKey];
                        return (
                          <div
                            key={stepKey}
                            className="flex-shrink-0 space-y-1"
                          >
                            <div className="text-xs text-muted-foreground text-center">
                              {stepKey === "other"
                                ? "Other"
                                : stepKey.replace("-", " ")}
                            </div>
                            <div className="flex gap-1">
                              {stepAssets.map((asset, idx) => {
                                const diffInfo = asset.diff;
                                const isAfter =
                                  asset.filename.includes("after");
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => handleAssetClick(asset)}
                                    className={cn(
                                      "relative cursor-pointer rounded overflow-hidden border transition-all hover:ring-2 hover:ring-primary",
                                      diffInfo?.status === "changed" &&
                                        "border-yellow-500",
                                      diffInfo?.status === "new" &&
                                        "border-blue-500",
                                      diffInfo?.status === "unchanged" &&
                                        "border-green-500/50"
                                    )}
                                    style={{ width: 100, height: 64 }}
                                  >
                                    <img
                                      src={asset.url}
                                      alt={asset.filename}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                    {/* Diff indicator */}
                                    {diffInfo && (
                                      <div className="absolute top-0.5 right-0.5">
                                        {diffInfo.status === "new" && (
                                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        )}
                                        {diffInfo.status === "changed" && (
                                          <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                        )}
                                      </div>
                                    )}
                                    {/* Before/After label */}
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-center text-white py-0.5">
                                      {isAfter ? "after" : "before"}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Videos Section */}
      {videos.length > 0 && (
        <div className="border rounded-lg bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Videos</span>
            <Badge variant="outline" className="text-xs">
              {videos.length}
            </Badge>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {videos.map((asset, idx) => (
              <div
                key={idx}
                onClick={() => handleAssetClick(asset)}
                className="flex-shrink-0 cursor-pointer rounded overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
                style={{ width: 160 }}
              >
                <AssetPreview
                  url={asset.url}
                  filename={asset.filename}
                  size="sm"
                  showControls={false}
                />
                <div className="p-1.5 text-xs truncate text-muted-foreground">
                  {asset.filename}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty version state */}
      {selectedVersion && nonSentinelAssets.length === 0 && (
        <div className="text-center text-muted-foreground py-4 text-sm">
          No assets for this version.
        </div>
      )}

      {/* Asset Detail Sheet */}
      <AssetDetailSheet
        open={isSheetOpen}
        onOpenChange={handleSheetOpenChange}
        asset={selectedAsset}
        scenarioKey={scenarioKey}
        variationSlug={selectedVersion || "default"}
        allAssets={images}
        onNavigate={handleAssetNavigate}
      />
    </div>
  );
}

const ScenarioAssets = memo(ScenarioAssetsInner);
export default ScenarioAssets;
