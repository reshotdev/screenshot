import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useJobMonitor } from "@/components/FloatingJobMonitor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import JobStatusBadge from "@/components/JobStatusBadge";
import ConfigDiff from "@/components/ConfigDiff";
import PlatformVisualCard from "@/components/PlatformVisualCard";
import AuthPrompt from "@/components/AuthPrompt";
import {
  FileText,
  RefreshCw,
  Play,
  Upload,
  Video,
  Image,
  Globe,
  AlertCircle,
  Settings,
  Loader2,
  Download,
  GitCompare,
  Eye,
  ChevronDown,
  ChevronUp,
  Edit,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusResponse {
  settings: {
    isAuthenticated: boolean;
    projectId: string | null;
    projectName: string | null;
    workspaceName: string | null;
    lastSyncedAt: string | null;
    lastPublishedCommitHash: string | null;
    features: {
      visuals?: boolean;
      docs?: boolean;
    } | null;
  };
  configStatus: {
    hasConfig: boolean;
    configError: string | null;
    scenarioCount: number;
    totalSteps: number;
    lastSyncedAt: string | null;
    lastPublishedCommitHash: string | null;
  };
  jobs: Array<{
    id: string;
    type: "run" | "publish" | "record";
    status: "pending" | "running" | "success" | "failed";
    createdAt: string;
    updatedAt: string;
    scenarioKey?: string | null;
  }>;
  localAssets: {
    totalFiles: number;
    totalSize: number;
    groups: Array<{
      scenarioKey: string;
      variationSlug: string;
      assetCount: number;
    }>;
  };
  remote: {
    visualsCount: number;
    reviewQueueCount: number;
    error: string | null;
  };
}

interface Visual {
  id: string;
  name?: string;
  key: string;
  status?: string;
  [key: string]: any;
}

interface ReviewItem {
  id: string;
  visualId: string;
  status: string;
  [key: string]: any;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { trackJob } = useJobMonitor();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Force polling after job creation
  const [forcePoll, setForcePoll] = useState(0);

  // Expandable sections
  const [showSync, setShowSync] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [showJobs, setShowJobs] = useState(true);

  // Sync state
  const [diffData, setDiffData] = useState<{ local: any; remote: any } | null>(
    null,
  );
  const [syncing, setSyncing] = useState(false);

  // Remote state
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [localScenarios, setLocalScenarios] = useState<Set<string>>(new Set());

  // Record dialog
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [recordTitle, setRecordTitle] = useState("");

  // Auth prompt
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Failed to load status");
      const data = await res.json();
      setStatus(data);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load status:", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status) return;

    // Only poll when there are running jobs OR forcePoll is set
    const hasRunningJobs = status.jobs.some((j) => j.status === "running");
    if (!hasRunningJobs && forcePoll === 0) return; // No polling when idle

    const interval = setInterval(() => {
      loadStatus();
    }, 3000); // Faster polling for better UX
    return () => clearInterval(interval);
  }, [status, loadStatus, forcePoll]);

  // Load local scenarios for sync status
  useEffect(() => {
    if (status?.configStatus.hasConfig) {
      fetch("/api/config")
        .then((res) => res.json())
        .then((data) => {
          const scenarios = data.config?.scenarios || [];
          setLocalScenarios(new Set(scenarios.map((s: any) => s.key)));
        })
        .catch(() => {});
    }
  }, [status]);

  const handleInit = async () => {
    if (!status?.settings.projectId) {
      toast({
        title: "Error",
        description:
          "No project ID available. Please run `reshot auth` first.",
        variant: "destructive",
      });
      return;
    }

    setActionLoading("init");
    try {
      const res = await fetch("/api/settings/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: status.settings.projectId,
          overwrite: false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Success",
          description: "Project initialized successfully",
          variant: "success",
        });
        loadStatus();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to initialize project",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to initialize project",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunAll = async () => {
    setActionLoading("run");
    try {
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Success",
          description: "Run job created",
          variant: "success",
        });
        loadStatus();
        // Track job in FloatingJobMonitor
        if (data.job?.id) {
          trackJob(data.job.id);
        }
        // Trigger immediate polling
        setForcePoll((prev) => prev + 1);
        setTimeout(() => setForcePoll(0), 10000);
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to create run job",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to create run job",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublish = async () => {
    // Check auth first
    if (!status?.settings?.isAuthenticated) {
      setIsAuthPromptOpen(true);
      return;
    }

    setActionLoading("publish");
    try {
      const res = await fetch("/api/jobs/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Success",
          description: "Publish job created",
          variant: "success",
        });
        loadStatus();
        // Track job in FloatingJobMonitor
        if (data.job?.id) {
          trackJob(data.job.id);
        }
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
        description: "Failed to create publish job",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Handler when auth completes
  const handleAuthComplete = useCallback(() => {
    toast({
      title: "Connected",
      description:
        "Successfully connected to Reshot platform. You can now publish.",
      variant: "success",
    });
    loadStatus(); // Refresh to get updated auth status
  }, [toast, loadStatus]);

  const handleRecord = async () => {
    if (!recordTitle.trim()) {
      toast({
        title: "Error",
        description: "Please enter a title for the recording",
        variant: "destructive",
      });
      return;
    }

    setActionLoading("record");
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
        loadStatus();
        // Track job in FloatingJobMonitor
        if (data.job?.id) {
          trackJob(data.job.id);
        }
        // Trigger immediate polling
        setForcePoll((prev) => prev + 1);
        setTimeout(() => setForcePoll(0), 10000);
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
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanupJobs = async () => {
    try {
      const res = await fetch("/api/jobs/cleanup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Success",
          description: data.cleaned
            ? "Cleaned up stuck jobs"
            : "No stuck jobs found",
          variant: "success",
        });
        loadStatus();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to cleanup jobs",
        variant: "destructive",
      });
    }
  };

  const loadDiff = async () => {
    try {
      const res = await fetch("/api/sync/diff");
      const data = await res.json();
      setDiffData(data);
      setShowSync(true);
    } catch (err) {
      console.error("Failed to load diff:", err);
      toast({
        title: "Error",
        description: "Failed to load configuration differences",
        variant: "destructive",
      });
    }
  };

  const handlePull = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/pull", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Success",
          description: "Config pulled from platform successfully",
          variant: "success",
        });
        loadStatus();
        loadDiff();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to pull config",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to pull config from platform",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handlePush = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/push", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Success",
          description: `Config exported to ${data.path}`,
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to push config",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to push config to platform",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const loadRemote = async () => {
    setRemoteLoading(true);
    try {
      const [visualsRes, queueRes] = await Promise.all([
        fetch("/api/remote/visuals"),
        fetch("/api/remote/review-queue"),
      ]);

      const visualsData = await visualsRes.json();
      const queueData = await queueRes.json();

      setVisuals(visualsData.visuals || []);
      setReviewQueue(queueData.queue || []);
      setShowRemote(true);
    } catch (err) {
      console.error("Failed to load remote data:", err);
      toast({
        title: "Error",
        description: "Failed to load remote data",
        variant: "destructive",
      });
    } finally {
      setRemoteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>Failed to load dashboard status</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { settings, configStatus, jobs, localAssets, remote } = status;
  const recentJobs = jobs.slice(0, 5);
  const hasRunningJobs = jobs.some((j) => j.status === "running");

  return (
    <div
      data-testid="studio-dashboard"
      data-loaded="true"
      className="p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1 font-normal">
            Manage everything from one place
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={loadStatus}
          title="Refresh"
          className="shadow-sm"
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="dagster-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-3.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Project
            </CardTitle>
            <div className="p-1.5 rounded-md bg-primary/10">
              <FileText className="h-3 w-3 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3.5">
            <div className="text-lg font-bold tracking-tight">
              {settings.projectName || "Unknown"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
              {settings.projectId || "No project ID"}
            </p>
          </CardContent>
        </Card>

        <Card className="dagster-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-3.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Scenarios
            </CardTitle>
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <FileText className="h-3 w-3 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3.5">
            <div className="text-lg font-bold tracking-tight">
              {configStatus.scenarioCount}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {configStatus.totalSteps} total steps
            </p>
          </CardContent>
        </Card>

        <Card className="dagster-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-3.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Local Assets
            </CardTitle>
            <div className="p-1.5 rounded-md bg-green-500/10">
              <Image className="h-3 w-3 text-green-500" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3.5">
            <div className="text-lg font-bold tracking-tight">
              {localAssets.totalFiles}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {localAssets.groups.length} scenario groups
            </p>
          </CardContent>
        </Card>

        <Card className="dagster-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-3.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Remote
            </CardTitle>
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Globe className="h-3 w-3 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3.5">
            <div className="text-lg font-bold tracking-tight">
              {remote.visualsCount}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {remote.reviewQueueCount} in queue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Primary Actions Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-medium text-muted-foreground">
                Actions:
              </span>
              <Button
                size="sm"
                onClick={() => setIsRecordDialogOpen(true)}
                disabled={!configStatus.hasConfig}
              >
                <Video className="h-3 w-3 mr-1.5" />
                Record
              </Button>
              <Button
                size="sm"
                onClick={handleRunAll}
                disabled={actionLoading === "run" || !configStatus.hasConfig}
              >
                {actionLoading === "run" ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1.5" />
                    Run All
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePublish}
                disabled={
                  actionLoading === "publish" || !configStatus.hasConfig
                }
              >
                {actionLoading === "publish" ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Upload className="h-3 w-3 mr-1.5" />
                    Publish
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/scenarios")}
              >
                <Edit className="h-3 w-3 mr-1.5" />
                Edit Config
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSync(!showSync)}
              >
                <GitCompare className="h-3 w-3 mr-1.5" />
                Sync
                {showSync ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!showRemote) loadRemote();
                  else setShowRemote(!showRemote);
                }}
                disabled={remoteLoading}
              >
                <Globe className="h-3 w-3 mr-1.5" />
                Remote
                {showRemote ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup & Auth Status */}
      {(!settings.isAuthenticated || !configStatus.hasConfig) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Settings className="h-4 w-4" />
              Setup & Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!settings.isAuthenticated ? (
              <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                    Not authenticated
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Run{" "}
                    <code className="px-1 py-0.5 bg-muted rounded text-xs">
                      reshot auth
                    </code>{" "}
                    in your terminal to authenticate.
                  </p>
                </div>
              </div>
            ) : !configStatus.hasConfig ? (
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
                <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    No configuration found
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    Initialize your project by pulling the blueprint from the
                    platform.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleInit}
                    disabled={actionLoading === "init"}
                  >
                    {actionLoading === "init" ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                        Initializing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1.5" />
                        Initialize from Platform
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Jobs Section - Always Visible */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <RefreshCw className="h-4 w-4" />
              Recent Jobs
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowJobs(!showJobs)}
            >
              {showJobs ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>
        </CardHeader>
        {showJobs && (
          <CardContent className="space-y-3">
            {recentJobs.length > 0 ? (
              <div className="space-y-2">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-md hover:bg-muted/70 cursor-pointer transition-colors"
                    onClick={() => navigate(`/jobs?job=${job.id}`)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {job.type === "run" && (
                        <Play className="h-3 w-3 text-blue-500 flex-shrink-0" />
                      )}
                      {job.type === "publish" && (
                        <Upload className="h-3 w-3 text-green-500 flex-shrink-0" />
                      )}
                      {job.type === "record" && (
                        <Video className="h-3 w-3 text-purple-500 flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium truncate">
                        {job.type}
                      </span>
                      {job.scenarioKey && (
                        <span className="text-xs text-muted-foreground truncate">
                          {job.scenarioKey}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <JobStatusBadge status={job.status} />
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No jobs yet
              </p>
            )}
            {hasRunningJobs && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>
                  Jobs are running... Status will update automatically
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/jobs")}
                className="flex-1"
              >
                View All Jobs
              </Button>
              {hasRunningJobs && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanupJobs}
                  title="Clean up stuck jobs"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Sync Section - Expandable */}
      {showSync && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <GitCompare className="h-4 w-4" />
                Sync with Platform
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSync(false)}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Synchronize your local configuration with the Reshot platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Pull from Platform</Label>
                  <span className="text-xs text-muted-foreground">
                    {configStatus.lastSyncedAt
                      ? new Date(configStatus.lastSyncedAt).toLocaleString()
                      : "Never synced"}
                  </span>
                </div>
                <Button
                  onClick={handlePull}
                  disabled={syncing}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {syncing ? "Pulling..." : "Pull from Platform"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Push to Platform</Label>
                <p className="text-xs text-muted-foreground">
                  Exports to .reshot/export-config.json
                </p>
                <Button
                  onClick={handlePush}
                  disabled={syncing}
                  variant="outline"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {syncing ? "Pushing..." : "Push to Platform"}
                </Button>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm">Configuration Differences</Label>
                <Button variant="outline" size="sm" onClick={loadDiff}>
                  <GitCompare className="h-4 w-4 mr-2" />
                  Load Diff
                </Button>
              </div>
              {diffData ? (
                <ConfigDiff
                  localConfig={diffData.local}
                  remoteConfig={diffData.remote}
                />
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Click "Load Diff" to compare local and remote configurations
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remote Section - Expandable */}
      {showRemote && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4" />
                Remote Platform State
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadRemote}
                  disabled={remoteLoading}
                >
                  <RefreshCw
                    className={cn("h-3 w-3", remoteLoading && "animate-spin")}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRemote(false)}
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs">
              View visuals and review queue from the Reshot platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {remote.error ? (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                <p className="text-sm text-yellow-900 dark:text-yellow-100">
                  Platform unreachable: {remote.error}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Remote Visuals ({visuals.length})
                    </h3>
                    {settings.projectId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `https://app.reshot.dev/projects/${settings.projectId}`,
                            "_blank",
                          )
                        }
                      >
                        Open in Platform
                      </Button>
                    )}
                  </div>
                  {visuals.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No visuals found on the platform. Publish assets to create
                      visuals.
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 max-h-96 overflow-y-auto">
                      {visuals.map((visual) => {
                        const isLocal = localScenarios.has(visual.key);
                        const syncStatus = isLocal ? "synced" : "remote-only";
                        return (
                          <PlatformVisualCard
                            key={visual.id}
                            visual={visual}
                            localScenarioKey={isLocal ? visual.key : undefined}
                            syncStatus={syncStatus}
                            onOpenInBrowser={(visualId) => {
                              if (settings.projectId) {
                                window.open(
                                  `https://app.reshot.dev/projects/${settings.projectId}/visuals?visual=${visualId}`,
                                  "_blank",
                                );
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Review Queue ({reviewQueue.length})
                  </h3>
                  {reviewQueue.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No items pending review on the platform.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {reviewQueue.map((item) => (
                        <Card key={item.id} className="dagster-card">
                          <CardHeader className="p-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-xs">
                                  Review Item
                                </CardTitle>
                                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                                  {item.visualId}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  item.status === "approved"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-[10px]"
                              >
                                {item.status}
                              </Badge>
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Record Dialog */}
      <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Visual</DialogTitle>
            <DialogDescription>
              Start a recording session. The recorder will open in your
              terminal.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="record-title">Title</Label>
            <Input
              id="record-title"
              value={recordTitle}
              onChange={(e) => setRecordTitle(e.target.value)}
              placeholder="Enter recording title"
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRecord();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRecordDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecord}
              disabled={actionLoading === "record" || !recordTitle.trim()}
            >
              {actionLoading === "record" ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Recording"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Prompt Dialog */}
      <AuthPrompt
        open={isAuthPromptOpen}
        onOpenChange={setIsAuthPromptOpen}
        onAuthenticated={handleAuthComplete}
      />
    </div>
  );
}
