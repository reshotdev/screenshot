import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
// Note: We use useSearchParams read-only to get initial tab from URL
// We don't call setSearchParams because it causes child component remounts
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useManualRefresh } from "@/lib/useConfigRefresh";
import { useJobMonitor } from "@/components/FloatingJobMonitor";
import StepEditDialog from "./StepEditDialog";
import ScenarioAssets from "./ScenarioAssets";
import WorkflowStatus from "@/components/WorkflowStatus";
import PublishPreview from "@/components/PublishPreview";
import VariantEditor from "@/components/VariantEditor";
import AuthPrompt from "@/components/AuthPrompt";
import WorkspaceBadge from "@/components/WorkspaceBadge";
import CropperDialog from "@/components/CropperDialog";
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  Edit,
  Copy,
  ChevronUp,
  ChevronDown,
  X,
  Play,
  Upload,
  Video,
  RefreshCw,
  Image,
  Film,
  Crop,
  Shield,
  Paintbrush,
} from "lucide-react";

// Storage key for tab preference
const STORAGE_KEY_TAB = "reshot-scenario-tab";

interface Scenario {
  name: string;
  key: string;
  url: string;
  steps: any[];
  contexts?: any;
  matrix?: any[][];
  metadata?: any;
  // New universal variant system
  variant?: Record<string, string>; // e.g., { locale: 'ko', role: 'admin' }
  variantPreset?: string; // Reference to a preset
  // Legacy support (will be migrated to variant)
  locale?: string;
  role?: string;
  output?: {
    format?: "step-by-step-images" | "summary-video";
    highlight?: {
      color?: string;
      style?: string;
    };
    subtitles?: {
      enabled?: boolean;
    };
    crop?: {
      enabled: boolean;
      region?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  };
  _local?: {
    description?: string;
    tags?: string[];
  };
}

// Universal variant configuration types
// Using 'any' for flexible config from server - VariantEditor handles validation
type VariantsConfig = Record<string, unknown>;

export default function ScenarioDetail() {
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams(); // Read-only, don't use setter
  const { trackJob } = useJobMonitor();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [variantsConfig, setVariantsConfig] = useState<VariantsConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Stable scenario key - prevents new string reference each render
  const scenarioKey = key ?? "";

  // Get active tab from URL or localStorage, default to "details"
  const getInitialTab = () => {
    const urlTab = searchParams.get("tab");
    if (urlTab && ["details", "steps", "assets"].includes(urlTab)) {
      return urlTab;
    }
    const savedTab = localStorage.getItem(STORAGE_KEY_TAB);
    if (savedTab && ["details", "steps", "assets"].includes(savedTab)) {
      return savedTab;
    }
    return "details";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [runFormat, setRunFormat] = useState<
    "step-by-step-images" | "summary-video"
  >("step-by-step-images");
  const [runVariant, setRunVariant] = useState<Record<string, string>>({});
  const [runAllVariants, setRunAllVariants] = useState(false);
  const [runDiff, setRunDiff] = useState<boolean | null>(null); // null = use config default
  const [diffingEnabled, setDiffingEnabled] = useState(true); // from config - default to true
  const [runNoPrivacy, setRunNoPrivacy] = useState<boolean | null>(null); // null = use config default
  const [runNoStyle, setRunNoStyle] = useState<boolean | null>(null); // null = use config default
  const [privacyEnabled, setPrivacyEnabled] = useState(false); // from config
  const [styleEnabled, setStyleEnabled] = useState(false); // from config
  const [assetMap, setAssetMap] = useState<Record<string, string>>({}); // captureKey -> url
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [assetCount, setAssetCount] = useState(0);
  const [isPublishPreviewOpen, setIsPublishPreviewOpen] = useState(false);
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  // Key to force ScenarioAssets to refresh when a job completes
  const [assetRefreshKey, setAssetRefreshKey] = useState(0);
  const { toast } = useToast();

  // Check auth status and load config on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.settings?.isAuthenticated || false);
      })
      .catch(() => setIsAuthenticated(false));

    // Load diffing config
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        // Default to true unless explicitly disabled
        setDiffingEnabled(data.config?.diffing?.enabled !== false);
      })
      .catch(() => {});

    // Load privacy/style config status
    fetch("/api/privacy")
      .then((res) => res.json())
      .then((data) => setPrivacyEnabled(data.enabled && (data.selectors?.length > 0)))
      .catch(() => {});
    fetch("/api/style")
      .then((res) => res.json())
      .then((data) => setStyleEnabled(data.enabled !== false))
      .catch(() => {});
  }, []);

  // Handler for tab changes - saves preference to localStorage only
  // NOTE: We intentionally don't use setSearchParams here because it causes
  // React Router to re-process routes and remount child components like ScenarioAssets
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    // Save preference to localStorage
    localStorage.setItem(STORAGE_KEY_TAB, tab);
  }, []);

  // Only sync tab from URL on initial mount (not on every searchParams change)
  // This prevents remounts when other search params change
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && ["details", "steps", "assets"].includes(urlTab)) {
      setActiveTab(urlTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount

  // Handler to open publish preview with auth check
  const handlePublishClick = useCallback(() => {
    if (isAuthenticated === false) {
      setIsAuthPromptOpen(true);
    } else {
      setIsPublishPreviewOpen(true);
    }
  }, [isAuthenticated]);

  // Handler when auth completes
  const handleAuthComplete = useCallback(() => {
    setIsAuthenticated(true);
    toast({
      title: "Connected",
      description:
        "Successfully connected to Reshot platform. You can now publish.",
      variant: "success",
    });
    // Open publish preview after auth
    setTimeout(() => setIsPublishPreviewOpen(true), 300);
  }, [toast]);

  const loadScenario = useCallback(() => {
    if (!key) return;
    setLoading(true);

    // Load scenario
    fetch(`/api/config/scenarios/${key}`)
      .then((res) => res.json())
      .then((data) => {
        setScenario(data.scenario);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load scenario:", err);
        setLoading(false);
      });

    // Load variant configuration from config
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        // Variants config is inside config object
        const variants = data.config?.variants || {};
        setVariantsConfig(variants);
        // Default to running all variants if dimensions are configured
        const dims = variants?.dimensions || {};
        if (Object.keys(dims).length > 0) {
          setRunAllVariants(true);
        }
      })
      .catch((err) => {
        console.error("Failed to load config:", err);
      });
  }, [key]);

  useEffect(() => {
    loadScenario();
  }, [loadScenario]);

  // Load assets for this scenario
  useEffect(() => {
    if (!key) return;

    fetch("/api/output")
      .then((res) => res.json())
      .then((data) => {
        const groups = data.groups || [];
        const scenarioGroups = groups.filter((g: any) => g.scenarioKey === key);

        // Build a map of captureKey -> asset URL and count assets
        const map: Record<string, string> = {};
        let totalAssets = 0;

        scenarioGroups.forEach((group: any) => {
          fetch(`/api/output/${group.scenarioKey}/${group.variationSlug}`)
            .then((res) => res.json())
            .then((assetData) => {
              assetData.assets?.forEach((asset: any) => {
                const captureKey = asset.filename.replace(/\.[^/.]+$/, "");
                if (!map[captureKey]) {
                  map[captureKey] = asset.url;
                  totalAssets++;
                }
              });
              setAssetMap({ ...map });
              setAssetCount(totalAssets);
            })
            .catch(() => {});
        });
      })
      .catch(() => {});
  }, [key]);

  // Trigger to force job polling after creating a new job
  const [forceJobPoll, setForceJobPoll] = useState(0);
  // Track previous active job IDs to detect completions
  const prevActiveJobIds = useRef<Set<string>>(new Set());

  // Load active jobs for this scenario
  useEffect(() => {
    const loadJobs = () => {
      fetch("/api/jobs?limit=10")
        .then((res) => res.json())
        .then((data) => {
          const jobs = data.jobs || [];
          const scenarioJobs = jobs.filter(
            (job: any) =>
              job.scenarioKey === key &&
              (job.status === "running" || job.status === "pending")
          );

          // Detect jobs that just completed (were in prev list but not in current)
          const currentIds = new Set<string>(
            scenarioJobs.map((j: any) => j.id as string)
          );
          const previousIds = prevActiveJobIds.current;

          for (const prevId of previousIds) {
            if (!currentIds.has(prevId)) {
              // A job that was active is no longer active - it completed
              // Check if it's a run or capture job (not publish - publish doesn't generate local assets)
              const completedJob = jobs.find((j: any) => j.id === prevId);
              if (
                completedJob &&
                (completedJob.type === "run" || completedJob.type === "capture")
              ) {
                // Trigger asset refresh
                setAssetRefreshKey((prev) => prev + 1);
                break; // Only need to refresh once even if multiple jobs completed
              }
            }
          }

          prevActiveJobIds.current = currentIds;
          setActiveJobs(scenarioJobs);
        })
        .catch(() => {});
    };

    loadJobs();
    // Poll whenever forceJobPoll is set OR there are active jobs
    // This ensures polling starts immediately when a job is created
    if (forceJobPoll === 0 && activeJobs.length === 0) return;
    const interval = setInterval(loadJobs, 2000);
    return () => clearInterval(interval);
  }, [key, activeJobs.length, forceJobPoll]);

  // Disabled auto-refresh to prevent unwanted page refreshes
  // useConfigRefresh(loadScenario, { enabled: true, interval: 10000 });

  const handleManualRefresh = useManualRefresh(loadScenario);

  const handleSave = async () => {
    if (!scenario || !key) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/config/scenarios/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenario),
      });

      if (res.ok) {
        toast({
          title: "Success",
          description: "Scenario saved successfully",
          variant: "success",
        });
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to save scenario",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to save scenario:", err);
      toast({
        title: "Error",
        description: "Failed to save scenario",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!key) return;

    try {
      const res = await fetch(`/api/config/scenarios/${key}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast({
          title: "Success",
          description: "Scenario deleted successfully",
          variant: "success",
        });
        navigate("/scenarios");
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to delete scenario",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to delete scenario:", err);
      toast({
        title: "Error",
        description: "Failed to delete scenario",
        variant: "destructive",
      });
    }
  };

  const handleAddStep = () => {
    setEditingStepIndex(null);
    setIsStepDialogOpen(true);
  };

  const handleEditStep = (index: number) => {
    setEditingStepIndex(index);
    setIsStepDialogOpen(true);
  };

  const handleDeleteStep = async (index: number) => {
    if (!key || !scenario || !scenario.steps) return;

    try {
      const res = await fetch(`/api/config/scenarios/${key}/steps/${index}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const updatedSteps = scenario.steps.filter((_, i) => i !== index);
        setScenario({ ...scenario, steps: updatedSteps });
        toast({
          title: "Success",
          description: "Step deleted successfully",
          variant: "success",
        });
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to delete step",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to delete step:", err);
      toast({
        title: "Error",
        description: "Failed to delete step",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateStep = async (index: number) => {
    if (!key || !scenario || !scenario.steps) return;

    const stepToDuplicate = scenario.steps[index];
    if (!stepToDuplicate) return;

    const newStep = { ...stepToDuplicate };

    try {
      const res = await fetch(`/api/config/scenarios/${key}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStep),
      });

      if (res.ok) {
        const updatedSteps = [...scenario.steps];
        updatedSteps.splice(index + 1, 0, newStep);
        setScenario({ ...scenario, steps: updatedSteps });
        toast({
          title: "Success",
          description: "Step duplicated successfully",
          variant: "success",
        });
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to duplicate step",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to duplicate step:", err);
      toast({
        title: "Error",
        description: "Failed to duplicate step",
        variant: "destructive",
      });
    }
  };

  const handleMoveStep = async (index: number, direction: "up" | "down") => {
    if (!key || !scenario || !scenario.steps) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= scenario.steps.length) return;

    const updatedSteps = [...scenario.steps];
    [updatedSteps[index], updatedSteps[newIndex]] = [
      updatedSteps[newIndex],
      updatedSteps[index],
    ];

    // Update order field if it exists
    updatedSteps.forEach((step, i) => {
      if (step.order !== undefined) {
        step.order = i;
      }
    });

    // Save the reordered steps
    try {
      const res = await fetch(`/api/config/scenarios/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: updatedSteps }),
      });

      if (res.ok) {
        setScenario({ ...scenario, steps: updatedSteps });
        toast({
          title: "Success",
          description: "Step reordered successfully",
          variant: "success",
        });
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to reorder step",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to reorder step:", err);
      toast({
        title: "Error",
        description: "Failed to reorder step",
        variant: "destructive",
      });
    }
  };

  const handleSaveStep = async (stepData: any) => {
    if (!key || !scenario) return;
    const steps = scenario.steps || [];

    try {
      if (editingStepIndex !== null) {
        // Update existing step
        const res = await fetch(
          `/api/config/scenarios/${key}/steps/${editingStepIndex}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(stepData),
          }
        );

        if (res.ok) {
          const updatedSteps = [...steps];
          updatedSteps[editingStepIndex] = stepData;
          setScenario({ ...scenario, steps: updatedSteps });
          toast({
            title: "Success",
            description: "Step updated successfully",
            variant: "success",
          });
          setIsStepDialogOpen(false);
        } else {
          const error = await res.json();
          toast({
            title: "Error",
            description: error.error || "Failed to update step",
            variant: "destructive",
          });
        }
      } else {
        // Add new step
        const res = await fetch(`/api/config/scenarios/${key}/steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stepData),
        });

        if (res.ok) {
          const updatedSteps = [...steps, stepData];
          setScenario({ ...scenario, steps: updatedSteps });
          toast({
            title: "Success",
            description: "Step added successfully",
            variant: "success",
          });
          setIsStepDialogOpen(false);
        } else {
          const error = await res.json();
          toast({
            title: "Error",
            description: error.error || "Failed to add step",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error("Failed to save step:", err);
      toast({
        title: "Error",
        description: "Failed to save step",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Loading scenario...</div>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Scenario Not Found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div
      data-testid="studio-scenario-detail"
      data-loaded="true"
      className="p-4 space-y-3"
    >
      {/* Compact Header Row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/scenarios")}
            className="h-7 w-7 flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold truncate">
                {scenario.name}
              </h1>
              {key && <WorkspaceBadge scenarioKey={key} />}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {scenario.key}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleManualRefresh}
            disabled={loading}
            className="h-7 w-7"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            data-testid="studio-run-trigger"
            onClick={() => {
              setRunVariant(scenario?.variant || {});
              setRunAllVariants(false);
              setIsRunDialogOpen(true);
            }}
          >
            <Play className="h-3 w-3 mr-1" />
            Run
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handlePublishClick}
          >
            <Upload className="h-3 w-3 mr-1" />
            Publish
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate(`/recorder?scenario=${key}`)}
          >
            <Video className="h-3 w-3 mr-1" />
            Record
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSave}
            disabled={saving}
            className="h-7 w-7"
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="h-7 w-7 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Compact Workflow Status */}
      <div className="flex items-center gap-4 flex-wrap">
        <WorkflowStatus
          scenarioKey={scenarioKey}
          scenarioName={scenario.name}
          stepCount={scenario.steps?.length || 0}
          assetCount={assetCount}
          hasAssets={assetCount > 0}
        />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-8">
          <TabsTrigger value="details" className="text-xs h-7">
            Details
          </TabsTrigger>
          <TabsTrigger value="steps" className="text-xs h-7">
            Steps ({scenario.steps?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="assets" className="text-xs h-7">
            Assets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-3">
          {/* Compact Details - Grid layout */}
          <div className="border rounded-lg bg-card p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="scenario-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="scenario-name"
                  value={scenario.name}
                  onChange={(e) =>
                    setScenario({ ...scenario, name: e.target.value })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="scenario-key" className="text-xs">
                  Key
                </Label>
                <Input
                  id="scenario-key"
                  value={scenario.key}
                  disabled
                  className="h-8 text-sm font-mono bg-muted"
                />
              </div>
              <div>
                <Label htmlFor="scenario-url" className="text-xs">
                  URL
                </Label>
                <Input
                  id="scenario-url"
                  value={scenario.url}
                  onChange={(e) =>
                    setScenario({ ...scenario, url: e.target.value })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Variants - Collapsible */}
            <details className="group">
              <summary className="text-xs font-medium cursor-pointer hover:text-primary">
                Capture Variants{" "}
                <span className="text-muted-foreground">
                  ({Object.keys(scenario.variant || {}).length} configured)
                </span>
              </summary>
              <div className="mt-2 pl-2 border-l-2 border-border">
                <VariantEditor
                  variantsConfig={variantsConfig}
                  value={scenario.variant || {}}
                  preset={scenario.variantPreset}
                  onChange={(newVariant, newPreset) => {
                    setScenario({
                      ...scenario,
                      variant:
                        Object.keys(newVariant).length > 0
                          ? newVariant
                          : undefined,
                      variantPreset: newPreset,
                      locale: undefined,
                      role: undefined,
                    });
                  }}
                />
              </div>
            </details>

            {/* Output Crop - Collapsible */}
            <details className="group">
              <summary className="text-xs font-medium cursor-pointer hover:text-primary flex items-center gap-1">
                <Crop className="h-3 w-3" />
                Output Crop{" "}
                <span className="text-muted-foreground">
                  ({scenario.output?.crop?.enabled ? "enabled" : "disabled"})
                </span>
              </summary>
              <div className="mt-2 pl-2 border-l-2 border-border space-y-2">
                <p className="text-xs text-muted-foreground">
                  Crop all captures to focus on a specific region of the screen.
                </p>
                {scenario.output?.crop?.enabled &&
                  scenario.output?.crop?.region && (
                    <div className="text-xs font-mono bg-muted px-2 py-1 rounded">
                      Region: {scenario.output.crop.region.x},{" "}
                      {scenario.output.crop.region.y} →{" "}
                      {scenario.output.crop.region.width}×
                      {scenario.output.crop.region.height}px
                    </div>
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setIsCropperOpen(true)}
                >
                  <Crop className="h-3 w-3 mr-1" />
                  {scenario.output?.crop?.enabled
                    ? "Edit Crop Region"
                    : "Configure Crop"}
                </Button>
                {scenario.output?.crop?.enabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => {
                      setScenario({
                        ...scenario,
                        output: {
                          ...scenario.output,
                          crop: undefined,
                        },
                      });
                    }}
                  >
                    Disable Crop
                  </Button>
                )}
              </div>
            </details>

            {/* Privacy Override - Collapsible */}
            <details className="group">
              <summary className="text-xs font-medium cursor-pointer hover:text-primary flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Privacy Override{" "}
                <span className="text-muted-foreground">
                  ({(scenario as any).privacy ? "overridden" : "inheriting global"})
                </span>
              </summary>
              <div className="mt-2 pl-2 border-l-2 border-border space-y-2">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!(scenario as any).privacy}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setScenario({ ...scenario, privacy: { enabled: true, method: "redact", selectors: [] } } as any);
                      } else {
                        const { privacy: _p, ...rest } = scenario as any;
                        setScenario(rest);
                      }
                    }}
                    className="rounded h-3.5 w-3.5"
                  />
                  Override global privacy config for this scenario
                </label>
                {(scenario as any).privacy && (
                  <div className="space-y-2 pt-1">
                    <div className="flex gap-1">
                      {(["redact", "blur", "hide", "remove"] as const).map((method) => (
                        <Button
                          key={method}
                          variant={(scenario as any).privacy?.method === method ? "default" : "outline"}
                          size="sm"
                          className="h-6 text-[10px] flex-1 capitalize"
                          onClick={() => setScenario({ ...scenario, privacy: { ...(scenario as any).privacy, method } } as any)}
                        >
                          {method}
                        </Button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Additional selectors for this scenario (additive with global)
                    </p>
                  </div>
                )}
              </div>
            </details>

            {/* Style Override - Collapsible */}
            <details className="group">
              <summary className="text-xs font-medium cursor-pointer hover:text-primary flex items-center gap-1">
                <Paintbrush className="h-3 w-3" />
                Style Override{" "}
                <span className="text-muted-foreground">
                  ({(scenario as any).style ? "overridden" : "inheriting global"})
                </span>
              </summary>
              <div className="mt-2 pl-2 border-l-2 border-border space-y-2">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!(scenario as any).style}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setScenario({ ...scenario, style: { frame: "none", shadow: "medium", padding: 40 } } as any);
                      } else {
                        const { style: _s, ...rest } = scenario as any;
                        setScenario(rest);
                      }
                    }}
                    className="rounded h-3.5 w-3.5"
                  />
                  Override global style config for this scenario
                </label>
                {(scenario as any).style && (
                  <div className="space-y-2 pt-1">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Frame</span>
                      <div className="flex gap-1">
                        {(["none", "macos", "windows"] as const).map((frame) => (
                          <Button
                            key={frame}
                            variant={(scenario as any).style?.frame === frame ? "default" : "outline"}
                            size="sm"
                            className="h-6 text-[10px] flex-1 capitalize"
                            onClick={() => setScenario({ ...scenario, style: { ...(scenario as any).style, frame } } as any)}
                          >
                            {frame === "none" ? "None" : frame === "macos" ? "macOS" : "Windows"}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Shadow</span>
                      <div className="flex gap-1">
                        {(["none", "small", "medium", "large"] as const).map((shadow) => (
                          <Button
                            key={shadow}
                            variant={(scenario as any).style?.shadow === shadow ? "default" : "outline"}
                            size="sm"
                            className="h-6 text-[10px] flex-1 capitalize"
                            onClick={() => setScenario({ ...scenario, style: { ...(scenario as any).style, shadow } } as any)}
                          >
                            {shadow}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </details>

            {/* Description & Tags - Inline */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="scenario-description" className="text-xs">
                  Description
                </Label>
                <Textarea
                  id="scenario-description"
                  value={scenario._local?.description || ""}
                  onChange={(e) =>
                    setScenario({
                      ...scenario,
                      _local: {
                        ...(scenario._local || {}),
                        description: e.target.value,
                      },
                    })
                  }
                  placeholder="Optional description"
                  rows={2}
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor="scenario-tags" className="text-xs">
                  Tags
                </Label>
                <Input
                  id="scenario-tags"
                  value={scenario._local?.tags?.join(", ") || ""}
                  onChange={(e) => {
                    const tags = e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean);
                    setScenario({
                      ...scenario,
                      _local: { ...(scenario._local || {}), tags },
                    });
                  }}
                  placeholder="tag1, tag2"
                  className="h-8 text-sm"
                />
                {scenario._local?.tags && scenario._local.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {scenario._local.tags.map((tag: string) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px] h-5"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="steps" className="space-y-2">
          {/* Compact header */}
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-muted-foreground">
              {scenario.steps?.length || 0} steps
            </span>
            <Button onClick={handleAddStep} size="sm" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>

          {/* Compact step list */}
          <div className="border rounded-md divide-y">
            {scenario.steps?.map((step, index) => {
              const captureKey = step.key || step.captureKey;
              const assetUrl = captureKey ? assetMap[captureKey] : null;
              const isCaptureStep =
                step.action === "screenshot" || step.action === "clip";

              return (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 hover:bg-accent/30 group"
                >
                  {/* Step number */}
                  <span className="text-[10px] text-muted-foreground w-4 shrink-0">
                    #{index + 1}
                  </span>

                  {/* Thumbnail */}
                  {isCaptureStep && assetUrl ? (
                    <div
                      className="w-12 h-8 shrink-0 rounded overflow-hidden bg-muted cursor-pointer"
                      onClick={() =>
                        navigate(`/assets/${key}/default/${captureKey}`)
                      }
                    >
                      <img
                        src={assetUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-8 shrink-0 rounded bg-muted/50 flex items-center justify-center">
                      <span className="text-[8px] text-muted-foreground">
                        —
                      </span>
                    </div>
                  )}

                  {/* Step info */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 shrink-0"
                    >
                      {step.action}
                    </Badge>
                    {step.key && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-5 shrink-0"
                      >
                        {step.key}
                      </Badge>
                    )}
                    {step.selector && (
                      <code className="text-[10px] text-muted-foreground truncate font-mono">
                        {step.selector}
                      </code>
                    )}
                    {step.url && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {step.url}
                      </span>
                    )}
                    {step.text && (
                      <span className="text-[10px] text-muted-foreground truncate italic">
                        "{step.text}"
                      </span>
                    )}
                    {isCaptureStep && !assetUrl && (
                      <span className="text-[10px] text-muted-foreground italic">
                        not generated
                      </span>
                    )}
                  </div>

                  {/* Actions - visible on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMoveStep(index, "up")}
                      disabled={index === 0}
                      title="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMoveStep(index, "down")}
                      disabled={index === (scenario.steps?.length || 0) - 1}
                      title="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleEditStep(index)}
                      title="Edit"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDuplicateStep(index)}
                      title="Duplicate"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteStep(index)}
                      title="Delete"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {(!scenario.steps || scenario.steps.length === 0) && (
              <div className="text-center text-muted-foreground py-6">
                <p className="text-sm">No steps yet.</p>
                <Button
                  onClick={handleAddStep}
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add First Step
                </Button>
              </div>
            )}
          </div>

          {/* Step Edit Dialog */}
          <StepEditDialog
            open={isStepDialogOpen}
            onOpenChange={setIsStepDialogOpen}
            step={
              editingStepIndex !== null
                ? scenario.steps[editingStepIndex]
                : null
            }
            onSave={handleSaveStep}
            assetUrl={
              editingStepIndex !== null && scenario.steps[editingStepIndex]
                ? assetMap[
                    scenario.steps[editingStepIndex].key ||
                      scenario.steps[editingStepIndex].captureKey ||
                      ""
                  ]
                : undefined
            }
          />

          {/* Delete Confirmation Dialog */}
          <Dialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Scenario</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this scenario? This action
                  cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setIsDeleteDialogOpen(false);
                    handleDelete();
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="assets" className="space-y-4" forceMount>
          <ScenarioAssets
            scenarioKey={scenarioKey}
            key={`assets-${assetRefreshKey}`}
          />
        </TabsContent>
      </Tabs>

      {/* Publish Preview Dialog */}
      <PublishPreview
        open={isPublishPreviewOpen}
        onOpenChange={setIsPublishPreviewOpen}
        scenarioKeys={key ? [key] : []}
        onConfirm={async (selectedGroups) => {
          try {
            // Build request body with selected assets
            const totalAssets = selectedGroups.reduce(
              (sum, g) => sum + g.assets.length,
              0
            );

            const res = await fetch("/api/jobs/publish", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                scenarioKeys: key ? [key] : [],
                selectedGroups, // Pass the filtered asset groups
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
              // Track job in FloatingJobMonitor to show panel immediately
              if (data.job?.id) {
                trackJob(data.job.id, key || undefined);
              }
              // Also trigger local polling
              setForceJobPoll((prev) => prev + 1);
              // Reset after a few seconds (polling will continue if there are active jobs)
              setTimeout(() => setForceJobPoll(0), 10000);
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

      {/* Auth Prompt Dialog */}
      <AuthPrompt
        open={isAuthPromptOpen}
        onOpenChange={setIsAuthPromptOpen}
        onAuthenticated={handleAuthComplete}
      />

      {/* Run Dialog - Granular Control */}
      <Dialog open={isRunDialogOpen} onOpenChange={setIsRunDialogOpen}>
        <DialogContent
          className="max-w-lg"
          data-testid="studio-run-dialog"
          aria-label="Run Scenario"
        >
          <DialogHeader>
            <DialogTitle>Run Scenario</DialogTitle>
            <DialogDescription>
              Choose output format and variant options
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-5">
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
                      (config default: on)
                    </span>
                  )}
                  {runDiff === null && !diffingEnabled && (
                    <span className="text-xs text-muted-foreground">
                      (config default: off)
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
              {(runDiff === true || (runDiff === null && diffingEnabled)) && (
                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md p-2">
                  Diff results will appear in the job log after completion
                </div>
              )}
            </div>

            {/* Privacy Masking Toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Privacy Masking</Label>
                  <p className="text-xs text-muted-foreground">
                    Hide sensitive elements during capture
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {runNoPrivacy === null && (
                    <span className="text-xs text-muted-foreground">
                      (config default: {privacyEnabled ? "on" : "off"})
                    </span>
                  )}
                  <input
                    type="checkbox"
                    checked={runNoPrivacy === null ? privacyEnabled : !runNoPrivacy}
                    onChange={(e) => setRunNoPrivacy(e.target.checked ? null : true)}
                    className="rounded h-4 w-4"
                  />
                </div>
              </div>
            </div>

            {/* Style Processing Toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Style Processing</Label>
                  <p className="text-xs text-muted-foreground">
                    Apply frames, shadows, and backgrounds
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {runNoStyle === null && (
                    <span className="text-xs text-muted-foreground">
                      (config default: {styleEnabled ? "on" : "off"})
                    </span>
                  )}
                  <input
                    type="checkbox"
                    checked={runNoStyle === null ? styleEnabled : !runNoStyle}
                    onChange={(e) => setRunNoStyle(e.target.checked ? null : true)}
                    className="rounded h-4 w-4"
                  />
                </div>
              </div>
            </div>

            {/* Output Crop Status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Output Crop</Label>
                  <p className="text-xs text-muted-foreground">
                    {scenario.output?.crop?.enabled
                      ? `Cropping to ${scenario.output.crop.region?.width}×${scenario.output.crop.region?.height}px`
                      : "No crop configured"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setIsRunDialogOpen(false);
                    setIsCropperOpen(true);
                  }}
                >
                  <Crop className="h-3 w-3 mr-1" />
                  {scenario.output?.crop?.enabled ? "Edit" : "Configure"}
                </Button>
              </div>
            </div>

            {/* Variant Selection */}
            {(() => {
              const dimensions = (variantsConfig as any)?.dimensions || {};
              const dimKeys = Object.keys(dimensions);

              if (dimKeys.length === 0) {
                return (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                    <p>
                      No variants configured. Will run with default settings.
                    </p>
                  </div>
                );
              }

              // Calculate total if running all
              let totalVariations = 1;
              dimKeys.forEach((dim) => {
                const options = Object.keys(dimensions[dim]?.options || {});
                totalVariations *= options.length || 1;
              });

              return (
                <div className="space-y-4">
                  {/* Prominent variant mode selector */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => setRunAllVariants(true)}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                          runAllVariants
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg">🎯</span>
                          <span>All {totalVariations} Variants</span>
                          <span
                            className={`text-xs ${
                              runAllVariants
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {dimKeys
                              .map((d) => dimensions[d]?.label || d)
                              .join(" × ")}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRunAllVariants(false)}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-all border-l ${
                          !runAllVariants
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg">☝️</span>
                          <span>Single Variant</span>
                          <span
                            className={`text-xs ${
                              !runAllVariants
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            Choose specific options
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {!runAllVariants && (
                    <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                      {dimKeys.map((dim: string) => {
                        const dimConfig = dimensions[dim];
                        const options = dimConfig?.options || {};
                        const optionKeys = Object.keys(options);

                        return (
                          <div key={dim} className="space-y-2">
                            <Label className="text-sm font-medium">
                              {dimConfig?.label || dim}
                            </Label>
                            <Select
                              value={runVariant[dim] || optionKeys[0] || ""}
                              onValueChange={(val) => {
                                setRunVariant((prev) => ({
                                  ...prev,
                                  [dim]: val,
                                }));
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue
                                  placeholder={`Select ${
                                    dimConfig?.label || dim
                                  }`}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {optionKeys.map((optKey) => {
                                  const opt = options[optKey];
                                  return (
                                    <SelectItem key={optKey} value={optKey}>
                                      {opt?.name || opt?.label || optKey}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {runAllVariants && (
                    <div className="text-sm bg-green-500/10 dark:bg-green-500/20 border border-green-500/30 rounded-md p-3">
                      <p className="font-medium text-green-700 dark:text-green-400 mb-2">
                        ✓ Will capture {totalVariations} variant
                        {totalVariations > 1 ? "s" : ""}:
                      </p>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {dimKeys.map((dim: string) => {
                          const options = Object.keys(
                            dimensions[dim]?.options || {}
                          );
                          return (
                            <div key={dim}>
                              <span className="font-mono">{dim}</span>:{" "}
                              {options.join(", ")}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRunDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="studio-run-confirm"
              onClick={async () => {
                const dimensions = (variantsConfig as any)?.dimensions || {};
                const dimKeys = Object.keys(dimensions);

                if (runAllVariants && dimKeys.length > 0) {
                  // Run all variations
                  const res = await fetch("/api/jobs/run-all-variations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      scenarioKey: key,
                      dimensions: dimKeys,
                      format: runFormat,
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    for (const job of data.jobs) {
                      trackJob(job.id, key);
                    }
                    // Close dialog - the floating job monitor will show progress
                    setIsRunDialogOpen(false);
                    // Trigger job polling immediately
                    setForceJobPoll((prev) => prev + 1);
                    setTimeout(() => setForceJobPoll(0), 10000);
                  } else {
                    const error = await res.json();
                    toast({
                      title: "Error",
                      description: error.error || "Failed to start jobs",
                      variant: "destructive",
                    });
                  }
                } else {
                  // Run single variant
                  const res = await fetch("/api/jobs/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      scenarioKeys: [key],
                      format: runFormat,
                      variant:
                        Object.keys(runVariant).length > 0
                          ? runVariant
                          : undefined,
                      diff: runDiff,
                      noPrivacy: runNoPrivacy === true ? true : undefined,
                      noStyle: runNoStyle === true ? true : undefined,
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    trackJob(data.job.id, key);
                    // Close dialog - the floating job monitor will show progress
                    setIsRunDialogOpen(false);
                    // Trigger job polling immediately
                    setForceJobPoll((prev) => prev + 1);
                    setTimeout(() => setForceJobPoll(0), 10000);
                  } else {
                    toast({
                      title: "Error",
                      description: "Failed to start job",
                      variant: "destructive",
                    });
                  }
                }
              }}
            >
              <Play className="h-4 w-4 mr-2" />
              {runAllVariants ? "Run All Variations" : "Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Dialog */}
      <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Visual</DialogTitle>
            <DialogDescription>
              Start a recording session for this scenario. The recorder will
              open in your terminal.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>This will start a recording job that:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Opens Chrome with remote debugging</li>
                <li>Connects to the active browser session</li>
                <li>Allows you to capture steps using keyboard shortcuts</li>
              </ul>
              <p className="mt-4 font-medium">Keyboard shortcuts:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">
                    C
                  </kbd>{" "}
                  - Capture screenshot/clip
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
                try {
                  const res = await fetch("/api/jobs/record", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: scenario?.name,
                      scenarioKey: key,
                    }),
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
                    // Trigger immediate polling
                    setForceJobPoll((prev) => prev + 1);
                    setTimeout(() => setForceJobPoll(0), 10000);
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

      {/* Visual Cropper Dialog */}
      <CropperDialog
        open={isCropperOpen}
        onOpenChange={setIsCropperOpen}
        imageUrl={Object.values(assetMap)[0] || null}
        currentCrop={scenario.output?.crop}
        scenarioName={scenario.name}
        onSave={(cropConfig) => {
          setScenario({
            ...scenario,
            output: {
              ...scenario.output,
              crop: cropConfig || undefined,
            },
          });
        }}
      />
    </div>
  );
}
