import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useManualRefresh } from "@/lib/useConfigRefresh";
import { useJobMonitor } from "@/components/FloatingJobMonitor";
import {
  Plus,
  FileText,
  RefreshCw,
  Search,
  ArrowUpDown,
  Clock,
  Play,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Layers,
  CheckSquare,
  Square,
  Image,
  Trash2,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ScenarioMetadata {
  createdAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  assetCount: number;
}

interface Scenario {
  name: string;
  key: string;
  url: string;
  steps: any[];
  contexts?: any;
  matrix?: any[][];
  category?: string;
  _metadata?: ScenarioMetadata;
}

interface ScenarioGroup {
  name: string;
  key: string;
  scenarios: Scenario[];
  isExpanded: boolean;
}

type SortOption = "name" | "key" | "steps" | "lastRun";
type ViewMode = "grouped" | "flat";

// Format relative time
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Extract category from scenario key (e.g., "marketing-homepage" -> "marketing")
function extractCategory(scenario: Scenario): string {
  // Use explicit category if provided
  if (scenario.category) return scenario.category;

  // Extract from key prefix (e.g., "marketing-homepage" -> "marketing")
  const key = scenario.key || "";
  const parts = key.split("-");
  if (parts.length >= 2) {
    return parts[0];
  }
  return "other";
}

// Format category name for display
function formatCategoryName(category: string): string {
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function Scenarios() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { trackJob } = useJobMonitor();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newScenario, setNewScenario] = useState({
    name: "",
    key: "",
    url: "",
  });
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [recordTitle, setRecordTitle] = useState("");

  // View mode: grouped or flat
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");

  // Selection state for bulk actions
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(
    new Set(),
  );

  // Expanded groups state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Run dialog state
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [runningBulk, setRunningBulk] = useState(false);

  // Variants config for bulk run
  const [variantsConfig, setVariantsConfig] = useState<any>(null);
  const [selectedVariant, setSelectedVariant] = useState<
    Record<string, string>
  >({});
  const [runAllVariants, setRunAllVariants] = useState(true);

  // Output format and diffing options for bulk run
  const [runFormat, setRunFormat] = useState<
    "step-by-step-images" | "summary-video"
  >("step-by-step-images");
  const [runDiff, setRunDiff] = useState<boolean | null>(null); // null = use config default
  const [diffingEnabled, setDiffingEnabled] = useState(true); // from config

  // Bulk delete dialog
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [deleteAllType, setDeleteAllType] = useState<"scenarios" | "assets">(
    "scenarios",
  );

  // Sorting and filtering state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("lastRun");
  const [sortAsc, setSortAsc] = useState(false); // Default descending for lastRun (most recent first)

  const loadScenarios = useCallback(async () => {
    setLoading(true);
    try {
      const [scenariosRes, configRes] = await Promise.all([
        fetch("/api/scenarios/metadata"),
        fetch("/api/config"),
      ]);
      const [scenariosData, configData] = await Promise.all([
        scenariosRes.json(),
        configRes.json(),
      ]);
      setScenarios(scenariosData.scenarios || []);
      setVariantsConfig(configData.config?.variants || null);
      // Load diffing config - default to true unless explicitly disabled
      setDiffingEnabled(configData.config?.diffing?.enabled !== false);

      // Auto-expand all groups on first load
      if (expandedGroups.size === 0) {
        const categories = new Set<string>(
          (scenariosData.scenarios || []).map((s: Scenario) =>
            extractCategory(s),
          ),
        );
        setExpandedGroups(categories);
      }
    } catch (err) {
      console.error("Failed to load scenarios:", err);
    } finally {
      setLoading(false);
    }
  }, [expandedGroups.size]);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  // Disabled auto-refresh to prevent unwanted page refreshes
  // useConfigRefresh(loadScenarios, { enabled: true, interval: 10000 });

  const handleManualRefresh = useManualRefresh(loadScenarios);

  const handleBulkDelete = async () => {
    try {
      const endpoint =
        deleteAllType === "scenarios" ? "/api/config/scenarios" : "/api/assets";

      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Success",
          description:
            deleteAllType === "scenarios"
              ? `Deleted ${data.deleted} scenario(s)`
              : `Deleted ${data.deleted} asset file(s)`,
          variant: "success",
        });
        setIsDeleteAllDialogOpen(false);
        if (deleteAllType === "scenarios") {
          loadScenarios();
        }
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to bulk delete:", err);
      toast({
        title: "Error",
        description: "Failed to perform bulk delete",
        variant: "destructive",
      });
    }
  };

  // Filtered and sorted scenarios
  const filteredScenarios = useMemo(() => {
    let result = [...scenarios];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.key.toLowerCase().includes(query) ||
          s.url.toLowerCase().includes(query) ||
          extractCategory(s).toLowerCase().includes(query),
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "key":
          cmp = a.key.localeCompare(b.key);
          break;
        case "steps":
          cmp = (a.steps?.length || 0) - (b.steps?.length || 0);
          break;
        case "lastRun":
          // Sort by lastRunAt, then by createdAt, then by name
          const aTime = a._metadata?.lastRunAt || a._metadata?.createdAt || "";
          const bTime = b._metadata?.lastRunAt || b._metadata?.createdAt || "";
          cmp = aTime.localeCompare(bTime);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [scenarios, searchQuery, sortBy, sortAsc]);

  // Group scenarios by category
  const groupedScenarios = useMemo(() => {
    const groups: Record<string, Scenario[]> = {};

    for (const scenario of filteredScenarios) {
      const category = extractCategory(scenario);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(scenario);
    }

    // Sort groups by name, with "other" at the end
    const sortedGroups = Object.entries(groups)
      .sort(([a], [b]) => {
        if (a === "other") return 1;
        if (b === "other") return -1;
        return a.localeCompare(b);
      })
      .map(([key, scenarios]) => ({
        key,
        name: formatCategoryName(key),
        scenarios,
        isExpanded: expandedGroups.has(key),
      }));

    return sortedGroups;
  }, [filteredScenarios, expandedGroups]);

  // Toggle group expansion
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Selection handlers
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

  const toggleGroupSelection = (group: ScenarioGroup) => {
    const groupKeys = group.scenarios.map((s) => s.key);
    const allSelected = groupKeys.every((k) => selectedScenarios.has(k));

    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        // Deselect all in group
        groupKeys.forEach((k) => next.delete(k));
      } else {
        // Select all in group
        groupKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const selectAll = () => {
    const allKeys = filteredScenarios.map((s) => s.key);
    setSelectedScenarios(new Set(allKeys));
  };

  const clearSelection = () => {
    setSelectedScenarios(new Set());
  };

  // Bulk run handler
  const handleBulkRun = async () => {
    if (selectedScenarios.size === 0) {
      toast({
        title: "No scenarios selected",
        description: "Please select at least one scenario to run",
        variant: "destructive",
      });
      return;
    }

    setRunningBulk(true);

    try {
      const scenarioKeys = Array.from(selectedScenarios);

      // Build run configuration with all options
      const runConfig: any = {
        scenarioKeys,
        format: runFormat,
        diff: runDiff === null ? diffingEnabled : runDiff,
      };

      if (!runAllVariants && Object.keys(selectedVariant).length > 0) {
        runConfig.variant = selectedVariant;
      }

      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runConfig),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start capture job");
      }

      if (data.job) {
        trackJob(data.job.id, `${selectedScenarios.size} scenarios`);
        setIsRunDialogOpen(false);
        clearSelection();
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to start capture";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setRunningBulk(false);
    }
  };

  const toggleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(option);
      setSortAsc(true);
    }
  };

  const handleCreateScenario = async () => {
    if (!newScenario.name || !newScenario.key || !newScenario.url) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Validate key format
    if (!/^[a-z0-9-]+$/.test(newScenario.key)) {
      toast({
        title: "Error",
        description:
          "Key must contain only lowercase letters, numbers, and hyphens",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/config/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newScenario,
          steps: [],
        }),
      });

      if (res.ok) {
        toast({
          title: "Success",
          description: "Scenario created successfully",
          variant: "success",
        });
        setIsCreateDialogOpen(false);
        setNewScenario({ name: "", key: "", url: "" });
        // Reload scenarios
        const configRes = await fetch("/api/config");
        const configData = await configRes.json();
        setScenarios(configData.config?.scenarios || []);
        // Navigate to the new scenario
        navigate(`/scenarios/${newScenario.key}`);
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to create scenario",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to create scenario:", err);
      toast({
        title: "Error",
        description: "Failed to create scenario",
        variant: "destructive",
      });
    }
  };

  const generateKeyFromName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  };

  return (
    <div
      data-testid="studio-scenarios"
      data-loaded="true"
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Scenarios</h1>
          <p className="text-xs text-muted-foreground mt-1 font-normal">
            {scenarios.length} scenarios in {groupedScenarios.length} categories
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleManualRefresh}
            title="Refresh"
            className="shadow-sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDeleteAllType("scenarios");
              setIsDeleteAllDialogOpen(true);
            }}
            title="Delete all scenarios"
            className="shadow-sm text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete All
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/recorder")}
            className="shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Scenario
          </Button>
        </div>
      </div>

      {/* Search, Sort, View Mode, and Bulk Actions */}
      {scenarios.length > 0 && (
        <div className="space-y-3">
          {/* Search and View Toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search scenarios or categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 border rounded-md p-0.5">
              <Button
                variant={viewMode === "grouped" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setViewMode("grouped")}
              >
                <Layers className="h-3 w-3 mr-1" />
                Grouped
              </Button>
              <Button
                variant={viewMode === "flat" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setViewMode("flat")}
              >
                <FileText className="h-3 w-3 mr-1" />
                Flat
              </Button>
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-1 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground mr-1" />
              <Button
                variant={sortBy === "lastRun" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => toggleSort("lastRun")}
              >
                Last Run {sortBy === "lastRun" && (sortAsc ? "↑" : "↓")}
              </Button>
              <Button
                variant={sortBy === "name" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => toggleSort("name")}
              >
                Name {sortBy === "name" && (sortAsc ? "↑" : "↓")}
              </Button>
            </div>
          </div>

          {/* Selection Controls and Bulk Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={
                  selectedScenarios.size > 0 ? clearSelection : selectAll
                }
              >
                {selectedScenarios.size > 0 ? (
                  <>
                    <Square className="h-3.5 w-3.5 mr-1" />
                    Clear ({selectedScenarios.size})
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-3.5 w-3.5 mr-1" />
                    Select All
                  </>
                )}
              </Button>

              {selectedScenarios.size > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedScenarios.size} selected
                </Badge>
              )}
            </div>

            {/* Bulk Run Button */}
            {selectedScenarios.size > 0 && (
              <Button
                size="sm"
                onClick={() => setIsRunDialogOpen(true)}
                className="gap-1.5"
              >
                <Play className="h-3.5 w-3.5" />
                Run Selected ({selectedScenarios.size})
              </Button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading scenarios...</div>
      ) : scenarios.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Scenarios</CardTitle>
            <CardDescription>
              Create your first scenario to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Scenario
            </Button>
          </CardContent>
        </Card>
      ) : filteredScenarios.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No scenarios match "{searchQuery}"
            </p>
            <Button variant="link" onClick={() => setSearchQuery("")}>
              Clear search
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "grouped" ? (
        /* Grouped View */
        <div className="space-y-4">
          {groupedScenarios.map((group) => {
            const groupAllSelected = group.scenarios.every((s) =>
              selectedScenarios.has(s.key),
            );
            const groupSomeSelected = group.scenarios.some((s) =>
              selectedScenarios.has(s.key),
            );

            return (
              <Card key={group.key} className="overflow-hidden">
                {/* Group Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(group.key)}
                >
                  <Checkbox
                    checked={groupAllSelected}
                    className={cn(
                      "data-[state=indeterminate]:bg-primary/50",
                      groupSomeSelected &&
                        !groupAllSelected &&
                        "data-[state=checked]:bg-primary/50",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupSelection(group);
                    }}
                  />
                  <div className="flex items-center gap-2 flex-1">
                    {group.isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{group.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {group.scenarios.length}
                    </Badge>
                  </div>
                </div>

                {/* Group Scenarios */}
                {group.isExpanded && (
                  <div className="divide-y">
                    {group.scenarios.map((scenario) => (
                      <div
                        key={scenario.key}
                        data-testid={`studio-scenario-row-${scenario.key}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
                      >
                        <Checkbox
                          checked={selectedScenarios.has(scenario.key)}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleScenarioSelection(scenario.key);
                          }}
                        />
                        <Link
                          to={`/scenarios/${scenario.key}`}
                          data-testid={`studio-scenario-link-${scenario.key}`}
                          className="flex-1 min-w-0 group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                                {scenario.name}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono">
                                  {scenario.key}
                                </span>
                                <span>•</span>
                                <span>{scenario.steps?.length || 0} steps</span>
                                <span>•</span>
                                <Clock className="h-3 w-3" />
                                <span>
                                  {formatRelativeTime(
                                    scenario._metadata?.lastRunAt || null,
                                  )}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        /* Flat View (original grid) */
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredScenarios.map((scenario) => (
            <div
              key={scenario.key}
              data-testid={`studio-scenario-row-${scenario.key}`}
              className="relative"
            >
              <div className="absolute top-3 left-3 z-10">
                <Checkbox
                  checked={selectedScenarios.has(scenario.key)}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleScenarioSelection(scenario.key);
                  }}
                  className="bg-background"
                />
              </div>
              <Link
                to={`/scenarios/${scenario.key}`}
                data-testid={`studio-scenario-link-${scenario.key}`}
              >
                <Card className="dagster-card cursor-pointer group">
                  <CardHeader className="px-4 py-3 pl-10">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
                        {scenario.name}
                      </CardTitle>
                      <FileText className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <CardDescription className="font-mono text-[10px] mt-1 text-muted-foreground">
                      {scenario.key}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          {extractCategory(scenario)}
                        </Badge>
                        <span>•</span>
                        <span className="font-medium">
                          {scenario.steps?.length || 0}
                        </span>
                        <span>steps</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {formatRelativeTime(
                              scenario._metadata?.lastRunAt || null,
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate font-mono">
                        {scenario.url}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Create Scenario Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Scenario</DialogTitle>
            <DialogDescription>
              Create a new visual scenario. You can add steps later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newScenario.name}
                onChange={(e) => {
                  setNewScenario({
                    ...newScenario,
                    name: e.target.value,
                    key: newScenario.key || generateKeyFromName(e.target.value),
                  });
                }}
                placeholder="Admin Dashboard"
              />
            </div>
            <div>
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                value={newScenario.key}
                onChange={(e) =>
                  setNewScenario({ ...newScenario, key: e.target.value })
                }
                placeholder="admin-dashboard"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>
            <div>
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={newScenario.url}
                onChange={(e) =>
                  setNewScenario({ ...newScenario, url: e.target.value })
                }
                placeholder="https://example.com/dashboard"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateScenario}>Create Scenario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record New Visual Dialog */}
      <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record New Visual</DialogTitle>
            <DialogDescription>
              Create a new visual by recording it. Enter a title and the
              recorder will start.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="record-title">Visual Title</Label>
              <Input
                id="record-title"
                value={recordTitle}
                onChange={(e) => setRecordTitle(e.target.value)}
                placeholder="Admin Dashboard"
              />
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>This will:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Start a recording job</li>
                <li>Open Chrome with remote debugging (if not already open)</li>
                <li>Allow you to capture steps using keyboard shortcuts</li>
              </ul>
              <p className="mt-4 font-medium">Keyboard shortcuts:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">
                    C
                  </kbd>{" "}
                  - Capture
                </li>
                <li>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">
                    Q
                  </kbd>{" "}
                  - Quit and save
                </li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRecordDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!recordTitle.trim()) {
                  toast({
                    title: "Error",
                    description: "Please enter a title",
                    variant: "destructive",
                  });
                  return;
                }

                try {
                  const res = await fetch("/api/jobs/record", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: recordTitle }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    toast({
                      title: "Success",
                      description:
                        "Recording job started. Check Jobs page and your terminal.",
                      variant: "success",
                    });
                    setIsRecordDialogOpen(false);
                    setRecordTitle("");
                  } else {
                    toast({
                      title: "Error",
                      description: data.error || "Failed to start recording",
                      variant: "destructive",
                    });
                  }
                } catch (err) {
                  toast({
                    title: "Error",
                    description: "Failed to start recording",
                    variant: "destructive",
                  });
                }
              }}
            >
              Start Recording
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Run Dialog */}
      <Dialog open={isRunDialogOpen} onOpenChange={setIsRunDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Run Selected Scenarios</DialogTitle>
            <DialogDescription>
              Capture assets for {selectedScenarios.size} selected scenario(s)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Output Format */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Output Format</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRunFormat("step-by-step-images")}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    runFormat === "step-by-step-images"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    <span className="font-medium text-sm">Screenshots</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRunFormat("summary-video")}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    runFormat === "summary-video"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Film className="h-4 w-4" />
                    <span className="font-medium text-sm">Video</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Visual Diffing Toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Visual Diffing</Label>
                  <p className="text-xs text-muted-foreground">
                    Compare against approved baselines
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {runDiff === null && diffingEnabled && (
                    <span className="text-xs text-muted-foreground">
                      (default: on)
                    </span>
                  )}
                  {runDiff === null && !diffingEnabled && (
                    <span className="text-xs text-muted-foreground">
                      (default: off)
                    </span>
                  )}
                  <input
                    type="checkbox"
                    checked={runDiff === null ? diffingEnabled : runDiff}
                    onChange={(e) => setRunDiff(e.target.checked)}
                    className="rounded h-4 w-4"
                  />
                </div>
              </div>
            </div>

            {/* Output Crop Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Output Crop</Label>
                  <p className="text-xs text-muted-foreground">
                    Crop is configured per-scenario in Details tab
                  </p>
                </div>
              </div>
            </div>

            {/* Selected scenarios summary */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Selected Scenarios:
              </Label>
              <div className="max-h-28 overflow-auto border rounded-md p-2 space-y-1">
                {Array.from(selectedScenarios).map((key) => {
                  const scenario = scenarios.find((s) => s.key === key);
                  const category = scenario
                    ? extractCategory(scenario)
                    : key.split("-")[0] || "other";
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {category}
                      </Badge>
                      <span className="font-medium">
                        {scenario?.name || key}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Variant options */}
            {variantsConfig?.dimensions &&
              Object.keys(variantsConfig.dimensions).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="run-all-variants"
                      checked={runAllVariants}
                      onCheckedChange={(checked) =>
                        setRunAllVariants(!!checked)
                      }
                    />
                    <Label htmlFor="run-all-variants" className="text-sm">
                      Run all variant combinations
                    </Label>
                  </div>

                  {!runAllVariants && (
                    <div className="pl-6 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Select specific variant:
                      </p>
                      {Object.entries(variantsConfig.dimensions).map(
                        ([dimKey, dim]: [string, any]) => (
                          <div key={dimKey} className="space-y-1">
                            <Label className="text-xs">
                              {dim.label || dimKey}
                            </Label>
                            <div className="flex flex-wrap gap-1">
                              {dim.options &&
                                Object.entries(dim.options).map(
                                  ([optKey, opt]: [string, any]) => (
                                    <Badge
                                      key={optKey}
                                      variant={
                                        selectedVariant[dimKey] === optKey
                                          ? "default"
                                          : "outline"
                                      }
                                      className="cursor-pointer text-xs"
                                      onClick={() =>
                                        setSelectedVariant((prev) => ({
                                          ...prev,
                                          [dimKey]: optKey,
                                        }))
                                      }
                                    >
                                      {opt?.name || optKey}
                                    </Badge>
                                  ),
                                )}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRunDialogOpen(false)}
              disabled={runningBulk}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkRun} disabled={runningBulk}>
              {runningBulk ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run {selectedScenarios.size} Scenario(s)
                </>
              )}
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
              Delete All{" "}
              {deleteAllType === "scenarios" ? "Scenarios" : "Assets"}?
            </DialogTitle>
            <DialogDescription>
              {deleteAllType === "scenarios"
                ? `This will permanently remove all ${scenarios.length} scenarios from your config. This action cannot be undone.`
                : "This will permanently delete all captured asset files from the output folder. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteAllDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
