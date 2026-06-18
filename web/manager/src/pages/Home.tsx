import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useJobMonitor } from "@/components/FloatingJobMonitor";
import JobStatusBadge from "@/components/JobStatusBadge";
import AuthPrompt from "@/components/AuthPrompt";
import PublishPreview from "@/components/PublishPreview";
import ScenarioManagerModal from "@/components/ScenarioManagerModal";
import {
  FolderOpen,
  Plus,
  Trash2,
  Upload,
  Play,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Film,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plug,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Workspace,
  Scenario,
  AssetGroup,
  Job,
  Settings as SettingsType,
} from "@/lib/types";

interface HomeState {
  workspace: Workspace | null;
  allScenarios: Scenario[];
  assetGroups: AssetGroup[];
  jobs: Job[];
  settings: SettingsType | null;
  loading: boolean;
  error: string | null;
}

export default function Home() {
  const { toast } = useToast();
  const { trackJob } = useJobMonitor();

  // Unified state
  const [state, setState] = useState<HomeState>({
    workspace: null,
    allScenarios: [],
    assetGroups: [],
    jobs: [],
    settings: null,
    loading: true,
    error: null,
  });

  // UI state
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(
    new Set()
  );
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const [isPublishPreviewOpen, setIsPublishPreviewOpen] = useState(false);
  const [isScenarioManagerOpen, setIsScenarioManagerOpen] = useState(false);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  // Force polling after job creation
  const [forcePoll, setForcePoll] = useState(0);

  // Load all data in one comprehensive fetch
  const loadData = useCallback(
    async (showToast = false) => {
      try {
        if (showToast) setRefreshing(true);

        const [statusRes, workspaceRes, outputRes, configRes] =
          await Promise.all([
            fetch("/api/status"),
            fetch("/api/workspace"),
            fetch("/api/output"),
            fetch("/api/config"),
          ]);

        // Check for API errors
        if (!statusRes.ok) {
          throw new Error(`Status API failed: ${statusRes.status}`);
        }

        const [statusData, workspaceData, outputData, configData] =
          await Promise.all([
            statusRes.json(),
            workspaceRes.json(),
            outputRes.json(),
            configRes.json(),
          ]);

        // Process workspace data
        let workspace = workspaceData.workspace;
        if (!workspace) {
          // Auto-create workspace if doesn't exist
          const createRes = await fetch("/api/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Default Workspace" }),
          });
          if (createRes.ok) {
            const createData = await createRes.json();
            workspace = createData.workspace;
          }
        }

        // Get allScenarios from workspace first, fall back to config if empty
        const allScenarios =
          workspace?.allScenarios?.length > 0
            ? workspace.allScenarios
            : configData.config?.scenarios || [];

        setState({
          workspace,
          allScenarios,
          assetGroups: outputData.groups || [],
          jobs: statusData.jobs || [],
          settings: statusData.settings || null,
          loading: false,
          error: null,
        });

        if (showToast) {
          toast({
            title: "Refreshed",
            description: "Data updated successfully",
          });
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to load data";
        console.error("Failed to load data:", error);
        setState((prev) => ({ ...prev, loading: false, error: errorMsg }));

        if (showToast) {
          toast({
            title: "Error",
            description: errorMsg,
            variant: "destructive",
          });
        }
      } finally {
        setRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll for job updates
  useEffect(() => {
    const hasActiveJobs = state.jobs.some(
      (j) => j.status === "running" || j.status === "pending"
    );
    if (!hasActiveJobs && forcePoll === 0) return;

    const interval = setInterval(() => loadData(false), 3000);
    return () => clearInterval(interval);
  }, [state.jobs, loadData, forcePoll]);

  // Scenario actions
  const addScenarioToWorkspace = async (scenarioKey: string) => {
    try {
      const response = await fetch("/api/workspace/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioKeys: [scenarioKey] }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add scenario");
      }

      const data = await response.json();
      if (data.workspace) {
        setState((prev) => ({ ...prev, workspace: data.workspace }));
        toast({
          title: "Added",
          description: `Added ${scenarioKey} to workspace`,
        });
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to add scenario";
      console.error("Add scenario error:", error);
      toast({ title: "Error", description: msg, variant: "destructive" });
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

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove scenario");
      }

      const data = await response.json();
      if (data.workspace) {
        setState((prev) => ({ ...prev, workspace: data.workspace }));
        toast({
          title: "Removed",
          description: `Removed ${scenarioKey} from workspace`,
        });
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to remove scenario";
      console.error("Remove scenario error:", error);
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  // Run a scenario - FIXED: Use correct API endpoint /api/jobs/run
  const runScenario = async (scenarioKey: string) => {
    setRunningJobs((prev) => new Set(prev).add(scenarioKey));

    try {
      // Use the correct API endpoint: /api/jobs/run with scenarioKeys array
      const response = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioKeys: [scenarioKey] }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Failed to start capture (${response.status})`
        );
      }

      if (data.ok && data.job) {
        // Track job in floating monitor - no toast needed, monitor shows progress
        trackJob(data.job.id, scenarioKey);
        // Refresh to show new job
        await loadData(false);
        // Trigger immediate polling
        setForcePoll((prev) => prev + 1);
        setTimeout(() => setForcePoll(0), 10000);
      } else {
        throw new Error(data.error || "Unknown error starting job");
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to start capture";
      console.error("Run scenario error:", error);
      toast({
        title: "Capture Failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setRunningJobs((prev) => {
        const next = new Set(prev);
        next.delete(scenarioKey);
        return next;
      });
    }
  };

  // Toggle scenario expansion
  const toggleExpanded = (key: string) => {
    setExpandedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Get assets for a scenario
  const getScenarioAssets = (scenarioKey: string) => {
    return state.assetGroups.filter((g) => g.scenarioKey === scenarioKey);
  };

  // Derived data
  const workspaceScenarios = state.workspace?.resolvedScenarios || [];
  const availableScenarios = state.allScenarios.filter(
    (s) => !state.workspace?.scenarios?.includes(s.key)
  );
  const isAuthenticated = state.settings?.isAuthenticated || false;
  const hasAssets = state.assetGroups.length > 0;
  const activeJobs = state.jobs.filter(
    (j) => j.status === "running" || j.status === "pending"
  );

  // Loading state
  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error && !state.workspace) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Failed to Load</h2>
            <p className="text-sm text-muted-foreground mb-4">{state.error}</p>
            <Button onClick={() => loadData(true)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with quick actions */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {state.workspace?.name || "Workspace"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {workspaceScenarios.length} scenario
              {workspaceScenarios.length !== 1 ? "s" : ""}
              {hasAssets &&
                ` • ${state.assetGroups.length} captured variant${
                  state.assetGroups.length !== 1 ? "s" : ""
                }`}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => loadData(true)}
              disabled={refreshing}
              title="Refresh"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsScenarioManagerOpen(true)}
              className="gap-1.5"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage Scenarios
            </Button>

            {isAuthenticated && (
              <Button
                size="sm"
                onClick={() => setIsPublishPreviewOpen(true)}
                disabled={!hasAssets}
                className="gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                Commit
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Auth prompt if not connected */}
        {!isAuthenticated && (
          <Card className="border-yellow-500/30 bg-yellow-50/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-yellow-500/10">
                  <Plug className="h-4 w-4 text-yellow-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Connect to Platform
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Authenticate to publish assets and sync with the platform
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAuthPromptOpen(true)}
                >
                  Connect
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Active Jobs
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <JobStatusBadge status={job.status} />
                      <span className="text-sm">
                        {job.type === "run" ? "Capturing" : job.type}
                        {job.scenarioKey && `: ${job.scenarioKey}`}
                      </span>
                    </div>
                    {job.progress !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {job.progress}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workspace Scenarios */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">
                Workspace Scenarios
              </h2>
            </div>
            <button
              onClick={() => setIsScenarioManagerOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all {state.allScenarios.length} scenarios →
            </button>
          </div>

          {workspaceScenarios.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  No scenarios in workspace
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Add scenarios to start capturing and publishing visuals
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsScenarioManagerOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add First Scenario
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {workspaceScenarios.map((scenario) => {
                const assets = getScenarioAssets(scenario.key);
                const isExpanded = expandedScenarios.has(scenario.key);
                const isRunning =
                  runningJobs.has(scenario.key) ||
                  activeJobs.some((j) => j.scenarioKey === scenario.key);

                return (
                  <Card key={scenario.key} className="overflow-hidden">
                    {/* Scenario Header */}
                    <div
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors",
                        isExpanded && "bg-accent/30"
                      )}
                      onClick={() => toggleExpanded(scenario.key)}
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
                        {scenario.url && (
                          <p className="text-xs text-muted-foreground truncate">
                            {scenario.url}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Asset count badge */}
                        {assets.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {assets.reduce(
                              (sum, g) => sum + g.assets.length,
                              0
                            )}{" "}
                            assets
                          </Badge>
                        )}

                        {/* Actions */}
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => runScenario(scenario.key)}
                            disabled={isRunning}
                          >
                            {isRunning ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              removeScenarioFromWorkspace(scenario.key)
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded: Show assets */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/30 px-4 py-3">
                        {assets.length === 0 ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <AlertCircle className="h-3.5 w-3.5" />
                            No captures yet. Click play to run this scenario.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {assets.map((group, i) => (
                              <div
                                key={`${group.scenarioKey}-${group.variationSlug}-${i}`}
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {group.variationSlug === "default"
                                      ? "Default"
                                      : group.variationSlug}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    ({group.assets.length} file
                                    {group.assets.length !== 1 ? "s" : ""})
                                  </span>
                                </div>
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                                  {group.assets.slice(0, 8).map((asset, j) => (
                                    <Link
                                      key={j}
                                      to={`/assets/${group.scenarioKey}/${group.variationSlug}/${asset.captureKey}`}
                                      className="aspect-video rounded-md overflow-hidden border border-border hover:border-primary/50 transition-colors"
                                    >
                                      {asset.filename.endsWith(".mp4") ? (
                                        <div className="w-full h-full bg-muted flex items-center justify-center">
                                          <Film className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                      ) : (
                                        <img
                                          src={asset.url}
                                          alt={asset.captureKey}
                                          className="w-full h-full object-cover"
                                        />
                                      )}
                                    </Link>
                                  ))}
                                  {group.assets.length > 8 && (
                                    <Link
                                      to={`/assets`}
                                      className="aspect-video rounded-md overflow-hidden border border-border bg-muted flex items-center justify-center hover:bg-accent transition-colors"
                                    >
                                      <span className="text-xs text-muted-foreground">
                                        +{group.assets.length - 8}
                                      </span>
                                    </Link>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Quick link to scenario detail */}
                        <div className="mt-3 pt-3 border-t border-border">
                          <Link
                            to={`/scenarios/${scenario.key}`}
                            className="text-xs text-primary hover:underline"
                          >
                            Edit scenario →
                          </Link>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Add Scenarios - Show quick add options if there are available scenarios */}
        {availableScenarios.length > 0 && workspaceScenarios.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">
                  Quick Add
                </h2>
              </div>
              <button
                onClick={() => setIsScenarioManagerOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Manage all →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {availableScenarios.slice(0, 3).map((scenario) => (
                <button
                  key={scenario.key}
                  onClick={() => addScenarioToWorkspace(scenario.key)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left group"
                >
                  <div className="p-1.5 rounded bg-muted group-hover:bg-primary/10 transition-colors">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                  </div>
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
        {state.workspace?.commits && state.workspace.commits.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">
                Recent Commits
              </h2>
            </div>

            <div className="space-y-2">
              {state.workspace.commits
                .slice(-3)
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
                    {commit.platformCommitId ? (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-green-500/10 text-green-500"
                      >
                        Synced
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Local
                      </Badge>
                    )}
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>

      {/* Auth Prompt */}
      <AuthPrompt
        open={isAuthPromptOpen}
        onOpenChange={setIsAuthPromptOpen}
        onAuthenticated={loadData}
      />

      {/* Scenario Manager Modal */}
      <ScenarioManagerModal
        open={isScenarioManagerOpen}
        onOpenChange={setIsScenarioManagerOpen}
        workspaceScenarios={state.workspace?.scenarios || []}
        allScenarios={state.allScenarios}
        onScenariosChange={loadData}
      />

      {/* Publish Preview Modal */}
      <PublishPreview
        open={isPublishPreviewOpen}
        onOpenChange={setIsPublishPreviewOpen}
        onConfirm={async (selectedGroups, commitMessage) => {
          try {
            const res = await fetch("/api/jobs/publish", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                selectedGroups,
                commitMessage,
              }),
            });
            const data = await res.json();

            // Check for auth error
            if (res.status === 401 || data.authRequired) {
              setIsPublishPreviewOpen(false);
              toast({
                title: "Authentication Required",
                description: "Your API key has expired. Please reconnect.",
                variant: "destructive",
              });
              setIsAuthPromptOpen(true);
              return;
            }

            if (res.ok && data.ok) {
              setIsPublishPreviewOpen(false);
              // Track job in FloatingJobMonitor
              if (data.job?.id) {
                trackJob(data.job.id);
              }
              loadData(); // Refresh to show job
              // Trigger immediate polling
              setForcePoll((prev) => prev + 1);
              setTimeout(() => setForcePoll(0), 10000);
            } else {
              toast({
                title: "Error",
                description: data.error || "Failed to create publish job",
                variant: "destructive",
              });
            }
          } catch (err) {
            toast({
              title: "Error",
              description: "Failed to connect to server",
              variant: "destructive",
            });
          }
        }}
      />
    </div>
  );
}
