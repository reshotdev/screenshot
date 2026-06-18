import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Globe,
  Shield,
  Palette,
  Zap,
} from "lucide-react";

interface InjectionConfig {
  method:
    | "localStorage"
    | "sessionStorage"
    | "cookie"
    | "urlParam"
    | "browser"
    | "script"
    | "header";
  key?: string;
  value?: string;
  name?: string;
  locale?: string;
  timezone?: string;
  code?: string;
  header?: string;
  param?: string;
  options?: Record<string, unknown>;
}

interface VariantOption {
  name: string;
  inject: InjectionConfig[];
  metadata?: Record<string, unknown>;
}

interface VariantDimension {
  label: string;
  description?: string;
  options: Record<string, VariantOption>;
}

interface VariantPreset {
  name: string;
  description?: string;
  values: Record<string, string>;
}

interface VariantsConfig {
  dimensions?: Record<string, VariantDimension>;
  presets?: Record<string, VariantPreset>;
}

interface VariantSelection {
  [dimensionKey: string]: string; // e.g., { locale: 'ko', role: 'admin' }
}

interface VariantEditorProps {
  variantsConfig: VariantsConfig;
  value: VariantSelection;
  preset?: string;
  onChange: (value: VariantSelection, preset?: string) => void;
}

const DIMENSION_ICONS: Record<string, React.ReactNode> = {
  locale: <Globe className="h-4 w-4" />,
  role: <Shield className="h-4 w-4" />,
  theme: <Palette className="h-4 w-4" />,
};

export default function VariantEditor({
  variantsConfig,
  value,
  preset,
  onChange,
}: VariantEditorProps) {
  const [mode, setMode] = useState<"preset" | "custom">(
    preset ? "preset" : "custom"
  );
  const [showDetails, setShowDetails] = useState(false);

  const dimensions = variantsConfig?.dimensions || {};
  const presets = variantsConfig?.presets || {};
  const dimensionKeys = Object.keys(dimensions);
  const presetKeys = Object.keys(presets);

  // Get effective values (either from preset or custom selection)
  // Ensure we always have a valid object, even if preset.values is undefined
  const effectiveValues: VariantSelection =
    mode === "preset" && preset && presets[preset]?.values
      ? presets[preset].values
      : value || {};

  // Calculate what injections will be applied
  const getInjectionSummary = () => {
    const summary: { method: string; details: string }[] = [];

    // Safety check: ensure effectiveValues is an object before iterating
    if (!effectiveValues || typeof effectiveValues !== "object") {
      return summary;
    }

    for (const [dimKey, optionKey] of Object.entries(effectiveValues)) {
      const option = dimensions[dimKey]?.options?.[optionKey];
      if (!option?.inject) continue;

      for (const inj of option.inject) {
        switch (inj.method) {
          case "localStorage":
            summary.push({
              method: "localStorage",
              details: `${inj.key} = "${inj.value}"`,
            });
            break;
          case "sessionStorage":
            summary.push({
              method: "sessionStorage",
              details: `${inj.key} = "${inj.value}"`,
            });
            break;
          case "cookie":
            summary.push({
              method: "cookie",
              details: `${inj.name} = "${inj.value}"`,
            });
            break;
          case "urlParam":
            summary.push({
              method: "URL param",
              details: `?${inj.param}=${inj.value}`,
            });
            break;
          case "browser":
            if (inj.locale)
              summary.push({
                method: "browser",
                details: `locale: ${inj.locale}`,
              });
            if (inj.timezone)
              summary.push({
                method: "browser",
                details: `timezone: ${inj.timezone}`,
              });
            break;
          case "header":
            summary.push({
              method: "HTTP header",
              details: `${inj.header}: ${inj.value}`,
            });
            break;
          case "script":
            summary.push({ method: "script", details: "Custom JS" });
            break;
        }
      }
    }

    return summary;
  };

  const handleDimensionChange = (dimensionKey: string, optionKey: string) => {
    const newValue = { ...value, [dimensionKey]: optionKey };
    // If changing individual dimension, switch to custom mode
    setMode("custom");
    onChange(newValue, undefined);
  };

  const handlePresetSelect = (presetKey: string) => {
    setMode("preset");
    // When selecting a preset, clear individual values and set preset
    onChange({}, presetKey);
  };

  const handleClearVariant = () => {
    setMode("custom");
    onChange({}, undefined);
  };

  // Check if any variants are selected
  const hasVariants = Object.keys(effectiveValues).length > 0 || preset;
  const injectionSummary = getInjectionSummary();

  if (dimensionKeys.length === 0 && presetKeys.length === 0) {
    return (
      <Card className="bg-gray-800/50 border-gray-700">
        <CardContent className="py-6 text-center text-gray-400">
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No variant dimensions configured.</p>
          <p className="text-xs mt-1">
            Add dimensions in reshot.config.json under variants.dimensions
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      {presetKeys.length > 0 && (
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as "preset" | "custom")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preset">
              <Zap className="h-3 w-3 mr-1" />
              Preset
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Layers className="h-3 w-3 mr-1" />
              Custom
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preset" className="mt-4">
            <div className="grid gap-2">
              {presetKeys.map((presetKey) => {
                const p = presets[presetKey];
                if (!p) return null;
                const isSelected = preset === presetKey;
                const presetValues = p.values || {};
                return (
                  <button
                    key={presetKey}
                    onClick={() => handlePresetSelect(presetKey)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? "bg-blue-500/20 border-blue-500"
                        : "bg-gray-800 border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    <div className="font-medium text-sm">
                      {p.name || presetKey}
                    </div>
                    {p.description && (
                      <div className="text-xs text-gray-400 mt-1">
                        {p.description}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(presetValues).map(([dimKey, optKey]) => (
                        <Badge
                          key={dimKey}
                          variant="secondary"
                          className="text-xs"
                        >
                          {dimensions[dimKey]?.label || dimKey}:{" "}
                          {dimensions[dimKey]?.options?.[optKey]?.name ||
                            optKey}
                        </Badge>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="mt-4">
            <DimensionSelectors
              dimensions={dimensions}
              values={value}
              onChange={handleDimensionChange}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* If no presets, just show dimension selectors */}
      {presetKeys.length === 0 && (
        <DimensionSelectors
          dimensions={dimensions}
          values={value}
          onChange={handleDimensionChange}
        />
      )}

      {/* Active variant summary */}
      {hasVariants && (
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Active Variant
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                  className="h-7 px-2"
                >
                  {showDetails ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {showDetails ? "Hide" : "Show"} Details
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearVariant}
                  className="h-7 px-2 text-gray-400 hover:text-white"
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>

          {showDetails && injectionSummary.length > 0 && (
            <CardContent className="py-3 px-4 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-2">
                Injections that will be applied:
              </div>
              <div className="space-y-1">
                {injectionSummary.map((inj, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {inj.method}
                    </Badge>
                    <code className="text-gray-300">{inj.details}</code>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

interface DimensionSelectorsProps {
  dimensions: Record<string, VariantDimension>;
  values: VariantSelection;
  onChange: (dimensionKey: string, optionKey: string) => void;
}

function DimensionSelectors({
  dimensions,
  values,
  onChange,
}: DimensionSelectorsProps) {
  // Safety check: ensure dimensions is a valid object
  if (!dimensions || typeof dimensions !== "object") {
    return null;
  }

  return (
    <div className="space-y-4">
      {Object.entries(dimensions).map(([dimKey, dimension]) => {
        // Skip dimensions without valid options
        if (!dimension?.options || typeof dimension.options !== "object") {
          return null;
        }

        return (
          <div key={dimKey}>
            <Label className="flex items-center gap-2 mb-2">
              {DIMENSION_ICONS[dimKey] || <Layers className="h-4 w-4" />}
              {dimension.label}
            </Label>
            {dimension.description && (
              <p className="text-xs text-gray-400 mb-2">
                {dimension.description}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                onClick={() => {
                  const newValues = { ...values };
                  delete newValues[dimKey];
                  // Create a synthetic event for the parent
                  onChange(dimKey, "");
                }}
                className={`p-2 rounded-md border text-sm transition-colors ${
                  !values[dimKey]
                    ? "bg-gray-700 border-gray-500"
                    : "bg-gray-800 border-gray-700 hover:border-gray-600"
                }`}
              >
                Default
              </button>
              {Object.entries(dimension.options).map(([optKey, option]) => (
                <button
                  key={optKey}
                  onClick={() => onChange(dimKey, optKey)}
                  className={`p-2 rounded-md border text-sm transition-colors ${
                    values[dimKey] === optKey
                      ? "bg-blue-500/20 border-blue-500"
                      : "bg-gray-800 border-gray-700 hover:border-gray-600"
                  }`}
                >
                  {option?.name || optKey}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
