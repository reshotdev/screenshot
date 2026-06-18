import AssetPreview from "@/components/AssetPreview";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw,
  Folder,
  FolderOpen,
  Image,
  Film,
  Clock,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Trash2,
  CheckSquare,
  Square,
  Upload,
  Shield,
  Paintbrush,
} from "lucide-react";
import PublishPreview from "@/components/PublishPreview";
import AuthPrompt from "@/components/AuthPrompt";
import { useJobMonitor } from "@/components/FloatingJobMonitor";

interface Asset {
  captureKey: string;
  path: string;
  filename: string;
  size: number;
  mtime: string;
  url: string;
  isSentinel?: boolean;
}

interface AssetGroup {
  scenarioKey: string;
  variationSlug: string;
  assets: Asset[];
}

interface VersionVariant {
  name: string;
  assetCount: number;
}

interface Version {
  timestamp: string;
  label: string;
  date: string;
  assetCount: number;
  isLatest: boolean;
  variants?: VersionVariant[];
  hasVariants?: boolean;
  privacy?: { enabled: boolean; method?: string; selectorCount?: number };
  style?: { enabled: boolean; frame?: string; shadow?: string };
}

interface ScenarioVersions {
  scenarioKey: string;
  versions: Version[];
  selectedVersion: string;
  selectedVariant: string | null;
  assets: Asset[];
  availableVariants: VersionVariant[];
}

interface CategoryGroup {
  key: string;
  name: string;
  scenarios: ScenarioVersions[];
  totalAssets: number;
  isExpanded: boolean;
}

// Extract category from scenario key (e.g., "auth-signin" -> "auth", "settings-profile" -> "settings")
// Matches the Scenarios page logic: split by "-" and take first part
function extractCategory(scenarioKey: string): string {
  const parts = scenarioKey.split("-");
  if (parts.length >= 2) {
    return parts[0];
  }
  return "other";
}

// Format category name for display
function formatCategoryName(category: string): string {
  if (category === "other") return "Other";
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function Assets() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [, setAllGroups] = useState<AssetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  // Use plain object instead of Map for better React state tracking
  const [scenarioVersions, setScenarioVersions] = useState<
    Record<string, ScenarioVersions>
  >({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);

  // Selection state for bulk actions
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(
    new Set(),
  );
  const [isDeleteSelectedDialogOpen, setIsDeleteSelectedDialogOpen] =
    useState(false);
  const [isPublishPreviewOpen, setIsPublishPreviewOpen] = useState(false);
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const { trackJob } = useJobMonitor();

  // Toggle scenario selection
  const toggleScenarioSelection = (key: string) => {
    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Toggle all scenarios in a category
  const toggleCategorySelection = (scenarioKeys: string[]) => {
    const allSelected = scenarioKeys.every((k) => selectedScenarios.has(k));
    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        scenarioKeys.forEach((k) => next.delete(k));
      } else {
        scenarioKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  // Select all scenarios
  const selectAllScenarios = () => {
    const allKeys = Object.keys(scenarioVersions);
    setSelectedScenarios(new Set(allKeys));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedScenarios(new Set());
  };

  // Delete selected scenarios' assets
  const handleDeleteSelectedAssets = async () => {
    if (selectedScenarios.size === 0) return;

    try {
      const res = await fetch("/api/assets/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioKeys: Array.from(selectedScenarios) }),
      });
      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Success",
          description: `Deleted assets for ${
            data.deletedScenarios || selectedScenarios.size
          } scenario(s)`,
          variant: "success",
        });
        setIsDeleteSelectedDialogOpen(false);
        clearSelection();
        loadAssets();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete selected assets",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to delete selected assets:", err);
      toast({
        title: "Error",
        description: "Failed to delete selected assets",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAllAssets = async () => {
    try {
      const res = await fetch("/api/assets", { method: "DELETE" });
      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Success",
          description: `Deleted ${data.deleted} asset file(s)`,
          variant: "success",
        });
        setIsDeleteAllDialogOpen(false);
        loadAssets();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete assets",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to delete assets:", err);
      toast({
        title: "Error",
        description: "Failed to delete assets",
        variant: "destructive",
      });
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    try {
      // Step 1: Get all output groups to know which scenarios have assets
      const outputRes = await fetch("/api/output");
      const outputData = await outputRes.json();
      const allGroupsData = outputData.groups || [];
      setAllGroups(allGroupsData);

      // Get unique scenario keys
      const scenarioKeys = [
        ...new Set(allGroupsData.map((g: AssetGroup) => g.scenarioKey)),
      ] as string[];

      // Step 2: For each scenario, fetch its actual versions from the versions API
      const versionsObj: Record<string, ScenarioVersions> = {};

      await Promise.all(
        scenarioKeys.map(async (scenarioKey: string) => {
          try {
            const versionsRes = await fetch(
              `/api/output/${scenarioKey}/versions`,
            );
            const versionsData = await versionsRes.json();
            const versions: Version[] = versionsData.versions || [];

            if (versions.length === 0) {
              // Fallback to 'default' if no versions found
              versions.push({
                timestamp: "default",
                label: "Default",
                date: new Date().toISOString(),
                assetCount: 0,
                isLatest: true,
              });
            }

            // Select the first (most recent) version
            const selectedVersion = versions[0].timestamp;
            const selectedVersionData = versions[0];

            // Check if this version has variants
            const availableVariants = selectedVersionData.variants || [];
            // If has variants, default to first variant; otherwise null
            const selectedVariant =
              availableVariants.length > 0 ? availableVariants[0].name : null;

            // Fetch assets for the selected version (optionally with variant)
            let assets: Asset[] = [];
            try {
              // Use separate route for variant-specific requests
              const url = selectedVariant
                ? `/api/output/${scenarioKey}/version/${selectedVersion}/variant/${selectedVariant}`
                : `/api/output/${scenarioKey}/version/${selectedVersion}`;
              const assetsRes = await fetch(url);
              const assetsData = await assetsRes.json();
              assets = (assetsData.assets || []).filter(
                (a: Asset) => !a.isSentinel,
              );
            } catch {
              // Fallback to getting assets from the groups data
              const matchingGroup = allGroupsData.find(
                (g: AssetGroup) => g.scenarioKey === scenarioKey,
              );
              assets = matchingGroup?.assets || [];
            }

            versionsObj[scenarioKey] = {
              scenarioKey,
              versions,
              selectedVersion,
              selectedVariant,
              assets,
              availableVariants,
            };
          } catch (err) {
            console.error(`Failed to fetch versions for ${scenarioKey}:`, err);
          }
        }),
      );

      setScenarioVersions(versionsObj);

      // Auto-expand all categories on first load
      if (expandedCategories.size === 0) {
        const categories = new Set<string>();
        Object.values(versionsObj).forEach((s) =>
          categories.add(extractCategory(s.scenarioKey)),
        );
        setExpandedCategories(categories);
      }

      setLoading(false);
    } catch (err) {
      console.error("Failed to load assets:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleVersionChange = async (scenarioKey: string, version: string) => {
    // Immediately update the selected version in state for instant UI feedback
    setScenarioVersions((prev) => ({
      ...prev,
      [scenarioKey]: {
        ...prev[scenarioKey],
        selectedVersion: version,
      },
    }));

    // Get the version data to find variants
    const scenario = scenarioVersions[scenarioKey];
    const versionData = scenario?.versions.find((v) => v.timestamp === version);
    const variants = versionData?.variants || [];
    const selectedVariant = variants.length > 0 ? variants[0].name : null;

    // Fetch assets for the new version (optionally with variant)
    try {
      // Use separate route for variant-specific requests
      const url = selectedVariant
        ? `/api/output/${scenarioKey}/version/${version}/variant/${selectedVariant}`
        : `/api/output/${scenarioKey}/version/${version}`;
      const assetsRes = await fetch(url);
      const assetsData = await assetsRes.json();
      const assets = (assetsData.assets || []).filter(
        (a: Asset) => !a.isSentinel,
      );

      setScenarioVersions((prev) => ({
        ...prev,
        [scenarioKey]: {
          ...prev[scenarioKey],
          selectedVersion: version,
          selectedVariant: selectedVariant,
          availableVariants: variants,
          assets: assets,
        },
      }));
    } catch (err) {
      console.error(
        `Failed to fetch assets for ${scenarioKey}/${version}:`,
        err,
      );
    }
  };

  const handleVariantChange = async (scenarioKey: string, variant: string) => {
    const scenario = scenarioVersions[scenarioKey];
    if (!scenario) return;

    // Immediately update the selected variant in state for instant UI feedback
    setScenarioVersions((prev) => ({
      ...prev,
      [scenarioKey]: {
        ...prev[scenarioKey],
        selectedVariant: variant,
      },
    }));

    // Fetch assets for the new variant using the dedicated variant route
    try {
      const url = `/api/output/${scenarioKey}/version/${scenario.selectedVersion}/variant/${variant}`;
      const assetsRes = await fetch(url);
      const assetsData = await assetsRes.json();
      const assets = (assetsData.assets || []).filter(
        (a: Asset) => !a.isSentinel,
      );

      setScenarioVersions((prev) => ({
        ...prev,
        [scenarioKey]: {
          ...prev[scenarioKey],
          selectedVariant: variant,
          assets: assets,
        },
      }));
    } catch (err) {
      console.error(
        `Failed to fetch assets for ${scenarioKey}/${scenario.selectedVersion}/${variant}:`,
        err,
      );
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatVersion = (version: string) => {
    if (version === "latest" || version === "default") return version;
    // Parse timestamp format: YYYY-MM-DD_HH-MM-SS
    const match = version.match(
      /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/,
    );
    if (match) {
      const date = new Date(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5]),
        parseInt(match[6]),
      );
      return date.toLocaleString();
    }
    return version;
  };

  const getAssetIcon = (filename: string) => {
    if (filename.endsWith(".mp4")) return <Film className="h-4 w-4" />;
    return <Image className="h-4 w-4" />;
  };

  // Convert object to array for rendering
  const scenarios = Object.values(scenarioVersions);

  // Sorting and filtering state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "assets" | "versions">("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Filtered scenarios
  const filteredScenarios = useMemo(() => {
    let result = [...scenarios];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.scenarioKey.toLowerCase().includes(query) ||
          s.assets.some((a) => a.captureKey.toLowerCase().includes(query)),
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.scenarioKey.localeCompare(b.scenarioKey);
          break;
        case "assets":
          cmp = a.assets.length - b.assets.length;
          break;
        case "versions":
          cmp = a.versions.length - b.versions.length;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [scenarios, searchQuery, sortBy, sortAsc]);

  // Group scenarios by category (hierarchical structure)
  const groupedByCategory = useMemo(() => {
    const categoryMap: Record<string, ScenarioVersions[]> = {};

    for (const scenario of filteredScenarios) {
      const category = extractCategory(scenario.scenarioKey);
      if (!categoryMap[category]) {
        categoryMap[category] = [];
      }
      categoryMap[category].push(scenario);
    }

    // Sort categories and build groups
    const sortedGroups = Object.entries(categoryMap)
      .sort(([a], [b]) => {
        if (a === "other") return 1;
        if (b === "other") return -1;
        return a.localeCompare(b);
      })
      .map(
        ([key, scenarios]): CategoryGroup => ({
          key,
          name: formatCategoryName(key),
          scenarios,
          totalAssets: scenarios.reduce((sum, s) => sum + s.assets.length, 0),
          isExpanded: expandedCategories.has(key),
        }),
      );

    return sortedGroups;
  }, [filteredScenarios, expandedCategories]);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSort = (option: "name" | "assets" | "versions") => {
    if (sortBy === option) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(option);
      setSortAsc(true);
    }
  };

  const totalAssetCount = scenarios.reduce(
    (sum, s) => sum + s.assets.length,
    0,
  );

  return (
    <div
      data-testid="studio-assets"
      data-loaded="true"
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Assets</h1>
          <p className="text-xs text-muted-foreground mt-1 font-normal">
            {scenarios.length} scenario(s) · {totalAssetCount} asset(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={loadAssets}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {selectedScenarios.size > 0 ? (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsPublishPreviewOpen(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Publish Selected ({selectedScenarios.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteSelectedDialogOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Selected ({selectedScenarios.size})
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteAllDialogOpen(true)}
              title="Delete all assets"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete All
            </Button>
          )}
        </div>
      </div>

      {/* Search, Sort, and Selection Controls */}
      {scenarios.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="flex items-center gap-1 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground mr-1" />
              <Button
                variant={sortBy === "name" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => toggleSort("name")}
              >
                Name {sortBy === "name" && (sortAsc ? "↑" : "↓")}
              </Button>
              <Button
                variant={sortBy === "assets" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => toggleSort("assets")}
              >
                Assets {sortBy === "assets" && (sortAsc ? "↑" : "↓")}
              </Button>
              <Button
                variant={sortBy === "versions" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => toggleSort("versions")}
              >
                Versions {sortBy === "versions" && (sortAsc ? "↑" : "↓")}
              </Button>
            </div>

            {searchQuery && (
              <span className="text-xs text-muted-foreground">
                {filteredScenarios.length} of {scenarios.length} scenarios
              </span>
            )}
          </div>

          {/* Selection Controls */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={
                  selectedScenarios.size === scenarios.length
                    ? clearSelection
                    : selectAllScenarios
                }
              >
                {selectedScenarios.size === scenarios.length ? (
                  <>
                    <CheckSquare className="h-3 w-3 mr-1" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square className="h-3 w-3 mr-1" />
                    Select All
                  </>
                )}
              </Button>
              {selectedScenarios.size > 0 && (
                <span className="text-muted-foreground">
                  {selectedScenarios.size} selected
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading assets...</div>
      ) : scenarios.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Assets</CardTitle>
            <CardDescription>Run a scenario to generate assets</CardDescription>
          </CardHeader>
        </Card>
      ) : filteredScenarios.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No assets match "{searchQuery}"
            </p>
            <Button variant="link" onClick={() => setSearchQuery("")}>
              Clear search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedByCategory.map((category) => {
            const categoryScenarioKeys = category.scenarios.map(
              (s) => s.scenarioKey,
            );
            const allCategorySelected = categoryScenarioKeys.every((k) =>
              selectedScenarios.has(k),
            );
            const someCategorySelected = categoryScenarioKeys.some((k) =>
              selectedScenarios.has(k),
            );

            return (
              <Card key={category.key} className="overflow-hidden">
                {/* Category Header - Collapsible */}
                <div className="flex items-center gap-2 p-4 border-b border-border/50">
                  <Checkbox
                    checked={allCategorySelected}
                    indeterminate={someCategorySelected && !allCategorySelected}
                    onCheckedChange={() =>
                      toggleCategorySelection(categoryScenarioKeys)
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4"
                  />
                  <button
                    onClick={() => toggleCategory(category.key)}
                    className="flex-1 flex items-center gap-3 text-left hover:bg-accent/50 transition-colors rounded-md px-2 py-1 -my-1"
                  >
                    {category.isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {category.isExpanded ? (
                      <FolderOpen className="h-5 w-5 text-primary" />
                    ) : (
                      <Folder className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <span className="font-medium">{category.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {category.scenarios.length} scenario(s) ·{" "}
                        {category.totalAssets} asset(s)
                      </span>
                    </div>
                  </button>
                </div>

                {/* Category Content */}
                {category.isExpanded && (
                  <div className="divide-y divide-border/50">
                    {category.scenarios.map((scenario) => (
                      <div key={scenario.scenarioKey} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedScenarios.has(
                                scenario.scenarioKey,
                              )}
                              onCheckedChange={() =>
                                toggleScenarioSelection(scenario.scenarioKey)
                              }
                              className="h-4 w-4"
                            />
                            <span className="font-medium text-sm">
                              {scenario.scenarioKey.includes("/")
                                ? scenario.scenarioKey
                                    .split("/")
                                    .slice(1)
                                    .join("/")
                                : scenario.scenarioKey}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {scenario.assets.length} asset(s)
                            </Badge>
                            {(() => {
                              const selectedVer = scenario.versions.find(
                                (v) => v.timestamp === scenario.selectedVersion,
                              );
                              return (
                                <>
                                  {selectedVer?.privacy?.enabled && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] gap-0.5"
                                    >
                                      <Shield className="h-2.5 w-2.5" />
                                      {selectedVer.privacy.method || "privacy"}
                                    </Badge>
                                  )}
                                  {selectedVer?.style?.enabled && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] gap-0.5"
                                    >
                                      <Paintbrush className="h-2.5 w-2.5" />
                                      {selectedVer.style.frame !== "none"
                                        ? selectedVer.style.frame
                                        : "styled"}
                                    </Badge>
                                  )}
                                </>
                              );
                            })()}
                          </div>

                          {/* Version Selector - using native select for reliability */}
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <select
                              value={scenario.selectedVersion}
                              onChange={(e) =>
                                handleVersionChange(
                                  scenario.scenarioKey,
                                  e.target.value,
                                )
                              }
                              className="h-7 px-2 text-xs rounded-md border border-gray-600 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {scenario.versions.map((version) => (
                                <option
                                  key={version.timestamp}
                                  value={version.timestamp}
                                >
                                  {version.timestamp === "latest"
                                    ? "Latest"
                                    : version.timestamp === "default"
                                      ? "Default"
                                      : formatVersion(version.timestamp)}
                                </option>
                              ))}
                            </select>

                            {/* Variant Selector - only show if variants exist */}
                            {scenario.availableVariants.length > 0 &&
                              scenario.selectedVariant && (
                                <>
                                  <span className="text-muted-foreground text-xs">
                                    /
                                  </span>
                                  <select
                                    value={scenario.selectedVariant}
                                    onChange={(e) =>
                                      handleVariantChange(
                                        scenario.scenarioKey,
                                        e.target.value,
                                      )
                                    }
                                    className="h-7 px-2 text-xs rounded-md border border-gray-600 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                                  >
                                    {scenario.availableVariants.map(
                                      (variant) => (
                                        <option
                                          key={variant.name}
                                          value={variant.name}
                                        >
                                          {variant.name} ({variant.assetCount})
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </>
                              )}
                          </div>
                        </div>

                        {scenario.assets.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-3">
                            No assets in this version
                          </p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {scenario.assets.map((asset) => (
                              <div
                                key={asset.captureKey}
                                className="border rounded-md p-2.5 space-y-1.5 cursor-pointer hover:border-primary transition-colors group"
                                onClick={() =>
                                  navigate(
                                    `/assets/${scenario.scenarioKey}/${scenario.selectedVersion}/${asset.captureKey}`,
                                  )
                                }
                              >
                                <AssetPreview
                                  url={asset.url}
                                  filename={asset.filename}
                                  size="sm"
                                  showControls={false}
                                />
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    {getAssetIcon(asset.filename)}
                                    <span className="font-medium text-xs truncate">
                                      {asset.captureKey}
                                    </span>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px]"
                                  >
                                    {formatFileSize(asset.size)}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Selected Confirmation Dialog */}
      <Dialog
        open={isDeleteSelectedDialogOpen}
        onOpenChange={setIsDeleteSelectedDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete Selected Assets?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all assets for{" "}
              {selectedScenarios.size} selected scenario(s). This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteSelectedDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSelectedAssets}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteAllDialogOpen}
        onOpenChange={setIsDeleteAllDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete All Assets?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all {totalAssetCount} captured asset
              files from the output folder. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteAllDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAllAssets}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Preview Dialog */}
      <PublishPreview
        open={isPublishPreviewOpen}
        onOpenChange={setIsPublishPreviewOpen}
        scenarioKeys={Array.from(selectedScenarios)}
        onConfirm={async (selectedGroups) => {
          try {
            const totalAssets = selectedGroups.reduce(
              (sum, g) => sum + g.assets.length,
              0,
            );
            const res = await fetch("/api/jobs/publish", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                scenarioKeys: Array.from(selectedScenarios),
                selectedGroups,
              }),
            });
            const data = await res.json();
            if (res.status === 401 || data.authRequired) {
              setIsPublishPreviewOpen(false);
              toast({
                title: "Authentication Required",
                description: data.error || "Please reconnect to publish.",
                variant: "destructive",
              });
              setIsAuthPromptOpen(true);
              return;
            }
            if (res.ok && data.ok) {
              toast({
                title: "Job Created",
                description: `Publishing ${totalAssets} asset(s). Monitor progress in the panel below.`,
              });
              setIsPublishPreviewOpen(false);
              if (data.job?.id) {
                trackJob(data.job.id);
              }
            } else {
              toast({
                title: "Error",
                description: data.error || "Failed to create publish job",
                variant: "destructive",
              });
            }
          } catch {
            toast({
              title: "Error",
              description: "Failed to connect to server",
              variant: "destructive",
            });
          }
        }}
      />

      {/* Auth Prompt Dialog */}
      <AuthPrompt
        open={isAuthPromptOpen}
        onOpenChange={setIsAuthPromptOpen}
        onAuthenticated={() => {
          toast({
            title: "Connected",
            description: "Successfully connected. You can now publish.",
            variant: "success",
          });
          loadAssets();
        }}
      />
    </div>
  );
}
