import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  FolderOpen,
  Upload,
  GitCommit,
  ChevronRight,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Scenario {
  key: string;
  name: string;
  description?: string;
  url?: string;
  steps?: any[];
}

interface WorkspaceData {
  name: string;
  description?: string;
  scenarios: string[]; // scenario keys
  variants: {
    dimensions: Record<string, string[]>;
    presets: Record<string, Record<string, string>>;
  };
  commits?: Array<{
    id: string;
    message: string;
    scenarioKeys: string[];
    assetCount: number;
    createdAt: string;
    platformCommitId?: string;
  }>;
  resolvedScenarios: Scenario[];
  allScenarios: Scenario[];
}

interface AssetGroup {
  scenarioKey: string;
  variationSlug: string;
  assets: Array<{
    path: string;
    step: string;
    filename: string;
  }>;
}

export default function Workspace() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [allScenarios, setAllScenarios] = useState<Scenario[]>([]);
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Commit dialog state
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(
    new Set()
  );
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Expanded sections
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(
    new Set()
  );

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true);

      // Load workspace data
      const wsResponse = await fetch("/api/workspace");
      const wsData = await wsResponse.json();

      if (wsData.workspace) {
        setWorkspace(wsData.workspace);
        setAllScenarios(wsData.workspace.allScenarios || []);
        // Pre-select all workspace scenarios
        setSelectedScenarios(new Set(wsData.workspace.scenarios || []));
      } else {
        // Initialize workspace if not exists
        const createResponse = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Default Workspace" }),
        });
        const createData = await createResponse.json();
        if (createData.workspace) {
          setWorkspace(createData.workspace);
          setAllScenarios(createData.workspace.allScenarios || []);
        }
      }

      // Load asset groups
      const statusResponse = await fetch("/api/status");
      const statusData = await statusResponse.json();
      setIsAuthenticated(statusData.settings?.isAuthenticated || false);

      // Transform localAssets groups to our AssetGroup format
      const groups = statusData.localAssets?.groups || [];
      setAssetGroups(
        groups.map((g: any) => ({
          scenarioKey: g.scenarioKey,
          variationSlug: g.variationSlug,
          assets: Array(g.assetCount).fill({
            path: "",
            step: "",
            filename: "",
          }), // Placeholder
        }))
      );
    } catch (error) {
      console.error("Failed to load workspace:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const addScenarioToWorkspace = async (scenarioKey: string) => {
    try {
      const response = await fetch("/api/workspace/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioKeys: [scenarioKey] }),
      });
      const data = await response.json();
      if (data.workspace) {
        setWorkspace(data.workspace);
        setSelectedScenarios((prev) => new Set([...prev, scenarioKey]));
      }
    } catch (error) {
      console.error("Failed to add scenario:", error);
    }
  };

  const removeScenarioFromWorkspace = async (scenarioKey: string) => {
    try {
      const response = await fetch(
        `/api/workspace/scenarios/${encodeURIComponent(scenarioKey)}`,
        {
          method: "DELETE",
        }
      );
      const data = await response.json();
      if (data.workspace) {
        setWorkspace(data.workspace);
        setSelectedScenarios((prev) => {
          const next = new Set(prev);
          next.delete(scenarioKey);
          return next;
        });
      }
    } catch (error) {
      console.error("Failed to remove scenario:", error);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      setCommitError("Commit message is required");
      return;
    }

    if (selectedScenarios.size === 0) {
      setCommitError("Select at least one scenario");
      return;
    }

    setIsCommitting(true);
    setCommitError(null);

    try {
      const response = await fetch("/api/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: commitMessage.trim(),
          scenarioKeys: Array.from(selectedScenarios),
          includeAllVariants: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create commit");
      }

      // Success - close dialog and refresh
      setShowCommitDialog(false);
      setCommitMessage("");
      loadWorkspace();
    } catch (error) {
      setCommitError(
        error instanceof Error ? error.message : "Failed to commit"
      );
    } finally {
      setIsCommitting(false);
    }
  };

  const toggleScenarioSelection = (scenarioKey: string) => {
    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(scenarioKey)) {
        next.delete(scenarioKey);
      } else {
        next.add(scenarioKey);
      }
      return next;
    });
  };

  const toggleScenarioExpanded = (scenarioKey: string) => {
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

  // Get assets for a scenario
  const getScenarioAssets = (scenarioKey: string) => {
    return assetGroups.filter((g) => g.scenarioKey === scenarioKey);
  };

  // Scenarios in workspace
  const workspaceScenarios = workspace?.resolvedScenarios || [];

  // Scenarios not in workspace
  const availableScenarios = allScenarios.filter(
    (s) => !workspace?.scenarios?.includes(s.key)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {workspace?.name || "Workspace"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {workspaceScenarios.length} scenario
              {workspaceScenarios.length !== 1 ? "s" : ""} in workspace
              {assetGroups.length > 0 &&
                ` • ${assetGroups.length} captured variants`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCommitDialog(true)}
              disabled={workspaceScenarios.length === 0 || !isAuthenticated}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                workspaceScenarios.length > 0 && isAuthenticated
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <Upload className="h-4 w-4" />
              Commit & Publish
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Workspace Scenarios */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">
              Workspace Scenarios
            </h2>
          </div>

          {workspaceScenarios.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                No scenarios in workspace yet
              </p>
              <p className="text-xs text-muted-foreground">
                Add scenarios below to start capturing and publishing
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {workspaceScenarios.map((scenario) => {
                const assets = getScenarioAssets(scenario.key);
                const isExpanded = expandedScenarios.has(scenario.key);

                return (
                  <div
                    key={scenario.key}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    {/* Scenario Header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/50 cursor-pointer"
                      onClick={() => toggleScenarioExpanded(scenario.key)}
                    >
                      <button className="text-muted-foreground">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {scenario.name || scenario.key}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {scenario.key}
                          </span>
                        </div>
                        {scenario.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {scenario.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {assets.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {assets.length} variant
                            {assets.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeScenarioFromWorkspace(scenario.key);
                          }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Content - Assets */}
                    {isExpanded && assets.length > 0 && (
                      <div className="border-t border-border bg-muted/30 px-4 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {assets.map((group, i) => (
                            <div
                              key={`${group.scenarioKey}-${group.variationSlug}-${i}`}
                              className="text-xs p-2 rounded bg-background border border-border"
                            >
                              <div className="font-medium text-foreground truncate">
                                {group.variationSlug}
                              </div>
                              <div className="text-muted-foreground">
                                {group.assets.length} capture
                                {group.assets.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isExpanded && assets.length === 0 && (
                      <div className="border-t border-border bg-muted/30 px-4 py-3">
                        <p className="text-xs text-muted-foreground">
                          No captures yet. Run a capture job to create assets.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Available Scenarios */}
        {availableScenarios.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">
                Add Scenarios
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableScenarios.map((scenario) => (
                <button
                  key={scenario.key}
                  onClick={() => addScenarioToWorkspace(scenario.key)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left"
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {scenario.name || scenario.key}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {scenario.key}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Recent Commits */}
        {workspace?.commits && workspace.commits.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <GitCommit className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">
                Recent Commits
              </h2>
            </div>

            <div className="space-y-2">
              {workspace.commits
                .slice(-5)
                .reverse()
                .map((commit) => (
                  <div
                    key={commit.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {commit.message}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {commit.scenarioKeys.length} scenario
                        {commit.scenarioKeys.length !== 1 ? "s" : ""}
                        {" • "}
                        {commit.assetCount} asset
                        {commit.assetCount !== 1 ? "s" : ""}
                        {" • "}
                        {new Date(commit.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {commit.platformCommitId && (
                      <span className="text-xs text-green-500">✓ Synced</span>
                    )}
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>

      {/* Commit Dialog */}
      {showCommitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !isCommitting && setShowCommitDialog(false)}
          />
          <div className="relative bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">
                Create Commit
              </h3>
              <p className="text-sm text-muted-foreground">
                Bundle selected scenarios and publish to platform
              </p>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-auto">
              {/* Commit Message */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Commit Message
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="e.g., Update dashboard screenshots"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>

              {/* Scenario Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Include Scenarios
                </label>
                <div className="space-y-1 max-h-48 overflow-auto border border-border rounded-md p-2">
                  {workspaceScenarios.map((scenario) => {
                    const isSelected = selectedScenarios.has(scenario.key);
                    const assets = getScenarioAssets(scenario.key);

                    return (
                      <button
                        key={scenario.key}
                        onClick={() => toggleScenarioSelection(scenario.key)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                          isSelected
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-accent/50"
                        )}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center",
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-input"
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {scenario.name || scenario.key}
                          </div>
                          {assets.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {assets.length} variant
                              {assets.length !== 1 ? "s" : ""} captured
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Error Message */}
              {commitError && (
                <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {commitError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCommitDialog(false)}
                disabled={isCommitting}
                className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={
                  isCommitting ||
                  selectedScenarios.size === 0 ||
                  !commitMessage.trim()
                }
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  isCommitting ||
                    selectedScenarios.size === 0 ||
                    !commitMessage.trim()
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {isCommitting ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Commit & Publish
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
