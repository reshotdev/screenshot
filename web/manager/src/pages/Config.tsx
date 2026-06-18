import { useEffect, useState, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { OptionCard } from "@/components/ui/option-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Settings,
  Globe,
  Users,
  Palette,
  Loader2,
  ChevronRight,
  X,
  GitCompare,
  Monitor,
  Smartphone,
  Tablet,
  FileOutput,
  Shield,
  Paintbrush,
} from "lucide-react";

function getSliderBackground(value: number, min: number, max: number): string {
  const pct = ((value - min) / (max - min)) * 100;
  return `linear-gradient(to right, hsl(262 83% 58%) ${pct}%, hsl(217 33% 17%) ${pct}%)`;
}

interface VariantOption {
  name: string;
  inject: Array<{
    method: string;
    key?: string;
    value?: string;
    locale?: string;
    timezone?: string;
  }>;
  metadata?: Record<string, unknown>;
}

interface VariantDimension {
  label: string;
  description: string;
  options: Record<string, VariantOption>;
}

interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

interface ViewportPreset {
  name: string;
  category: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  description?: string;
}

interface OutputConfig {
  template?: string;
  crop?: {
    enabled: boolean;
    region?: { x: number; y: number; width: number; height: number };
  };
}

interface DiffingConfig {
  enabled: boolean;
  threshold: number;
  includeAA: boolean;
}

interface PrivacyConfig {
  enabled: boolean;
  method: string;
  blurRadius: number;
  selectors: Array<string | { selector: string; method?: string; blurRadius?: number }>;
}

interface StyleConfig {
  enabled: boolean;
  frame: string;
  shadow: string;
  padding: number;
  background: string;
  borderRadius: number;
}

interface Config {
  baseUrl: string;
  assetDir: string;
  viewport: ViewportConfig;
  timeout: number;
  headless: boolean;
  concurrency: number;
  diffing?: DiffingConfig;
  output?: OutputConfig;
  viewportPresets?: Record<string, ViewportPreset>;
  variants: {
    dimensions: Record<string, VariantDimension>;
    presets?: Record<string, { name: string; values: Record<string, string> }>;
  };
  scenarios?: unknown[];
}

interface TemplateVariable {
  name: string;
  description: string;
}

// Common dimension templates
const DIMENSION_TEMPLATES = [
  {
    key: "locale",
    label: "Language",
    description: "Internationalization (i18n)",
    icon: Globe,
  },
  {
    key: "role",
    label: "User Role",
    description: "RBAC / Permissions",
    icon: Users,
  },
  {
    key: "theme",
    label: "Theme",
    description: "Light/Dark mode",
    icon: Palette,
  },
];

export default function Config() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState<string | null>(
    null
  );
  const [showAddDimensionDialog, setShowAddDimensionDialog] = useState(false);
  const [showAddOptionDialog, setShowAddOptionDialog] = useState(false);
  const [newDimensionKey, setNewDimensionKey] = useState("");
  const [newOptionKey, setNewOptionKey] = useState("");
  const [newOptionName, setNewOptionName] = useState("");

  // Viewport preset state (reserved for future viewport UI)
  const [viewportPresets, setViewportPresets] = useState<
    Record<string, ViewportPreset>
  >({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_selectedViewportPreset, _setSelectedViewportPreset] = useState<
    string | null
  >(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_showAddViewportDialog, _setShowAddViewportDialog] = useState(false);

  // Privacy config state
  const [privacyConfig, setPrivacyConfig] = useState<PrivacyConfig>({
    enabled: false,
    method: "redact",
    blurRadius: 8,
    selectors: [],
  });
  const [newSelector, setNewSelector] = useState("");
  const [privacySaving, setPrivacySaving] = useState(false);

  // Style config state
  const [styleConfig, setStyleConfig] = useState<StyleConfig>({
    enabled: false,
    frame: "none",
    shadow: "medium",
    padding: 40,
    background: "transparent",
    borderRadius: 0,
  });
  const [styleSaving, setStyleSaving] = useState(false);
  const [stylePreview, setStylePreview] = useState<string | null>(null);
  const [stylePreviewLoading, setStylePreviewLoading] = useState(false);

  // Output template state
  const [templatePresets, setTemplatePresets] = useState<
    Array<{ name: string; template: string; description: string }>
  >([]);
  const [templateVariables, setTemplateVariables] = useState<
    TemplateVariable[]
  >([]);
  const [outputTemplate, setOutputTemplate] = useState("");
  const [templateValidation, setTemplateValidation] = useState<{
    valid: boolean;
    error?: string;
    warning?: string;
  } | null>(null);

  const { toast } = useToast();

  const loadConfig = useCallback(async () => {
    try {
      // Load main config
      const res = await fetch("/api/config");
      const data = await res.json();
      setConfig(data.config);

      // Load viewport presets
      const viewportsRes = await fetch("/api/viewports");
      const viewportsData = await viewportsRes.json();
      setViewportPresets(viewportsData.all || {});

      // Load output template info
      const templateRes = await fetch("/api/output-template");
      const templateData = await templateRes.json();
      setTemplatePresets(templateData.presets || []);
      setTemplateVariables(templateData.availableVariables || []);
      setOutputTemplate(templateData.currentTemplate || "");

      // Load privacy config
      const privacyRes = await fetch("/api/privacy");
      const privacyData = await privacyRes.json();
      setPrivacyConfig(privacyData);

      // Load style config
      const styleRes = await fetch("/api/style");
      const styleData = await styleRes.json();
      setStyleConfig(styleData);
    } catch (err) {
      console.error("Failed to load config:", err);
      toast({
        title: "Error",
        description: "Failed to load configuration",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Validate output template when it changes
  const validateOutputTemplate = useCallback(async (template: string) => {
    if (!template) {
      setTemplateValidation(null);
      return;
    }
    try {
      const res = await fetch("/api/output-template/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const data = await res.json();
      setTemplateValidation(data);
    } catch (err) {
      setTemplateValidation({ valid: false, error: "Failed to validate" });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (outputTemplate) {
        validateOutputTemplate(outputTemplate);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [outputTemplate, validateOutputTemplate]);

  // Auto-updating style preview with debounce
  useEffect(() => {
    if (!styleConfig.enabled) return;
    const timer = setTimeout(async () => {
      setStylePreviewLoading(true);
      try {
        const res = await fetch("/api/style/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ style: styleConfig }),
        });
        const data = await res.json();
        if (res.ok && data.preview) {
          setStylePreview(data.preview);
        }
      } catch {
        // Silently fail — CSS fallback is already visible
      } finally {
        setStylePreviewLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [styleConfig]);

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      // Also save output template if changed
      if (outputTemplate && outputTemplate !== config.output?.template) {
        await fetch("/api/output-template", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: outputTemplate }),
        });
      }

      if (res.ok) {
        toast({
          title: "Saved",
          description: "Configuration updated successfully",
          variant: "success",
        });
      } else {
        throw new Error("Failed to save");
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (field: string, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const updateViewport = (width: number, height: number) => {
    if (!config) return;
    setConfig({ ...config, viewport: { width, height } });
  };

  const addDimension = (key: string, label: string, description: string) => {
    if (!config || !key.trim()) return;
    const sanitizedKey = key.toLowerCase().replace(/\s+/g, "-");
    const dimensions = config.variants?.dimensions || {};

    if (dimensions[sanitizedKey]) {
      toast({
        title: "Already exists",
        description: `Dimension "${sanitizedKey}" already exists`,
        variant: "destructive",
      });
      return;
    }

    setConfig({
      ...config,
      variants: {
        ...config.variants,
        dimensions: {
          ...dimensions,
          [sanitizedKey]: { label: label || key, description, options: {} },
        },
      },
    });
    setSelectedDimension(sanitizedKey);
    setShowAddDimensionDialog(false);
    setNewDimensionKey("");
  };

  const deleteDimension = (key: string) => {
    if (!config) return;
    const dimensions = { ...config.variants?.dimensions };
    delete dimensions[key];
    setConfig({
      ...config,
      variants: { ...config.variants, dimensions },
    });
    if (selectedDimension === key) {
      setSelectedDimension(Object.keys(dimensions)[0] || null);
    }
  };

  const addOption = (
    dimensionKey: string,
    optionKey: string,
    optionName: string
  ) => {
    if (!config || !optionKey.trim()) return;
    const sanitizedKey = optionKey.toLowerCase().replace(/\s+/g, "-");
    const dimensions = config.variants?.dimensions || {};
    const dimension = dimensions[dimensionKey];
    if (!dimension) return;

    if (dimension.options[sanitizedKey]) {
      toast({
        title: "Already exists",
        description: `Option "${sanitizedKey}" already exists`,
        variant: "destructive",
      });
      return;
    }

    setConfig({
      ...config,
      variants: {
        ...config.variants,
        dimensions: {
          ...dimensions,
          [dimensionKey]: {
            ...dimension,
            options: {
              ...dimension.options,
              [sanitizedKey]: { name: optionName || optionKey, inject: [] },
            },
          },
        },
      },
    });
    setShowAddOptionDialog(false);
    setNewOptionKey("");
    setNewOptionName("");
  };

  const deleteOption = (dimensionKey: string, optionKey: string) => {
    if (!config) return;
    const dimensions = config.variants?.dimensions || {};
    const dimension = dimensions[dimensionKey];
    if (!dimension) return;

    const newOptions = { ...dimension.options };
    delete newOptions[optionKey];

    setConfig({
      ...config,
      variants: {
        ...config.variants,
        dimensions: {
          ...dimensions,
          [dimensionKey]: { ...dimension, options: newOptions },
        },
      },
    });
  };

  const updateOptionInjection = (
    dimensionKey: string,
    optionKey: string,
    method: string,
    key: string,
    value: string
  ) => {
    if (!config) return;
    const dimensions = config.variants?.dimensions || {};
    const dimension = dimensions[dimensionKey];
    if (!dimension) return;

    const option = dimension.options[optionKey];
    if (!option) return;

    // Simple injection: one injection per option (for simplicity)
    const inject = key || value ? [{ method, key, value }] : [];

    setConfig({
      ...config,
      variants: {
        ...config.variants,
        dimensions: {
          ...dimensions,
          [dimensionKey]: {
            ...dimension,
            options: {
              ...dimension.options,
              [optionKey]: { ...option, inject },
            },
          },
        },
      },
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">No configuration found.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a reshot.config.json file to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dimensions = config.variants?.dimensions || {};
  const dimensionKeys = Object.keys(dimensions);
  const currentDimension = selectedDimension
    ? dimensions[selectedDimension]
    : null;

  return (
    <div
      data-testid="studio-config"
      data-loaded="true"
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between bg-card">
        <div>
          <h1 className="text-sm font-semibold">Configuration</h1>
          <p className="text-xs text-muted-foreground">reshot.config.json</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadConfig}
            className="h-7"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-7"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Quick Settings Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Base URL</Label>
            <Input
              value={config.baseUrl}
              onChange={(e) => updateConfig("baseUrl", e.target.value)}
              placeholder="http://localhost:3000"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Asset Directory
            </Label>
            <Input
              value={config.assetDir}
              onChange={(e) => updateConfig("assetDir", e.target.value)}
              placeholder=".reshot/output"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Viewport</Label>
            <div className="flex gap-1">
              <Button
                variant={config.viewport.width === 1280 ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs flex-1"
                onClick={() => updateViewport(1280, 720)}
              >
                720p
              </Button>
              <Button
                variant={config.viewport.width === 1920 ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs flex-1"
                onClick={() => updateViewport(1920, 1080)}
              >
                1080p
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Options</Label>
            <div className="flex items-center gap-3 h-8">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={config.headless}
                  onCheckedChange={(checked) => updateConfig("headless", !!checked)}
                />
                Headless
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">×</span>
                <Input
                  type="number"
                  value={config.concurrency}
                  onChange={(e) =>
                    updateConfig("concurrency", parseInt(e.target.value) || 1)
                  }
                  className="h-7 w-12 text-xs text-center"
                  min={1}
                  max={8}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Visual Diffing Section */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">Visual Diffing</CardTitle>
                  <CardDescription className="text-xs">
                    Compare generated assets against approved baselines
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {config.diffing?.enabled ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  checked={config.diffing?.enabled ?? false}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      diffing: {
                        enabled: checked,
                        threshold: config.diffing?.threshold ?? 0.1,
                        includeAA: config.diffing?.includeAA ?? false,
                      },
                    })
                  }
                />
              </div>
            </div>
          </CardHeader>
          {config.diffing?.enabled && (
            <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Sensitivity Threshold:{" "}
                    {((config.diffing?.threshold ?? 0.1) * 100).toFixed(0)}%
                  </Label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(config.diffing?.threshold ?? 0.1) * 100}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        diffing: {
                          ...config.diffing!,
                          threshold: parseInt(e.target.value) / 100,
                        },
                      })
                    }
                    className="slider-primary w-full"
                    style={{ background: getSliderBackground((config.diffing?.threshold ?? 0.1) * 100, 0, 100) }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower = more sensitive. 10% is recommended.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Options
                  </Label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={config.diffing?.includeAA ?? false}
                      onCheckedChange={(checked) =>
                        setConfig({
                          ...config,
                          diffing: {
                            ...config.diffing!,
                            includeAA: !!checked,
                          },
                        })
                      }
                    />
                    Include anti-aliasing in diff
                  </label>
                  <p className="text-xs text-muted-foreground">
                    When disabled, minor rendering differences are ignored.
                  </p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Privacy Masking Section */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">Privacy Masking</CardTitle>
                  <CardDescription className="text-xs">
                    Hide or redact sensitive elements before capture
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {privacyConfig.enabled ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  checked={privacyConfig.enabled}
                  onCheckedChange={(checked) =>
                    setPrivacyConfig({ ...privacyConfig, enabled: checked })
                  }
                />
              </div>
            </div>
          </CardHeader>
          {privacyConfig.enabled && (
            <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
              {/* Method Selection */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Default Method</Label>
                <div className="grid grid-cols-4 gap-2">
                  {/* Redact */}
                  <OptionCard
                    selected={privacyConfig.method === "redact"}
                    onClick={() => setPrivacyConfig({ ...privacyConfig, method: "redact" })}
                    label="Redact"
                  >
                    <div className="w-full flex flex-col gap-1.5 px-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Email</span>
                        <div className="w-14 h-2.5 bg-foreground rounded-sm" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Phone</span>
                        <div className="w-10 h-2.5 bg-foreground rounded-sm" />
                      </div>
                    </div>
                  </OptionCard>
                  {/* Blur */}
                  <OptionCard
                    selected={privacyConfig.method === "blur"}
                    onClick={() => setPrivacyConfig({ ...privacyConfig, method: "blur" })}
                    label="Blur"
                  >
                    <div className="w-full flex flex-col gap-1.5 px-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Email</span>
                        <span className="text-[9px] text-muted-foreground select-none" style={{ filter: "blur(3px)" }}>j@acme.co</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Phone</span>
                        <span className="text-[9px] text-muted-foreground select-none" style={{ filter: "blur(3px)" }}>555-0123</span>
                      </div>
                    </div>
                  </OptionCard>
                  {/* Hide */}
                  <OptionCard
                    selected={privacyConfig.method === "hide"}
                    onClick={() => setPrivacyConfig({ ...privacyConfig, method: "hide" })}
                    label="Hide"
                  >
                    <div className="w-full flex flex-col gap-1.5 px-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Email</span>
                        <div className="w-14 h-3 border border-dashed border-muted-foreground/30 rounded-sm" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Phone</span>
                        <div className="w-10 h-3 border border-dashed border-muted-foreground/30 rounded-sm" />
                      </div>
                    </div>
                  </OptionCard>
                  {/* Remove */}
                  <OptionCard
                    selected={privacyConfig.method === "remove"}
                    onClick={() => setPrivacyConfig({ ...privacyConfig, method: "remove" })}
                    label="Remove"
                  >
                    <div className="w-full flex flex-col gap-1.5 px-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Email</span>
                        <span className="text-[8px] italic text-muted-foreground/30">removed</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Phone</span>
                        <span className="text-[8px] italic text-muted-foreground/30">removed</span>
                      </div>
                    </div>
                  </OptionCard>
                </div>
              </div>

              {/* Blur Radius - only shown for blur method */}
              {privacyConfig.method === "blur" && (
                <div className="space-y-2">
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-center">
                    <span
                      className="text-sm text-muted-foreground font-mono select-none"
                      style={{ filter: `blur(${privacyConfig.blurRadius}px)` }}
                    >
                      john@acme.com
                    </span>
                  </div>
                  <Label className="text-xs text-muted-foreground">
                    Blur Radius: {privacyConfig.blurRadius}px
                  </Label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={privacyConfig.blurRadius}
                    onChange={(e) =>
                      setPrivacyConfig({ ...privacyConfig, blurRadius: parseInt(e.target.value) })
                    }
                    className="slider-primary w-full"
                    style={{ background: getSliderBackground(privacyConfig.blurRadius, 1, 100) }}
                  />
                </div>
              )}

              {/* Selectors List */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  CSS Selectors ({privacyConfig.selectors.length})
                </Label>
                {privacyConfig.selectors.length > 0 && (
                  <div className="space-y-1">
                    {privacyConfig.selectors.map((sel, i) => {
                      const selectorStr = typeof sel === "string" ? sel : sel.selector;
                      const overrideMethod = typeof sel === "object" ? sel.method : undefined;
                      return (
                        <div key={i} className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1">
                          <code className="text-xs font-mono flex-1 truncate">{selectorStr}</code>
                          {overrideMethod && (
                            <Badge variant="secondary" className="text-[10px]">{overrideMethod}</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const updated = [...privacyConfig.selectors];
                              updated.splice(i, 1);
                              setPrivacyConfig({ ...privacyConfig, selectors: updated });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newSelector}
                    onChange={(e) => setNewSelector(e.target.value)}
                    placeholder=".pii-email, [data-sensitive], .user-avatar"
                    className="h-7 text-xs font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newSelector.trim()) {
                        setPrivacyConfig({
                          ...privacyConfig,
                          selectors: [...privacyConfig.selectors, newSelector.trim()],
                        });
                        setNewSelector("");
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!newSelector.trim()}
                    onClick={() => {
                      if (newSelector.trim()) {
                        setPrivacyConfig({
                          ...privacyConfig,
                          selectors: [...privacyConfig.selectors, newSelector.trim()],
                        });
                        setNewSelector("");
                      }
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 border-t border-border/20">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={privacySaving}
                  onClick={async () => {
                    setPrivacySaving(true);
                    try {
                      const res = await fetch("/api/privacy", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(privacyConfig),
                      });
                      if (res.ok) {
                        toast({ title: "Saved", description: "Privacy configuration updated", variant: "success" });
                      } else {
                        const data = await res.json();
                        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "Error", description: "Failed to save privacy config", variant: "destructive" });
                    } finally {
                      setPrivacySaving(false);
                    }
                  }}
                >
                  {privacySaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  Save Privacy Config
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Style & Framing Section */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paintbrush className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">Style & Framing</CardTitle>
                  <CardDescription className="text-xs">
                    Add frames, shadows, and backgrounds to screenshots
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {styleConfig.enabled ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  checked={styleConfig.enabled}
                  onCheckedChange={(checked) =>
                    setStyleConfig({ ...styleConfig, enabled: checked })
                  }
                />
              </div>
            </div>
          </CardHeader>
          {styleConfig.enabled && (
            <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
              {/* Auto-updating Preview */}
              <div className="space-y-2 pt-3">
                {stylePreview ? (
                  <div className={`border rounded-md p-2 bg-muted/30 relative ${stylePreviewLoading ? "opacity-50" : ""}`}>
                    <img src={stylePreview} alt="Style preview" className="max-w-full h-auto rounded" />
                    {stylePreviewLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                ) : (
                  /* CSS-only fallback preview */
                  <div
                    className="rounded-lg border border-border/30 bg-gradient-to-b from-muted/20 to-muted/10 preview-grid-bg flex items-center justify-center relative p-6"
                    style={{ minHeight: 200 }}
                  >
                    <div
                      className="relative overflow-hidden transition-all duration-150"
                      style={{
                        background: styleConfig.background,
                        padding: `${Math.min(styleConfig.padding, 40) * 0.4}px`,
                        borderRadius: `${styleConfig.borderRadius * 0.5}px`,
                        boxShadow:
                          styleConfig.shadow === "small" ? "0 1px 2px rgba(0,0,0,0.3)" :
                          styleConfig.shadow === "medium" ? "0 4px 6px -1px rgba(0,0,0,0.3)" :
                          styleConfig.shadow === "large" ? "0 10px 25px -5px rgba(0,0,0,0.4)" :
                          "none",
                      }}
                    >
                      <div className="w-64 rounded overflow-hidden" style={{ borderRadius: `${Math.max(styleConfig.borderRadius * 0.3, 2)}px` }}>
                        {/* Window chrome */}
                        {styleConfig.frame === "macos" && (
                          <div className="bg-[#2a2a2a] px-2.5 py-1.5 flex items-center gap-1">
                            <span className="w-[7px] h-[7px] rounded-full bg-[#ff5f57] inline-block" />
                            <span className="w-[7px] h-[7px] rounded-full bg-[#febc2e] inline-block" />
                            <span className="w-[7px] h-[7px] rounded-full bg-[#28c840] inline-block" />
                          </div>
                        )}
                        {styleConfig.frame === "windows" && (
                          <div className="bg-[#2a2a2a] px-2 py-1 flex items-center justify-end">
                            <span className="text-[8px] text-muted-foreground flex gap-1.5">
                              <span>—</span><span>□</span><span>×</span>
                            </span>
                          </div>
                        )}
                        {/* Skeleton UI mock screenshot */}
                        <div className="bg-[#1e1e2e] p-2.5 space-y-2">
                          {/* Nav bar */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
                            <div className="flex-1" />
                            <div className="w-8 h-1.5 rounded bg-muted-foreground/15" />
                          </div>
                          {/* Content lines */}
                          <div className="space-y-1.5 pt-1">
                            <div className="w-3/4 h-1.5 rounded bg-muted-foreground/15" />
                            <div className="w-full h-1.5 rounded bg-muted-foreground/10" />
                            <div className="w-5/6 h-1.5 rounded bg-muted-foreground/10" />
                            <div className="w-2/3 h-1.5 rounded bg-muted-foreground/10" />
                          </div>
                        </div>
                      </div>
                    </div>
                    {stylePreviewLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Frame Selection — Mini window chrome previews */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Frame</Label>
                <div className="grid grid-cols-3 gap-2">
                  {/* None */}
                  <OptionCard
                    selected={styleConfig.frame === "none"}
                    onClick={() => setStyleConfig({ ...styleConfig, frame: "none" })}
                    label="None"
                  >
                    <div className="w-full h-10 rounded bg-gradient-to-br from-muted/60 to-muted/30" />
                  </OptionCard>
                  {/* macOS */}
                  <OptionCard
                    selected={styleConfig.frame === "macos"}
                    onClick={() => setStyleConfig({ ...styleConfig, frame: "macos" })}
                    label="macOS"
                  >
                    <div className="w-full rounded overflow-hidden">
                      <div className="bg-[#2a2a2a] px-1.5 py-1 flex items-center gap-[3px]">
                        <span className="w-[6px] h-[6px] rounded-full bg-[#ff5f57] inline-block" />
                        <span className="w-[6px] h-[6px] rounded-full bg-[#febc2e] inline-block" />
                        <span className="w-[6px] h-[6px] rounded-full bg-[#28c840] inline-block" />
                      </div>
                      <div className="h-6 bg-gradient-to-br from-muted/60 to-muted/30" />
                    </div>
                  </OptionCard>
                  {/* Windows */}
                  <OptionCard
                    selected={styleConfig.frame === "windows"}
                    onClick={() => setStyleConfig({ ...styleConfig, frame: "windows" })}
                    label="Windows"
                  >
                    <div className="w-full rounded overflow-hidden">
                      <div className="bg-[#2a2a2a] px-1.5 py-1 flex items-center justify-end">
                        <span className="text-[9px] text-muted-foreground flex gap-1">
                          <span>—</span><span>□</span><span>×</span>
                        </span>
                      </div>
                      <div className="h-6 bg-gradient-to-br from-muted/60 to-muted/30" />
                    </div>
                  </OptionCard>
                </div>
              </div>

              {/* Shadow Selection — Real shadow demo cards */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Shadow</Label>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { key: "none", label: "None", shadow: "shadow-none" },
                    { key: "small", label: "Small", shadow: "shadow-sm" },
                    { key: "medium", label: "Medium", shadow: "shadow-md" },
                    { key: "large", label: "Large", shadow: "shadow-xl" },
                  ] as const).map(({ key, label, shadow }) => (
                    <OptionCard
                      key={key}
                      selected={styleConfig.shadow === key}
                      onClick={() => setStyleConfig({ ...styleConfig, shadow: key })}
                      label={label}
                    >
                      <div className={`w-10 h-7 rounded bg-card border border-border/50 ${shadow}`} />
                    </OptionCard>
                  ))}
                </div>
              </div>

              {/* Padding & Border Radius — Range sliders */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Padding: {styleConfig.padding}px
                  </Label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={styleConfig.padding}
                    onChange={(e) => setStyleConfig({ ...styleConfig, padding: parseInt(e.target.value) || 0 })}
                    className="slider-primary w-full"
                    style={{ background: getSliderBackground(styleConfig.padding, 0, 200) }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Border Radius: {styleConfig.borderRadius}px
                  </Label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={styleConfig.borderRadius}
                    onChange={(e) => setStyleConfig({ ...styleConfig, borderRadius: parseInt(e.target.value) || 0 })}
                    className="slider-primary w-full"
                    style={{ background: getSliderBackground(styleConfig.borderRadius, 0, 50) }}
                  />
                </div>
              </div>

              {/* Background — Color swatches */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Background</Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    "transparent",
                    "#ffffff",
                    "#f5f5f5",
                    "#1a1a2e",
                    "#0f172a",
                    "linear-gradient(135deg, #667eea, #764ba2)",
                    "linear-gradient(135deg, #f093fb, #f5576c)",
                    "linear-gradient(135deg, #4facfe, #00f2fe)",
                  ].map((value) => (
                    <button
                      key={value}
                      onClick={() => setStyleConfig({ ...styleConfig, background: value })}
                      className={`w-8 h-8 rounded-md transition-all duration-150 cursor-pointer shrink-0 hover:scale-110 active:scale-100 ${
                        value === "transparent" ? "checkerboard" : ""
                      } ${
                        styleConfig.background === value
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "border border-border hover:border-primary/50"
                      }`}
                      style={value !== "transparent" ? { background: value } : undefined}
                      title={value}
                    />
                  ))}
                </div>
                <Input
                  value={styleConfig.background}
                  onChange={(e) => setStyleConfig({ ...styleConfig, background: e.target.value })}
                  placeholder="transparent, #hex, or linear-gradient(...)"
                  className="h-7 text-xs font-mono"
                />
              </div>

              {/* Save Button */}
              <div className="pt-2 border-t border-border/20">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={styleSaving}
                  onClick={async () => {
                    setStyleSaving(true);
                    try {
                      const res = await fetch("/api/style", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(styleConfig),
                      });
                      if (res.ok) {
                        toast({ title: "Saved", description: "Style configuration updated", variant: "success" });
                      } else {
                        const data = await res.json();
                        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "Error", description: "Failed to save style config", variant: "destructive" });
                    } finally {
                      setStyleSaving(false);
                    }
                  }}
                >
                  {styleSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  Save Style Config
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Viewport Presets Section */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">Viewport Presets</CardTitle>
                  <CardDescription className="text-xs">
                    Device sizes for responsive screenshots
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4 px-4 border-t">
            <div className="space-y-4">
              {/* Quick Preset Selection */}
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(viewportPresets)
                  .filter(([_, preset]) =>
                    ["desktop", "tablet", "mobile"].includes(preset.category)
                  )
                  .slice(0, 8)
                  .map(([key, preset]) => {
                    const isSelected =
                      config.viewport.width === preset.width &&
                      config.viewport.height === preset.height;
                    const CategoryIcon =
                      preset.category === "mobile"
                        ? Smartphone
                        : preset.category === "tablet"
                        ? Tablet
                        : Monitor;

                    return (
                      <Button
                        key={key}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="h-auto py-2 px-3 flex flex-col items-start"
                        onClick={() =>
                          updateViewport(preset.width, preset.height)
                        }
                      >
                        <div className="flex items-center gap-1.5 w-full">
                          <CategoryIcon className="h-3 w-3" />
                          <span className="text-xs font-medium truncate">
                            {preset.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          {preset.width}×{preset.height}
                        </span>
                      </Button>
                    );
                  })}
              </div>

              {/* Custom Viewport Input */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Custom:
                </Label>
                <Input
                  type="number"
                  value={config.viewport.width}
                  onChange={(e) =>
                    updateViewport(
                      parseInt(e.target.value) || 1280,
                      config.viewport.height
                    )
                  }
                  className="h-7 w-20 text-xs"
                  placeholder="Width"
                />
                <span className="text-xs text-muted-foreground">×</span>
                <Input
                  type="number"
                  value={config.viewport.height}
                  onChange={(e) =>
                    updateViewport(
                      config.viewport.width,
                      parseInt(e.target.value) || 720
                    )
                  }
                  className="h-7 w-20 text-xs"
                  placeholder="Height"
                />
                <div className="flex-1" />
                <Label className="text-xs text-muted-foreground">Scale:</Label>
                <select
                  value={config.viewport.deviceScaleFactor || 2}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      viewport: {
                        ...config.viewport,
                        deviceScaleFactor: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="h-7 px-2 text-xs border rounded bg-background"
                >
                  <option value="1">1x</option>
                  <option value="2">2x (Retina)</option>
                  <option value="3">3x</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Output Path Templating Section */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileOutput className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">
                    Output Path Template
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Customize where captured assets are saved
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4 px-4 border-t space-y-4">
            {/* Template Presets */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Quick Presets
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {templatePresets.slice(0, 6).map((preset) => (
                  <Button
                    key={preset.name}
                    variant={
                      outputTemplate === preset.template ? "default" : "outline"
                    }
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => setOutputTemplate(preset.template)}
                    title={preset.description}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Template Input */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Custom Template
              </Label>
              <div className="relative">
                <Input
                  value={outputTemplate}
                  onChange={(e) => setOutputTemplate(e.target.value)}
                  placeholder="./docs/assets/{{locale}}/{{scenario}}/{{name}}.{{ext}}"
                  className={`h-8 text-sm font-mono pr-8 ${
                    templateValidation?.valid === false ? "border-red-500" : ""
                  }`}
                />
                {templateValidation && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {templateValidation.valid ? (
                      <span className="text-green-500 text-xs">✓</span>
                    ) : (
                      <span className="text-red-500 text-xs">✗</span>
                    )}
                  </div>
                )}
              </div>
              {templateValidation?.error && (
                <p className="text-xs text-red-500">
                  {templateValidation.error}
                </p>
              )}
              {templateValidation?.warning && (
                <p className="text-xs text-yellow-600">
                  {templateValidation.warning}
                </p>
              )}
            </div>

            {/* Available Variables */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Available Variables
              </Label>
              <div className="flex flex-wrap gap-1">
                {templateVariables.slice(0, 12).map((variable) => (
                  <Badge
                    key={variable.name}
                    variant="secondary"
                    className="text-[10px] cursor-pointer hover:bg-accent"
                    onClick={() =>
                      setOutputTemplate((prev) => prev + `{{${variable.name}}}`)
                    }
                    title={variable.description}
                  >
                    {`{{${variable.name}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Click a variable to insert it into the template
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Variants Section */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Variants</CardTitle>
                <CardDescription className="text-xs">
                  Configure locales, roles, themes
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowAddDimensionDialog(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {dimensionKeys.length === 0 ? (
              <div className="py-8 text-center border-t">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">
                  No variants configured
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add locale, role, or theme dimensions
                </p>
              </div>
            ) : (
              <div className="flex border-t">
                {/* Dimension List (Left) */}
                <div className="w-48 border-r shrink-0">
                  {dimensionKeys.map((key) => {
                    const dim = dimensions[key];
                    const IconComponent =
                      key === "locale"
                        ? Globe
                        : key === "role"
                        ? Users
                        : key === "theme"
                        ? Palette
                        : Settings;
                    const optionCount = Object.keys(dim.options).length;

                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDimension(key)}
                        className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-accent/50 transition-colors ${
                          selectedDimension === key ? "bg-accent" : ""
                        }`}
                      >
                        <IconComponent className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {dim.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {optionCount} option{optionCount !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                      </button>
                    );
                  })}
                </div>

                {/* Dimension Detail (Right) */}
                <div className="flex-1 min-w-0">
                  {currentDimension && selectedDimension ? (
                    <div>
                      {/* Dimension Header */}
                      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">
                            {currentDimension.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {currentDimension.description || "No description"}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setShowAddOptionDialog(true)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Option
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => deleteDimension(selectedDimension)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Options List */}
                      <div className="divide-y">
                        {Object.keys(currentDimension.options).length === 0 ? (
                          <div className="py-6 text-center text-muted-foreground text-sm">
                            No options yet. Add one to get started.
                          </div>
                        ) : (
                          Object.entries(currentDimension.options).map(
                            ([optKey, option]) => {
                              const injection = option.inject?.[0] || {
                                method: "localStorage",
                                key: "",
                                value: "",
                              };

                              return (
                                <div key={optKey} className="px-4 py-3">
                                  <div className="flex items-start gap-3">
                                    <div className="shrink-0 pt-0.5">
                                      <Badge
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        {optKey}
                                      </Badge>
                                    </div>
                                    <div className="flex-1 space-y-2 min-w-0">
                                      <div className="text-sm font-medium">
                                        {option.name}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <select
                                          value={injection.method}
                                          onChange={(e) =>
                                            updateOptionInjection(
                                              selectedDimension,
                                              optKey,
                                              e.target.value,
                                              injection.key || "",
                                              injection.value || ""
                                            )
                                          }
                                          className="h-7 text-xs rounded border bg-background px-2"
                                        >
                                          <option value="localStorage">
                                            localStorage
                                          </option>
                                          <option value="cookie">cookie</option>
                                          <option value="urlParam">
                                            URL param
                                          </option>
                                          <option value="browser">
                                            browser
                                          </option>
                                          <option value="header">header</option>
                                        </select>
                                        <Input
                                          value={injection.key || ""}
                                          onChange={(e) =>
                                            updateOptionInjection(
                                              selectedDimension,
                                              optKey,
                                              injection.method,
                                              e.target.value,
                                              injection.value || ""
                                            )
                                          }
                                          placeholder="key"
                                          className="h-7 text-xs w-24"
                                        />
                                        <Input
                                          value={injection.value || ""}
                                          onChange={(e) =>
                                            updateOptionInjection(
                                              selectedDimension,
                                              optKey,
                                              injection.method,
                                              injection.key || "",
                                              e.target.value
                                            )
                                          }
                                          placeholder="value"
                                          className="h-7 text-xs flex-1"
                                        />
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                                      onClick={() =>
                                        deleteOption(selectedDimension, optKey)
                                      }
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            }
                          )
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      Select a dimension to edit
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Dimension Dialog */}
      <Dialog
        open={showAddDimensionDialog}
        onOpenChange={setShowAddDimensionDialog}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Variant Dimension</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Quick templates */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Add</Label>
              <div className="grid grid-cols-3 gap-2">
                {DIMENSION_TEMPLATES.map((template) => {
                  const exists = dimensions[template.key];
                  const Icon = template.icon;
                  return (
                    <Button
                      key={template.key}
                      variant="outline"
                      size="sm"
                      disabled={!!exists}
                      onClick={() =>
                        addDimension(
                          template.key,
                          template.label,
                          template.description
                        )
                      }
                      className="h-auto py-2 flex-col gap-1"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs">{template.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or custom
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Custom Dimension Key</Label>
              <Input
                value={newDimensionKey}
                onChange={(e) => setNewDimensionKey(e.target.value)}
                placeholder="e.g., viewport, env, feature"
                className="h-8"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddDimensionDialog(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => addDimension(newDimensionKey, newDimensionKey, "")}
              disabled={!newDimensionKey.trim()}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Option Dialog */}
      <Dialog open={showAddOptionDialog} onOpenChange={setShowAddOptionDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Option</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Option Key</Label>
              <Input
                value={newOptionKey}
                onChange={(e) => setNewOptionKey(e.target.value)}
                placeholder={
                  selectedDimension === "locale"
                    ? "e.g., en, ko, ja"
                    : selectedDimension === "role"
                    ? "e.g., admin, user"
                    : "e.g., light, dark"
                }
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Display Name</Label>
              <Input
                value={newOptionName}
                onChange={(e) => setNewOptionName(e.target.value)}
                placeholder={
                  selectedDimension === "locale"
                    ? "e.g., English, 한국어"
                    : selectedDimension === "role"
                    ? "e.g., Administrator"
                    : "e.g., Light Mode"
                }
                className="h-8"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddDimensionDialog(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                selectedDimension &&
                addOption(selectedDimension, newOptionKey, newOptionName)
              }
              disabled={!newOptionKey.trim()}
            >
              Add Option
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
