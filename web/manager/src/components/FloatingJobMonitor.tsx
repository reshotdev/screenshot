import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import PublishPreview from "@/components/PublishPreview";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronUp,
  ChevronDown,
  X,
  Minimize2,
  Maximize2,
  ExternalLink,
  Play,
  Image,
  Upload,
  FolderOpen,
  Link2,
} from "lucide-react";

// Strip ANSI escape codes (chalk color output) before parsing
const ANSI_RE = /\u001b\[[0-9;]*m/g;

interface ProgressInfo {
  current: number;
  total: number;
  activeWorkers?: number;
  eta?: string;
  throughput?: string;
}

export function parseProgressFromLogs(
  logs: Array<{ message: string }>
): ProgressInfo | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const msg = logs[i].message.replace(ANSI_RE, "");

    // New structured format: [PROGRESS] 5/28 | active:4 | last:3.2s | eta:1m45s | rate:5.2/min
    const progressMatch = msg.match(
      /\[PROGRESS\]\s*(\d+)\/(\d+)\s*\|\s*active:(\d+)\s*\|\s*last:[^\|]+\|\s*eta:([^\|]+)\|\s*rate:([^\s]+)\/min/
    );
    if (progressMatch) {
      return {
        current: parseInt(progressMatch[1], 10),
        total: parseInt(progressMatch[2], 10),
        activeWorkers: parseInt(progressMatch[3], 10),
        eta: progressMatch[4].trim(),
        throughput: progressMatch[5].trim(),
      };
    }

    // Fallback: legacy formats [n/total] or Progress: n/total
    const legacyMatch =
      msg.match(/\[(\d+)\/(\d+)\]/) || msg.match(/Progress:\s*(\d+)\/(\d+)/);
    if (legacyMatch) {
      return {
        current: parseInt(legacyMatch[1], 10),
        total: parseInt(legacyMatch[2], 10),
      };
    }
  }
  return null;
}

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

interface Job {
  id: string;
  type: "run" | "publish" | "record";
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  scenarioKey?: string | null;
  logs: Array<{ timestamp: string; message: string }>;
  metadata?: any;
  progress?: number;
}

interface JobMonitorContextValue {
  activeJobs: Job[];
  addJob: (job: Job) => void;
  refreshJobs: () => void;
  trackJob: (jobId: string, scenarioKey?: string) => void;
  isMinimized: boolean;
  setIsMinimized: (v: boolean) => void;
  completedJobForModal: Job | null;
  dismissCompletionModal: () => void;
  outputDir: string;
  platformUrl: string | null;
}

const JobMonitorContext = createContext<JobMonitorContextValue | null>(null);

export function useJobMonitor() {
  const ctx = useContext(JobMonitorContext);
  if (!ctx) {
    throw new Error("useJobMonitor must be used within JobMonitorProvider");
  }
  return ctx;
}

export function JobMonitorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [forcePoll, setForcePoll] = useState(0);

  // Fetch output directory and platform URL from config
  const [outputDir, setOutputDir] = useState(".reshot/output");
  const [platformUrl, setPlatformUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config?.assetDir) setOutputDir(data.config.assetDir);
        if (data.settings?.platformUrl) setPlatformUrl(data.settings.platformUrl);
      })
      .catch(() => {});
  }, []);

  // Track user-initiated jobs for completion modal
  const trackedJobIds = useRef<Set<string>>(new Set());
  const shownCompletionJobIds = useRef<Set<string>>(new Set());
  const [completedJobForModal, setCompletedJobForModal] = useState<Job | null>(
    null
  );

  const dismissCompletionModal = useCallback(() => {
    setCompletedJobForModal(null);
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=20");
      const data = await res.json();
      const allJobs = data.jobs || [];
      // Keep track of active + recently completed (last 5 seconds)
      const now = Date.now();
      const relevantJobs = allJobs.filter((j: Job) => {
        if (j.status === "running" || j.status === "pending") return true;
        // Show completed jobs for 10 seconds
        const completedAt = new Date(j.updatedAt).getTime();
        return now - completedAt < 10000;
      });
      setJobs(relevantJobs);
    } catch (err) {
      console.error("Failed to load jobs:", err);
    }
  }, []);

  // Track if we have any active jobs
  const hasActiveJobs = jobs.some(
    (j) => j.status === "running" || j.status === "pending"
  );

  // Only poll when there are active jobs or forcePoll is set
  useEffect(() => {
    loadJobs();
    if (forcePoll === 0 && !hasActiveJobs) return; // No polling when idle
    const interval = setInterval(loadJobs, 2000);
    return () => clearInterval(interval);
  }, [loadJobs, hasActiveJobs, forcePoll]);

  // Check for tracked job completion → show modal
  useEffect(() => {
    for (const job of jobs) {
      if (
        trackedJobIds.current.has(job.id) &&
        !shownCompletionJobIds.current.has(job.id)
      ) {
        if (job.status === "success") {
          shownCompletionJobIds.current.add(job.id);
          setCompletedJobForModal(job);
          break; // Show one at a time
        }
        if (job.status === "failed" && job.metadata?.authRequired) {
          shownCompletionJobIds.current.add(job.id);
          setCompletedJobForModal(job);
          break;
        }
      }
    }
  }, [jobs]);

  const addJob = useCallback((job: Job) => {
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    setIsMinimized(false); // Expand when new job added
  }, []);

  // Track a job by ID - will fetch and add it to monitored jobs
  const trackJob = useCallback(
    (jobId: string, _scenarioKey?: string) => {
      trackedJobIds.current.add(jobId);
      setIsMinimized(false); // Expand to show the job
      // Trigger forcePoll to start polling immediately
      setForcePoll((prev) => prev + 1);
      // Reset forcePoll after 10s (polling continues if there are active jobs)
      setTimeout(() => setForcePoll(0), 10000);
      // Immediately trigger a refresh to pick up the new job
      loadJobs();
    },
    [loadJobs]
  );

  return (
    <JobMonitorContext.Provider
      value={{
        activeJobs: jobs,
        addJob,
        refreshJobs: loadJobs,
        trackJob,
        isMinimized,
        setIsMinimized,
        completedJobForModal,
        dismissCompletionModal,
        outputDir,
        platformUrl,
      }}
    >
      {children}
    </JobMonitorContext.Provider>
  );
}

export function FloatingJobMonitor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const {
    activeJobs,
    isMinimized,
    setIsMinimized,
    trackJob,
    completedJobForModal,
    dismissCompletionModal,
    outputDir,
    platformUrl,
  } = useJobMonitor();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isPublishPreviewOpen, setIsPublishPreviewOpen] = useState(false);
  const [publishScenarioKeys, setPublishScenarioKeys] = useState<string[]>([]);
  
  // Auto-expand the first running job's logs so users see progress immediately
  // Track which job triggered auto-expand to avoid re-expanding after user collapses
  const [autoExpandedJobId, setAutoExpandedJobId] = useState<string | null>(null);
  
  useEffect(() => {
    const firstRunningJob = activeJobs.find(
      (j) => j.status === "running" || j.status === "pending"
    );
    
    // Only auto-expand if:
    // 1. There's a running job
    // 2. We haven't auto-expanded it yet
    // 3. User hasn't manually collapsed it (expandedJobId is null but autoExpandedJobId matches)
    if (firstRunningJob && firstRunningJob.id !== autoExpandedJobId) {
      setExpandedJobId(firstRunningJob.id);
      setAutoExpandedJobId(firstRunningJob.id);
    }
    
    // Reset auto-expand tracking when all jobs complete
    if (!firstRunningJob && autoExpandedJobId) {
      setAutoExpandedJobId(null);
    }
  }, [activeJobs, autoExpandedJobId]);

  // Don't show on jobs page itself
  if (location.pathname === "/jobs") {
    return null;
  }

  // Filter out dismissed jobs
  const visibleJobs = activeJobs.filter((j) => !dismissedIds.has(j.id));

  if (visibleJobs.length === 0) {
    return null;
  }

  const runningJobs = visibleJobs.filter(
    (j) => j.status === "running" || j.status === "pending"
  );
  const completedJobs = visibleJobs.filter(
    (j) =>
      j.status === "success" ||
      j.status === "failed" ||
      j.status === "cancelled"
  );

  const handleViewAssets = (job: Job) => {
    if (job.scenarioKey) {
      navigate(`/scenarios/${job.scenarioKey}?tab=assets`);
    } else {
      navigate("/assets");
    }
    setDismissedIds((prev) => new Set([...prev, job.id]));
  };

  const handleDismiss = (jobId: string) => {
    setDismissedIds((prev) => new Set([...prev, jobId]));
  };

  const getJobIcon = (type: string, status: string) => {
    if (status === "running" || status === "pending") {
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    }
    if (status === "success") {
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    }
    if (status === "failed") {
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    }
    switch (type) {
      case "run":
        return <Play className="h-3.5 w-3.5" />;
      case "publish":
        return <Upload className="h-3.5 w-3.5" />;
      default:
        return <Image className="h-3.5 w-3.5" />;
    }
  };

  const getJobTitle = (job: Job) => {
    const typeLabel =
      job.type === "run"
        ? "Capture"
        : job.type === "publish"
        ? "Publish"
        : "Record";
    if (job.scenarioKey) {
      return `${typeLabel}: ${job.scenarioKey}`;
    }
    return `${typeLabel} All`;
  };

  const getStatusBadge = (job: Job) => {
    switch (job.status) {
      case "running": {
        const progress = parseProgressFromLogs(job.logs);
        return (
          <Badge variant="info" className="text-[10px] px-1.5 py-0">
            {progress
              ? `${progress.current}/${progress.total}`
              : "Running"}
          </Badge>
        );
      }
      case "pending":
        return (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Queued
          </Badge>
        );
      case "success":
        return (
          <Badge variant="success" className="text-[10px] px-1.5 py-0">
            Done
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            Failed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Cancelled
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-testid="floating-job-monitor"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full"
    >
      {/* Minimized view */}
      {isMinimized && (
        <Card
          className="cursor-pointer hover:bg-accent transition-colors shadow-lg border-border"
          onClick={() => setIsMinimized(false)}
        >
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {runningJobs.length > 0 && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
              {runningJobs.length === 0 && completedJobs.length > 0 && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              <span className="text-sm font-medium">
                {runningJobs.length > 0
                  ? (() => {
                      const progress = parseProgressFromLogs(
                        runningJobs[0].logs
                      );
                      if (progress) {
                        const eta = progress.eta ? ` \u2014 ETA ${progress.eta}` : "";
                        return `Capturing ${progress.current}/${progress.total}${eta}`;
                      }
                      return `${runningJobs.length} job${
                        runningJobs.length > 1 ? "s" : ""
                      } running`;
                    })()
                  : `${completedJobs.length} completed`}
              </span>
            </div>
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Expanded view */}
      {!isMinimized && (
        <Card className="shadow-lg border-border overflow-hidden">
          <CardHeader className="py-2 px-3 border-b bg-muted/30 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-medium flex items-center gap-2">
              {runningJobs.length > 0 && (
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              )}
              Active Jobs ({visibleJobs.length})
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => navigate("/jobs")}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setIsMinimized(true)}
              >
                <Minimize2 className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-80 overflow-y-auto">
            <div className="divide-y divide-border">
              {visibleJobs.map((job) => (
                <div
                  key={job.id}
                  data-testid={`floating-job-${job.id}`}
                  className="p-2 hover:bg-accent/50 transition-colors"
                >
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() =>
                      setExpandedJobId(expandedJobId === job.id ? null : job.id)
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getJobIcon(job.type, job.status)}
                      <span className="text-xs font-medium truncate">
                        {getJobTitle(job)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {getStatusBadge(job)}
                      {expandedJobId === job.id ? (
                        <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Progress bar for running jobs - parsed from log output */}
                  {(job.status === "running" || job.status === "pending") &&
                    (() => {
                      const progress = parseProgressFromLogs(job.logs);
                      if (progress) {
                        const pct = Math.round(
                          (progress.current / progress.total) * 100
                        );
                        return (
                          <div className="mt-2 space-y-1">
                            <Progress value={pct} className="h-1" />
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>
                                {progress.current}/{progress.total} completed
                                {progress.activeWorkers && progress.activeWorkers > 1
                                  ? ` (${progress.activeWorkers} parallel)`
                                  : ""}
                              </span>
                              <span>{pct}%</span>
                            </div>
                            {(progress.eta || progress.throughput) && (
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                {progress.eta && <span>ETA: {progress.eta}</span>}
                                {progress.throughput && <span>{progress.throughput}/min</span>}
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (job.status === "running") {
                        return (
                          <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Processing...</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                  {/* Error message for failed jobs - always visible */}
                  {job.status === "failed" && job.metadata?.error && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-900">
                      <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                        {job.metadata.error}
                      </p>
                      {job.metadata?.authRequired && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs mt-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate("/connection");
                          }}
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          Reconnect
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Expanded log view */}
                  {expandedJobId === job.id && (
                    <div className="mt-2 space-y-2">
                      {/* Recent logs */}
                      <div className="bg-muted/50 rounded p-2 max-h-32 overflow-y-auto">
                        <div className="font-mono text-[10px] space-y-0.5">
                          {job.logs.slice(-8).map((log, i) => (
                            <div
                              key={i}
                              className="text-muted-foreground truncate"
                            >
                              <span className="text-muted-foreground/40 text-[9px]">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>{" "}
                              {stripAnsi(log.message)}
                            </div>
                          ))}
                          {job.logs.length === 0 && (
                            <div className="text-muted-foreground">
                              Waiting to start...
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {job.status === "success" && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewAssets(job);
                            }}
                          >
                            View Assets
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs ml-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss(job.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion Modal */}
      <Dialog
        open={!!completedJobForModal}
        onOpenChange={(open) => {
          if (!open) dismissCompletionModal();
        }}
      >
        <DialogContent>
          {completedJobForModal?.status === "failed" && completedJobForModal?.metadata?.authRequired ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  Authentication Required
                </DialogTitle>
                <DialogDescription>
                  {completedJobForModal.metadata.error || "Your API key has expired or is invalid. Please reconnect to publish."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={dismissCompletionModal}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    dismissCompletionModal();
                    navigate("/connection");
                  }}
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Reconnect
                </Button>
              </DialogFooter>
            </>
          ) : completedJobForModal?.type === "publish" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Publish Complete
                </DialogTitle>
                <DialogDescription>
                  {completedJobForModal?.scenarioKey
                    ? `Scenario "${completedJobForModal.scenarioKey}" published successfully.`
                    : "Successfully published to platform."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={dismissCompletionModal}>
                  Close
                </Button>
                {platformUrl && (
                  <Button
                    onClick={() => {
                      window.open(platformUrl, "_blank");
                      dismissCompletionModal();
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on Platform
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Capture Complete
                </DialogTitle>
                <DialogDescription>
                  {completedJobForModal?.scenarioKey
                    ? `Scenario "${completedJobForModal.scenarioKey}" finished successfully.`
                    : "All scenarios finished successfully."}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                  <FolderOpen className="h-4 w-4 flex-shrink-0" />
                  <span className="font-mono text-xs truncate">
                    {outputDir}/
                  </span>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={dismissCompletionModal}>
                  Close
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (completedJobForModal?.scenarioKey) {
                      navigate(
                        `/scenarios/${completedJobForModal.scenarioKey}?tab=assets`
                      );
                    } else {
                      navigate("/assets");
                    }
                    dismissCompletionModal();
                  }}
                >
                  Review Assets
                </Button>
                <Button
                  onClick={() => {
                    const keys = completedJobForModal?.scenarioKey
                      ? [completedJobForModal.scenarioKey]
                      : completedJobForModal?.metadata?.scenarioKeys || [];
                    setPublishScenarioKeys(keys);
                    dismissCompletionModal();
                    setIsPublishPreviewOpen(true);
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Publish to Platform
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Publish Preview Dialog */}
      <PublishPreview
        open={isPublishPreviewOpen}
        onOpenChange={setIsPublishPreviewOpen}
        scenarioKeys={
          publishScenarioKeys.length > 0 ? publishScenarioKeys : undefined
        }
        onConfirm={async (selectedGroups) => {
          try {
            const totalAssets = selectedGroups.reduce(
              (sum, g) => sum + g.assets.length,
              0
            );
            const res = await fetch("/api/jobs/publish", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                scenarioKeys: publishScenarioKeys,
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
              navigate("/connection");
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
    </div>
  );
}

export default FloatingJobMonitor;
