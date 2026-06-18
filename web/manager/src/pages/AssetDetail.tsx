import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import AssetPreview from "@/components/AssetPreview";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FileText,
  AlertTriangle,
  Shield,
  Paintbrush,
} from "lucide-react";

interface Asset {
  path: string;
  relativePath: string;
  filename: string;
  size: number;
  mtime: string;
  url: string;
  captureKey?: string;
}

interface Step {
  action: string;
  selector?: string;
  key?: string;
  captureKey?: string;
  clip?: any;
  selectorPadding?: number;
  deviceScaleFactor?: number;
  path?: string;
}

interface Sentinel {
  filename: string;
  label: string;
  stepIndex: number;
  url: string;
  hasDiff?: boolean;
  diffPercent?: number;
}

interface SentinelsResponse {
  files: string[];
  sentinelsManifest: {
    sentinels: { filename: string; label: string; stepIndex: number }[];
  } | null;
  basePath: string;
}

export default function AssetDetail() {
  const { scenarioKey, variationSlug, captureKey } = useParams<{
    scenarioKey: string;
    variationSlug: string;
    captureKey: string;
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedStep, setLinkedStep] = useState<{
    step: Step;
    index: number;
  } | null>(null);
  const [editingCaptureKey, setEditingCaptureKey] = useState(false);
  const [newCaptureKey, setNewCaptureKey] = useState("");

  // Manifest metadata state (privacy/style)
  const [manifestMeta, setManifestMeta] = useState<{
    privacy?: { enabled: boolean; method?: string; selectorCount?: number };
    style?: {
      enabled: boolean;
      frame?: string;
      shadow?: string;
      padding?: number;
      borderRadius?: number;
      background?: string;
    };
  }>({});

  // Sentinel frame state
  const [sentinels, setSentinels] = useState<Sentinel[]>([]);
  const [selectedSentinel, setSelectedSentinel] = useState<Sentinel | null>(
    null,
  );

  useEffect(() => {
    if (!scenarioKey || !variationSlug || !captureKey) {
      setLoading(false);
      return;
    }

    // Fetch assets for this scenario/variation
    fetch(`/api/output/${scenarioKey}/${variationSlug}`)
      .then((res) => res.json())
      .then((data) => {
        const found = data.assets?.find(
          (a: Asset) =>
            a.filename.replace(/\.[^/.]+$/, "") === captureKey ||
            a.captureKey === captureKey,
        );
        if (found) {
          setAsset(found);
          setNewCaptureKey(found.captureKey || captureKey);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load asset:", err);
        setLoading(false);
      });
  }, [scenarioKey, variationSlug, captureKey]);

  useEffect(() => {
    // Find the step that references this asset
    if (!scenarioKey || !captureKey) return;

    fetch(`/api/config/scenarios/${scenarioKey}`)
      .then((res) => res.json())
      .then((data) => {
        const scenario = data.scenario;
        if (scenario?.steps) {
          const stepIndex = scenario.steps.findIndex(
            (step: Step) =>
              step.key === captureKey ||
              step.captureKey === captureKey ||
              step.path?.replace(/\.[^/.]+$/, "") === captureKey,
          );
          if (stepIndex !== -1) {
            setLinkedStep({
              step: scenario.steps[stepIndex],
              index: stepIndex,
            });
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load scenario:", err);
      });
  }, [scenarioKey, captureKey]);

  // Fetch sentinel frames for video bundles
  useEffect(() => {
    if (!scenarioKey || !variationSlug) return;

    fetch(`/api/output/${scenarioKey}/${variationSlug}/sentinels`)
      .then((res) => res.json())
      .then((data: SentinelsResponse) => {
        if (data.files && data.files.length > 0) {
          const sentinelList: Sentinel[] = data.files.map((filename, idx) => {
            // Try to get metadata from manifest
            const manifestEntry = data.sentinelsManifest?.sentinels?.find(
              (s) => s.filename === filename,
            );

            return {
              filename,
              label: manifestEntry?.label || `Step ${idx}`,
              stepIndex: manifestEntry?.stepIndex ?? idx,
              url: `${data.basePath}/${filename}`,
              hasDiff: false,
              diffPercent: undefined,
            };
          });
          setSentinels(sentinelList);
        }
      })
      .catch((err) => {
        console.error("Failed to load sentinels:", err);
      });
  }, [scenarioKey, variationSlug]);

  // Fetch manifest metadata (privacy/style) for this version
  useEffect(() => {
    if (!scenarioKey) return;

    fetch(`/api/output/${scenarioKey}/versions`)
      .then((res) => res.json())
      .then((data) => {
        const versions = data.versions || [];
        // Find the version that matches our variationSlug (timestamp)
        const version =
          versions.find((v: any) => v.timestamp === variationSlug) ||
          versions[0];
        if (version) {
          const meta: typeof manifestMeta = {};
          if (version.privacy) meta.privacy = version.privacy;
          if (version.style) meta.style = version.style;
          setManifestMeta(meta);
        }
      })
      .catch(() => {});
  }, [scenarioKey, variationSlug]);

  // Fetch diff manifest to mark sentinels with diffs
  useEffect(() => {
    if (!scenarioKey || !variationSlug || sentinels.length === 0) return;

    // We need to find the timestamp for this version
    fetch(`/api/output/${scenarioKey}/versions`)
      .then((res) => res.json())
      .then((data) => {
        const versions = data.versions || [];
        if (versions.length > 0) {
          const latestTimestamp = versions[0].timestamp;
          return fetch(
            `/api/output/${scenarioKey}/version/${latestTimestamp}/diff-manifest`,
          );
        }
        return null;
      })
      .then((res) => res?.json())
      .then((data) => {
        if (data?.manifest?.assets) {
          // Update sentinels with diff info
          setSentinels((prev) =>
            prev.map((sentinel) => {
              // Check if this sentinel has a diff entry
              const assetKey = `${variationSlug}/sentinels/${sentinel.filename.replace(
                ".png",
                "",
              )}`;
              const diffEntry = data.manifest.assets[assetKey];

              return {
                ...sentinel,
                hasDiff: diffEntry && !diffEntry.match,
                diffPercent: diffEntry?.diffPercent,
              };
            }),
          );
        }
      })
      .catch((err) => {
        console.error("Failed to load diff manifest:", err);
      });
  }, [scenarioKey, variationSlug, sentinels.length]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCopyPath = () => {
    if (asset?.path) {
      navigator.clipboard.writeText(asset.path);
      toast({
        title: "Copied",
        description: "File path copied to clipboard",
        variant: "success",
      });
    }
  };

  const handleSaveCaptureKey = async () => {
    // V2 Feature: Capture key editing API endpoint to be added
    toast({
      title: "Info",
      description: "Capture key editing will be available in a future release",
      variant: "default",
    });
    setEditingCaptureKey(false);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Loading asset...</div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Asset Not Found</CardTitle>
            <CardDescription>
              The requested asset could not be found.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/assets")} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Assets
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      data-testid="studio-asset-detail"
      data-loaded="true"
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/assets")}
            className="shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {asset.filename}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {scenarioKey} / {variationSlug}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPath}
            className="shadow-sm"
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Path
          </Button>
          <a
            href={asset.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Preview */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center min-h-[400px] bg-muted rounded-md">
                <AssetPreview
                  url={asset.url}
                  filename={asset.filename}
                  size="lg"
                />
              </div>
            </CardContent>
          </Card>

          {/* Sentinel Frames Strip - for video bundles */}
          {sentinels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Sentinel Frames
                  {sentinels.some((s) => s.hasDiff) && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Changes Detected
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Captured at each step during recording for visual comparison
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {sentinels.map((sentinel) => (
                    <button
                      key={sentinel.filename}
                      onClick={() =>
                        setSelectedSentinel(
                          selectedSentinel?.filename === sentinel.filename
                            ? null
                            : sentinel,
                        )
                      }
                      className={cn(
                        "flex-shrink-0 w-24 h-16 rounded border-2 overflow-hidden relative group",
                        sentinel.hasDiff
                          ? "border-red-500"
                          : "border-transparent",
                        selectedSentinel?.filename === sentinel.filename &&
                          "ring-2 ring-primary",
                      )}
                      title={sentinel.label}
                    >
                      <img
                        src={sentinel.url}
                        alt={sentinel.label}
                        className="w-full h-full object-cover"
                      />
                      {sentinel.hasDiff && (
                        <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-1 rounded-bl">
                          {sentinel.diffPercent?.toFixed(1)}%
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                        {sentinel.label}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Selected sentinel preview */}
                {selectedSentinel && (
                  <div className="mt-4 border rounded-lg p-4 bg-muted/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">
                        {selectedSentinel.label}
                      </div>
                      {selectedSentinel.hasDiff && (
                        <Badge variant="destructive">
                          {selectedSentinel.diffPercent?.toFixed(2)}% different
                        </Badge>
                      )}
                    </div>
                    <img
                      src={selectedSentinel.url}
                      alt={selectedSentinel.label}
                      className="w-full rounded border"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Capture Key
                </Label>
                {editingCaptureKey ? (
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={newCaptureKey}
                      onChange={(e) => setNewCaptureKey(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button size="sm" onClick={handleSaveCaptureKey}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingCaptureKey(false);
                        setNewCaptureKey(asset.captureKey || captureKey || "");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded flex-1">
                      {asset.captureKey || captureKey}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingCaptureKey(true)}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  File Size
                </Label>
                <div className="text-sm font-medium mt-1">
                  {formatFileSize(asset.size)}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Modified
                </Label>
                <div className="text-sm font-medium mt-1">
                  {new Date(asset.mtime).toLocaleString()}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  File Path
                </Label>
                <div className="text-xs font-mono bg-muted px-2 py-1 rounded mt-1 break-all">
                  {asset.relativePath}
                </div>
              </div>

              {linkedStep && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Linked Step
                  </Label>
                  <div className="mt-1">
                    <Link
                      to={`/scenarios/${scenarioKey}?step=${linkedStep.index}`}
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Step #{linkedStep.index + 1}: {linkedStep.step.action}
                    </Link>
                  </div>
                  {linkedStep.step.selector && (
                    <div className="text-xs font-mono bg-muted px-2 py-1 rounded mt-1">
                      {linkedStep.step.selector}
                    </div>
                  )}
                  {linkedStep.step.clip && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Clip: {JSON.stringify(linkedStep.step.clip)}
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">
                  Variation Context
                </Label>
                <div className="mt-1">
                  <Badge variant="secondary">{variationSlug}</Badge>
                </div>
              </div>

              {/* Privacy/Style Metadata */}
              {manifestMeta.privacy?.enabled && (
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Privacy Masking
                  </Label>
                  <div className="text-sm font-medium mt-1 capitalize">
                    {manifestMeta.privacy.method || "redact"}
                    {manifestMeta.privacy.selectorCount != null && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        ({manifestMeta.privacy.selectorCount} selector
                        {manifestMeta.privacy.selectorCount !== 1 ? "s" : ""})
                      </span>
                    )}
                  </div>
                </div>
              )}

              {manifestMeta.style?.enabled && (
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Paintbrush className="h-3 w-3" />
                    Style Processing
                  </Label>
                  <div className="text-sm font-medium mt-1">
                    {manifestMeta.style.frame !== "none" && (
                      <span className="capitalize">
                        {manifestMeta.style.frame} frame
                      </span>
                    )}
                    {manifestMeta.style.shadow !== "none" && (
                      <span>
                        {manifestMeta.style.frame !== "none" ? ", " : ""}
                        {manifestMeta.style.shadow} shadow
                      </span>
                    )}
                    {(!manifestMeta.style.frame ||
                      manifestMeta.style.frame === "none") &&
                      (!manifestMeta.style.shadow ||
                        manifestMeta.style.shadow === "none") && (
                        <span>Custom style applied</span>
                      )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {linkedStep && (
            <Card>
              <CardHeader>
                <CardTitle>Step Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Action:</span>{" "}
                  <Badge variant="outline">{linkedStep.step.action}</Badge>
                </div>
                {linkedStep.step.selectorPadding !== undefined && (
                  <div>
                    <span className="text-muted-foreground">
                      Selector Padding:
                    </span>{" "}
                    {linkedStep.step.selectorPadding}px
                  </div>
                )}
                {linkedStep.step.deviceScaleFactor !== undefined && (
                  <div>
                    <span className="text-muted-foreground">
                      Device Scale Factor:
                    </span>{" "}
                    {linkedStep.step.deviceScaleFactor}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
