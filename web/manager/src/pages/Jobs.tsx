import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  Upload,
  Video,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  StopCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import AuthPrompt from "@/components/AuthPrompt";
import {
  parseProgressFromLogs,
  stripAnsi,
} from "@/components/FloatingJobMonitor";
import {
  buildRetryJobRequest,
  cancelJobEndpoint,
  jobDetailEndpoint,
  JOBS_LIST_ENDPOINT,
} from "@/lib/jobRequests";
import type { Job } from "@/lib/types";

export default function Jobs() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<"all" | "run" | "publish" | "record">(
    "all",
  );
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const previousLogCount = useRef(0);
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const [, setIsAuthenticated] = useState<boolean | null>(null);

  // Check auth status on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.settings?.isAuthenticated || false);
      })
      .catch(() => setIsAuthenticated(false));
  }, []);

  // Auto-scroll logs when new logs arrive
  useEffect(() => {
    if (selectedJob && logContainerRef.current && autoScroll) {
      const currentLogCount = selectedJob.logs.length;
      if (currentLogCount > previousLogCount.current) {
        logContainerRef.current.scrollTop =
          logContainerRef.current.scrollHeight;
      }
      previousLogCount.current = currentLogCount;
    }
  }, [selectedJob?.logs, autoScroll]);

  // Handle scroll to detect if user scrolled up
  const handleLogScroll = useCallback(() => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(JOBS_LIST_ENDPOINT);
      const data = await res.json();
      setJobs(data.jobs || []);
      setLoading(false);

      // Update selected job if it exists - always fetch fresh data
      if (selectedJob) {
        const updated = data.jobs.find((j: Job) => j.id === selectedJob.id);
        if (updated) {
          setSelectedJob(updated);
        }
      }
    } catch (err) {
      console.error("Failed to load jobs:", err);
      setLoading(false);
    }
  }, [selectedJob?.id]);

  useEffect(() => {
    loadJobs();
    // Only poll when there are running jobs
    const hasRunningJob = jobs.some(
      (j) => j.status === "running" || j.status === "pending",
    );
    if (!hasRunningJob) return; // No polling when idle

    const interval = setInterval(loadJobs, 2000);
    return () => clearInterval(interval);
  }, [loadJobs, jobs.some((j) => j.status === "running")]);

  // Force refresh when selecting a job
  const handleSelectJob = useCallback((job: Job) => {
    setSelectedJob(job);
    previousLogCount.current = 0;
    setAutoScroll(true);
    // Immediately fetch latest data for this job
    fetch(jobDetailEndpoint(job.id))
      .then((res) => res.json())
      .then((data) => {
        if (data.job) {
          setSelectedJob(data.job);
        }
      })
      .catch(() => {});
  }, []);

  // Handler when auth completes
  const handleAuthComplete = useCallback(() => {
    setIsAuthenticated(true);
    toast({
      title: "Connected",
      description:
        "Successfully connected to Reshot platform. You can now publish.",
      variant: "success",
    });
  }, [toast]);

  const handleCancelJob = async (jobId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Prevent card selection when clicking cancel
    }

    try {
      const res = await fetch(cancelJobEndpoint(jobId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Success",
          description: "Job cancelled",
          variant: "success",
        });
        loadJobs();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to cancel job",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to cancel job",
        variant: "destructive",
      });
    }
  };

  const handleRetryJob = async (job: Job, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    try {
      const retryRequest = buildRetryJobRequest(job);
      if (!retryRequest) {
        toast({
          title: "Error",
          description: `Unknown job type: ${job.type}`,
          variant: "destructive",
        });
        return;
      }

      const res = await fetch(retryRequest.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryRequest.body),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Retried",
          description: `New ${job.type} job created`,
          variant: "success",
        });
        // Select the new job if returned
        if (data.jobId || data.job?.id) {
          const newJobId = data.jobId || data.job.id;
          await loadJobs();
          setJobs((prev) => {
            const newJob = prev.find((j) => j.id === newJobId);
            if (newJob) setSelectedJob(newJob);
            return prev;
          });
        } else {
          await loadJobs();
        }
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to retry job",
          variant: "destructive",
        });
      }
    } catch (_err) {
      toast({
        title: "Error",
        description: "Failed to retry job",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case "success":
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-destructive" />;
      case "cancelled":
        return <StopCircle className="h-3 w-3 text-orange-500" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (job: Job) => {
    const variants = {
      pending: "secondary",
      running: "default",
      cancelled: "secondary",
      success: "default",
      failed: "destructive",
    } as const;

    let label: string = job.status;
    if (job.status === "running") {
      const progress = parseProgressFromLogs(job.logs);
      if (progress) {
        label = `${progress.current}/${progress.total}`;
      }
    }

    return (
      <Badge
        variant={variants[job.status as keyof typeof variants] || "secondary"}
        className="text-[10px] h-4 px-1.5"
      >
        {label}
      </Badge>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "run":
        return <Play className="h-3 w-3" />;
      case "publish":
        return <Upload className="h-3 w-3" />;
      case "record":
        return <Video className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const formatDuration = (start: string, end: string) => {
    if (!end) return "Running...";
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const filteredJobs =
    filter === "all" ? jobs : jobs.filter((j) => j.type === filter);

  if (loading && jobs.length === 0) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Loading jobs...</div>
      </div>
    );
  }

  return (
    <div data-testid="studio-jobs" data-loaded="true" className="p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Jobs</h1>
          <p className="text-xs text-muted-foreground mt-1 font-normal">
            Execution history and status
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={loadJobs}
          className="shadow-sm"
          title="Refresh"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(["all", "run", "publish", "record"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Jobs list */}
        <div className="lg:col-span-2 space-y-2">
          {filteredJobs.length === 0 ? (
            <Card className="dagster-card">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No jobs found</p>
              </CardContent>
            </Card>
          ) : (
            filteredJobs.map((job) => (
              <Card
                key={job.id}
                className={cn(
                  "dagster-card cursor-pointer group transition-all",
                  selectedJob?.id === job.id &&
                    "ring-2 ring-primary bg-primary/5",
                )}
                onClick={() => handleSelectJob(job)}
              >
                <CardHeader className="pb-2.5 px-4 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "p-1.5 rounded-md",
                          job.type === "run" && "bg-blue-500/10",
                          job.type === "publish" && "bg-green-500/10",
                          job.type === "record" && "bg-purple-500/10",
                        )}
                      >
                        {getTypeIcon(job.type)}
                      </div>
                      <div>
                        <CardTitle className="text-xs font-semibold">
                          {job.type.charAt(0).toUpperCase() + job.type.slice(1)}
                        </CardTitle>
                        {job.scenarioKey && (
                          <CardDescription className="text-[10px] font-mono mt-0.5 text-muted-foreground">
                            {job.scenarioKey}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.status === "running" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                          onClick={(e) => handleCancelJob(job.id, e)}
                        >
                          <StopCircle className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      )}
                      {(job.status === "failed" ||
                        job.status === "cancelled") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                          onClick={(e) => handleRetryJob(job, e)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      )}
                      {getStatusIcon(job.status)}
                      {getStatusBadge(job)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="font-mono">
                      {new Date(job.createdAt).toLocaleString()}
                    </span>
                    <span className="font-medium">
                      {formatDuration(
                        job.createdAt,
                        job.status === "running"
                          ? new Date().toISOString()
                          : job.updatedAt,
                      )}
                    </span>
                  </div>
                  {(job.status === "running" || job.status === "pending") &&
                    (() => {
                      const progress = parseProgressFromLogs(job.logs);
                      if (!progress) return null;
                      const pct = Math.round(
                        (progress.current / progress.total) * 100,
                      );
                      return (
                        <div className="mt-2 space-y-1">
                          <Progress value={pct} className="h-1.5" />
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {progress.current}/{progress.total} completed
                            </span>
                            <span>{pct}%</span>
                          </div>
                        </div>
                      );
                    })()}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Job detail */}
        {selectedJob && (
          <div className="space-y-2">
            <Card className="dagster-card">
              <CardHeader className="px-4 py-3 border-b border-border/50 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold">
                  Job Details
                </CardTitle>
                <div className="flex items-center gap-2">
                  {selectedJob.status === "running" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] text-orange-500 border-orange-500/30 hover:bg-orange-500/10"
                      onClick={() => handleCancelJob(selectedJob.id)}
                    >
                      <StopCircle className="h-3 w-3 mr-1" />
                      Cancel Job
                    </Button>
                  )}
                  {(selectedJob.status === "failed" ||
                    selectedJob.status === "cancelled") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                      onClick={() => handleRetryJob(selectedJob)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Retry Job
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-4 py-3">
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Type
                  </div>
                  <div className="text-xs font-semibold">
                    {selectedJob.type}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Status
                  </div>
                  <div className="mt-1">{getStatusBadge(selectedJob)}</div>
                </div>
                {(selectedJob.status === "running" ||
                  selectedJob.status === "pending") &&
                  (() => {
                    const progress = parseProgressFromLogs(selectedJob.logs);
                    if (!progress) return null;
                    const pct = Math.round(
                      (progress.current / progress.total) * 100,
                    );
                    return (
                      <div>
                        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                          Progress
                        </div>
                        <div className="space-y-1.5">
                          <Progress value={pct} className="h-2" />
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {progress.current}/{progress.total} completed
                            </span>
                            <span className="font-semibold">{pct}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                {selectedJob.scenarioKey && (
                  <div>
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Scenario
                    </div>
                    <Link
                      to={`/scenarios/${selectedJob.scenarioKey}`}
                      className="text-xs font-mono text-primary hover:underline font-medium"
                    >
                      {selectedJob.scenarioKey}
                    </Link>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Started
                  </div>
                  <div className="text-xs font-mono">
                    {new Date(selectedJob.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Duration
                  </div>
                  <div className="text-xs font-semibold">
                    {formatDuration(
                      selectedJob.createdAt,
                      selectedJob.status === "running"
                        ? new Date().toISOString()
                        : selectedJob.updatedAt,
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="dagster-card">
              <CardHeader className="px-4 py-3 border-b border-border/50 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xs font-semibold">Logs</CardTitle>
                  {selectedJob.status === "running" && (
                    <Badge
                      variant="outline"
                      className="text-[9px] h-4 animate-pulse"
                    >
                      <Loader2 className="h-2 w-2 mr-1 animate-spin" />
                      Live
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!autoScroll && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => {
                        setAutoScroll(true);
                        if (logContainerRef.current) {
                          logContainerRef.current.scrollTop =
                            logContainerRef.current.scrollHeight;
                        }
                      }}
                    >
                      Jump to bottom
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => {
                      fetch(jobDetailEndpoint(selectedJob.id))
                        .then((res) => res.json())
                        .then((data) => {
                          if (data.job) setSelectedJob(data.job);
                        });
                    }}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 py-3">
                <div
                  ref={logContainerRef}
                  onScroll={handleLogScroll}
                  className="bg-background/50 rounded-md p-3 font-mono text-[10px] max-h-80 overflow-y-auto border border-border/30"
                >
                  {selectedJob.logs.length === 0 ? (
                    <div className="text-muted-foreground text-center py-4">
                      {selectedJob.status === "running"
                        ? "Waiting for logs..."
                        : "No logs available"}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {selectedJob.logs.map((log, index) => {
                        const msg = stripAnsi(log.message);
                        // Detect diff-related messages
                        const isDiffWarning =
                          msg.includes("⚠ Diff Detected") ||
                          msg.includes("% changed");
                        const isDiffMatch = msg.includes("✔ No changes");
                        const isDiffSummary = msg.includes("Diff Summary:");
                        const isBaselineFetch =
                          msg.includes("📥 Fetching baselines") ||
                          msg.includes("baseline");
                        const isDiffComputing = msg.includes(
                          "🔍 Computing visual diffs",
                        );

                        let colorClass = "";
                        if (msg.includes("[error]")) {
                          colorClass = "text-destructive";
                        } else if (msg.includes("[stderr]")) {
                          colorClass = "text-orange-500";
                        } else if (isDiffWarning) {
                          colorClass = "text-amber-500 font-medium";
                        } else if (isDiffMatch) {
                          colorClass = "text-green-500";
                        } else if (
                          isDiffSummary ||
                          isDiffComputing ||
                          isBaselineFetch
                        ) {
                          colorClass = "text-cyan-500";
                        } else if (msg.includes("✔")) {
                          colorClass = "text-green-500";
                        }

                        return (
                          <div
                            key={index}
                            className="text-muted-foreground leading-relaxed"
                          >
                            <span className="text-muted-foreground/40 text-[9px]">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>{" "}
                            <span className={colorClass}>{msg}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Auth Prompt Dialog */}
      <AuthPrompt
        open={isAuthPromptOpen}
        onOpenChange={setIsAuthPromptOpen}
        onAuthenticated={handleAuthComplete}
      />
    </div>
  );
}
