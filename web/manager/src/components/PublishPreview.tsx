import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  CheckSquare,
  Square,
  GitCommit,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface Asset {
  captureKey: string;
  path: string;
  filename: string;
  size: number;
  url: string;
}

interface AssetGroup {
  scenarioKey: string;
  variationSlug: string;
  assets: Asset[];
}

interface PublishPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioKeys?: string[];
  onConfirm: (
    selectedAssets: {
      scenarioKey: string;
      variationSlug: string;
      assets: Asset[];
    }[],
    commitMessage?: string
  ) => void;
}

export default function PublishPreview({
  open,
  onOpenChange,
  scenarioKeys,
  onConfirm,
}: PublishPreviewProps) {
  const [assets, setAssets] = useState<AssetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  // Collapsed state for each scenario (to hide individual assets by default)
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(
    new Set()
  );

  // Selection state: "scenarioKey::variationSlug" -> boolean (now at group level, not individual asset)
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>(
    {}
  );

  // Stabilize scenarioKeys for dependency array
  const scenarioKeysStr = useMemo(
    () => JSON.stringify(scenarioKeys || []),
    [scenarioKeys]
  );

  useEffect(() => {
    if (!open) return;

    const loadAssets = async () => {
      setLoading(true);
      try {
        // Use latestJobOnly=true to only show assets from the most recent capture job
        // This prevents showing ALL historical assets in the publish preview
        const res = await fetch("/api/output?latestJobOnly=true");
        const data = await res.json();
        const groups = data.groups || [];

        // Filter by scenarioKeys if provided
        const filteredGroups = scenarioKeys
          ? groups.filter((g: any) => scenarioKeys.includes(g.scenarioKey))
          : groups;

        // Use assets already included in each group from the filtered response
        // (avoids per-group fetches that don't respect latestJobOnly filter)
        const results: AssetGroup[] = filteredGroups.map((group: any) => ({
          scenarioKey: group.scenarioKey,
          variationSlug: group.variationSlug,
          assets: group.assets || [],
        }));
        setAssets(results);

        // Initialize all groups as selected by default
        const initialSelection: Record<string, boolean> = {};
        for (const group of results) {
          const groupKey = `${group.scenarioKey}::${group.variationSlug}`;
          initialSelection[groupKey] = true;
        }
        setSelectedGroups(initialSelection);
        setExpandedScenarios(new Set());

        // Pre-fill commit message with scenario name(s)
        const uniqueScenarios = [...new Set(results.map((g) => g.scenarioKey))];
        if (uniqueScenarios.length === 1) {
          setCommitMessage(`Update ${uniqueScenarios[0]} visuals`);
        } else if (uniqueScenarios.length > 1) {
          setCommitMessage(`Update ${uniqueScenarios.length} scenarios`);
        } else {
          setCommitMessage("");
        }

        setLoading(false);
      } catch (err) {
        console.error("Failed to load assets:", err);
        setLoading(false);
      }
    };

    loadAssets();
  }, [open, scenarioKeysStr]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Toggle scenario group (all variations in a scenario)
  const toggleScenario = (scenarioKey: string) => {
    const scenarioGroups = assets.filter((g) => g.scenarioKey === scenarioKey);
    const allSelected = scenarioGroups.every(
      (g) => selectedGroups[`${g.scenarioKey}::${g.variationSlug}`]
    );

    setSelectedGroups((prev) => {
      const next = { ...prev };
      for (const group of scenarioGroups) {
        next[`${group.scenarioKey}::${group.variationSlug}`] = !allSelected;
      }
      return next;
    });
  };

  // Toggle single variation group
  const toggleGroup = (group: AssetGroup) => {
    const groupKey = `${group.scenarioKey}::${group.variationSlug}`;
    setSelectedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Select/Deselect all
  const selectAll = () => {
    setSelectedGroups((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = true;
      }
      return next;
    });
  };

  const selectNone = () => {
    setSelectedGroups((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = false;
      }
      return next;
    });
  };

  // Toggle expand/collapse for a scenario
  const toggleExpanded = (scenarioKey: string) => {
    setExpandedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(scenarioKey)) {
        next.delete(scenarioKey);
      } else {
        next.add(scenarioKey);
      }
      return next;
    });
  };

  // Count selected assets
  const selectedGroupCount =
    Object.values(selectedGroups).filter(Boolean).length;
  const totalGroups = assets.length;

  // Count total assets in selected groups
  const selectedAssetCount = useMemo(() => {
    let count = 0;
    for (const group of assets) {
      const groupKey = `${group.scenarioKey}::${group.variationSlug}`;
      if (selectedGroups[groupKey]) {
        count += group.assets.length;
      }
    }
    return count;
  }, [assets, selectedGroups]);

  // Calculate selected size
  const selectedSize = useMemo(() => {
    let size = 0;
    for (const group of assets) {
      const groupKey = `${group.scenarioKey}::${group.variationSlug}`;
      if (selectedGroups[groupKey]) {
        for (const asset of group.assets) {
          size += asset.size;
        }
      }
    }
    return size;
  }, [assets, selectedGroups]);

  // Build selected assets for publish
  const handleConfirm = async () => {
    setPublishing(true);
    try {
      const selected: AssetGroup[] = assets.filter((group) => {
        const groupKey = `${group.scenarioKey}::${group.variationSlug}`;
        return selectedGroups[groupKey];
      });

      await onConfirm(selected, commitMessage.trim() || undefined);
    } finally {
      setPublishing(false);
    }
  };

  // Check if a scenario is fully or partially selected
  const getScenarioSelectionState = (
    scenarioKey: string
  ): "all" | "some" | "none" => {
    const scenarioGroups = assets.filter((g) => g.scenarioKey === scenarioKey);
    const selectedInScenario = scenarioGroups.filter(
      (g) => selectedGroups[`${g.scenarioKey}::${g.variationSlug}`]
    ).length;
    if (selectedInScenario === 0) return "none";
    if (selectedInScenario === scenarioGroups.length) return "all";
    return "some";
  };

  // Group assets by scenario
  const scenarioGroups = useMemo(() => {
    const grouped = new Map<string, AssetGroup[]>();
    for (const group of assets) {
      const existing = grouped.get(group.scenarioKey) || [];
      existing.push(group);
      grouped.set(group.scenarioKey, existing);
    }
    return grouped;
  }, [assets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish Preview</DialogTitle>
          <DialogDescription>
            Select which scenarios to publish to the platform
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading assets...
          </div>
        ) : totalGroups === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No assets found to publish.</p>
            <p className="text-sm mt-2">
              Run `reshot run` to generate assets first.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Commit Message */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <GitCommit className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Commit Message</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Describe what changed in this publish for version tracking.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Textarea
                    placeholder="e.g., Updated dashboard screenshots with new navigation design"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {commitMessage.length > 0
                      ? `${commitMessage.length} characters`
                      : "Optional but recommended"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Summary with selection controls */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Summary</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAll}
                      className="text-xs h-7"
                    >
                      <CheckSquare className="h-3 w-3 mr-1" />
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectNone}
                      className="text-xs h-7"
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Select None
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">
                      Scenarios
                    </div>
                    <div className="font-semibold text-lg">
                      {scenarioGroups.size}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">
                      Variations
                    </div>
                    <div className="font-semibold text-lg">
                      {selectedGroupCount} / {totalGroups}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Assets</div>
                    <div className="font-semibold text-lg">
                      {selectedAssetCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Size</div>
                    <div className="font-semibold text-lg">
                      {formatFileSize(selectedSize)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Scenarios list - compact view */}
            <div className="space-y-2">
              {Array.from(scenarioGroups.entries()).map(
                ([scenarioKey, variations]) => {
                  const scenarioState = getScenarioSelectionState(scenarioKey);
                  const isExpanded = expandedScenarios.has(scenarioKey);
                  const totalAssetsInScenario = variations.reduce(
                    (sum, v) => sum + v.assets.length,
                    0
                  );
                  const selectedVariations = variations.filter(
                    (v) =>
                      selectedGroups[`${v.scenarioKey}::${v.variationSlug}`]
                  ).length;

                  return (
                    <Card key={scenarioKey} className="overflow-hidden">
                      {/* Scenario header - clickable to toggle all variations */}
                      <div
                        className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer border-b"
                        onClick={() => toggleScenario(scenarioKey)}
                      >
                        <Checkbox
                          checked={scenarioState === "all"}
                          // @ts-ignore - indeterminate is valid
                          indeterminate={scenarioState === "some"}
                          onCheckedChange={() => toggleScenario(scenarioKey)}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {scenarioKey}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {selectedVariations}/{variations.length} variations
                            · {totalAssetsInScenario} assets
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(scenarioKey);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Expanded: show variations */}
                      {isExpanded && (
                        <div className="p-2 space-y-1 bg-muted/10">
                          {variations.map((group) => {
                            const groupKey = `${group.scenarioKey}::${group.variationSlug}`;
                            const isSelected = selectedGroups[groupKey];
                            return (
                              <div
                                key={groupKey}
                                className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                                  isSelected
                                    ? "bg-primary/10 border border-primary/20"
                                    : "hover:bg-muted/50"
                                }`}
                                onClick={() => toggleGroup(group)}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleGroup(group)}
                                  onClick={(e: React.MouseEvent) =>
                                    e.stopPropagation()
                                  }
                                  className="ml-4"
                                />
                                <div className="flex-1 min-w-0">
                                  <Badge
                                    variant="secondary"
                                    className="font-mono text-xs"
                                  >
                                    {group.variationSlug}
                                  </Badge>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {group.assets.length} assets
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  );
                }
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={publishing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedGroupCount === 0 || publishing}
          >
            {publishing ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 mr-2"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Publishing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Publish{" "}
                {selectedAssetCount > 0 && `${selectedAssetCount} assets`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
