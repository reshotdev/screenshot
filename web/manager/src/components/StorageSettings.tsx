import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cloud,
  Server,
  HardDrive,
  Lock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Copy,
} from "lucide-react";

interface StorageConfig {
  type: "reshot" | "s3" | "r2" | "local";
  bucket?: string;
  region?: string;
  pathPrefix?: string;
  endpoint?: string;
  accountId?: string;
  publicDomain?: string;
  outputDir?: string;
}

interface StorageSettingsProps {
  config: StorageConfig | null;
  onSave: (config: StorageConfig) => Promise<void>;
  isAuthenticated: boolean;
}

const STORAGE_TYPES = [
  {
    value: "reshot",
    label: "Reshot Platform",
    description:
      "Full governance with review queue, version control, and unbreakable URLs",
    icon: Cloud,
    requiresAuth: true,
  },
  {
    value: "s3",
    label: "AWS S3",
    description: "Store assets in your own AWS S3 bucket",
    icon: Server,
    requiresAuth: false,
  },
  {
    value: "r2",
    label: "Cloudflare R2",
    description: "Store assets in your own Cloudflare R2 bucket",
    icon: Server,
    requiresAuth: false,
  },
  {
    value: "local",
    label: "Local Storage",
    description: "Save assets to local filesystem for self-hosting",
    icon: HardDrive,
    requiresAuth: false,
  },
];

const ENV_REQUIREMENTS: Record<
  string,
  { envVars: string[]; optional?: string[] }
> = {
  s3: {
    envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    optional: ["AWS_REGION"],
  },
  r2: {
    envVars: ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
    optional: ["CLOUDFLARE_ACCOUNT_ID"],
  },
  local: {
    envVars: [],
  },
  reshot: {
    envVars: ["RESHOT_API_KEY"],
  },
};

export function StorageSettings({
  config,
  onSave,
  isAuthenticated,
}: StorageSettingsProps) {
  const { toast } = useToast();
  const [storageType, setStorageType] = useState<string>(
    config?.type || "reshot"
  );
  const [bucket, setBucket] = useState(config?.bucket || "");
  const [region, setRegion] = useState(config?.region || "us-east-1");
  const [pathPrefix, setPathPrefix] = useState(
    config?.pathPrefix || "docs-assets/"
  );
  const [publicDomain, setPublicDomain] = useState(config?.publicDomain || "");
  const [accountId, setAccountId] = useState(config?.accountId || "");
  const [outputDir, setOutputDir] = useState(
    config?.outputDir || "./.reshot/published"
  );
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Check environment variables
  useEffect(() => {
    checkEnvStatus();
  }, [storageType]);

  const checkEnvStatus = async () => {
    try {
      const response = await fetch("/api/config/env-check");
      if (response.ok) {
        const data = await response.json();
        setEnvStatus(data.envStatus || {});
      }
    } catch (error) {
      console.warn("Failed to check environment status:", error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newConfig: StorageConfig = {
        type: storageType as StorageConfig["type"],
      };

      if (storageType === "s3") {
        newConfig.bucket = bucket;
        newConfig.region = region;
        newConfig.pathPrefix = pathPrefix;
        if (publicDomain) newConfig.publicDomain = publicDomain;
      } else if (storageType === "r2") {
        newConfig.bucket = bucket;
        newConfig.accountId = accountId;
        newConfig.pathPrefix = pathPrefix;
        if (publicDomain) newConfig.publicDomain = publicDomain;
      } else if (storageType === "local") {
        newConfig.outputDir = outputDir;
        if (publicDomain) newConfig.publicDomain = publicDomain;
      }

      await onSave(newConfig);
      toast({ title: "Storage configuration saved" });
    } catch (error) {
      toast({
        title: "Failed to save configuration",
        variant: "destructive",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const requirements = ENV_REQUIREMENTS[storageType] || { envVars: [] };
  const hasAllRequiredEnvVars = requirements.envVars.every((v) => envStatus[v]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          Storage Configuration
        </CardTitle>
        <CardDescription>
          Configure where your visual assets are stored. Use Reshot Platform
          for full governance features, or BYOS (Bring Your Own Storage) for
          self-hosted solutions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Storage Type Selection */}
        <div className="space-y-3">
          <Label>Storage Provider</Label>
          <div className="grid grid-cols-2 gap-3">
            {STORAGE_TYPES.map((type) => {
              const Icon = type.icon;
              const isSelected = storageType === type.value;
              const isDisabled =
                type.requiresAuth &&
                !isAuthenticated &&
                type.value === "reshot";

              return (
                <button
                  key={type.value}
                  onClick={() => !isDisabled && setStorageType(type.value)}
                  className={`
                    p-4 rounded-lg border-2 text-left transition-all
                    ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }
                    ${
                      isDisabled
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    }
                  `}
                  disabled={isDisabled}
                >
                  <div className="flex items-start gap-3">
                    <Icon
                      className={`h-5 w-5 mt-0.5 ${
                        isSelected ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{type.label}</span>
                        {type.requiresAuth && (
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {type.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Environment Variable Status */}
        {storageType !== "reshot" && storageType !== "local" && (
          <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              {hasAllRequiredEnvVars ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              )}
              Required Environment Variables
            </div>
            <div className="space-y-2">
              {requirements.envVars.map((envVar) => (
                <div
                  key={envVar}
                  className="flex items-center justify-between text-sm"
                >
                  <code className="text-xs bg-background px-2 py-1 rounded">
                    {envVar}
                  </code>
                  {envStatus[envVar] ? (
                    <Badge variant="approved">Set</Badge>
                  ) : (
                    <Badge variant="pending">Missing</Badge>
                  )}
                </div>
              ))}
              {requirements.optional?.map((envVar) => (
                <div
                  key={envVar}
                  className="flex items-center justify-between text-sm opacity-60"
                >
                  <code className="text-xs bg-background px-2 py-1 rounded">
                    {envVar}
                  </code>
                  <Badge variant="secondary">Optional</Badge>
                </div>
              ))}
            </div>

            {!hasAllRequiredEnvVars && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">
                  Set these variables in your shell or CI environment:
                </p>
                <div className="bg-background rounded p-2 flex items-center justify-between">
                  <code className="text-xs">
                    export {requirements.envVars[0]}="your-key"
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        `export ${requirements.envVars[0]}="your-key"`
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* S3 Configuration */}
        {storageType === "s3" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bucket">S3 Bucket Name</Label>
                <Input
                  id="bucket"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  placeholder="my-company-assets"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">AWS Region</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us-east-1">
                      US East (N. Virginia)
                    </SelectItem>
                    <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                    <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                    <SelectItem value="ap-northeast-1">
                      Asia Pacific (Tokyo)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pathPrefix">Path Prefix</Label>
              <Input
                id="pathPrefix"
                value={pathPrefix}
                onChange={(e) => setPathPrefix(e.target.value)}
                placeholder="docs-assets/"
              />
              <p className="text-xs text-muted-foreground">
                Assets will be stored at: s3://{bucket}/{pathPrefix}...
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="publicDomain">Public Domain (Optional)</Label>
              <Input
                id="publicDomain"
                value={publicDomain}
                onChange={(e) => setPublicDomain(e.target.value)}
                placeholder="https://assets.example.com"
              />
              <p className="text-xs text-muted-foreground">
                Custom domain for asset URLs. Defaults to S3 bucket URL.
              </p>
            </div>
          </div>
        )}

        {/* R2 Configuration */}
        {storageType === "r2" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bucket">R2 Bucket Name</Label>
                <Input
                  id="bucket"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  placeholder="my-company-assets"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountId">Cloudflare Account ID</Label>
                <Input
                  id="accountId"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="ce2c2e889ba846b6..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pathPrefix">Path Prefix</Label>
              <Input
                id="pathPrefix"
                value={pathPrefix}
                onChange={(e) => setPathPrefix(e.target.value)}
                placeholder="docs-assets/"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publicDomain">Public Domain</Label>
              <Input
                id="publicDomain"
                value={publicDomain}
                onChange={(e) => setPublicDomain(e.target.value)}
                placeholder="https://assets.example.com"
              />
              <p className="text-xs text-muted-foreground">
                R2 requires a custom domain or R2.dev subdomain for public
                access.
              </p>
            </div>
          </div>
        )}

        {/* Local Configuration */}
        {storageType === "local" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="outputDir">Output Directory</Label>
              <Input
                id="outputDir"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                placeholder="./.reshot/published"
              />
              <p className="text-xs text-muted-foreground">
                Assets will be saved to this directory. Deploy it to your web
                server.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="publicDomain">Public URL (Optional)</Label>
              <Input
                id="publicDomain"
                value={publicDomain}
                onChange={(e) => setPublicDomain(e.target.value)}
                placeholder="https://yourdomain.com/assets"
              />
              <p className="text-xs text-muted-foreground">
                The public URL where you'll host the assets.
              </p>
            </div>
          </div>
        )}

        {/* Reshot Platform Info */}
        {storageType === "reshot" && (
          <div className="p-4 rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 space-y-3">
            <div className="font-medium flex items-center gap-2">
              <Cloud className="h-4 w-4 text-primary" />
              Reshot Platform Benefits
            </div>
            <ul className="text-sm space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Visual review queue with approval workflow
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Unbreakable URLs that never change
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Version history and instant rollback
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                GitHub PR notification integration
              </li>
            </ul>
            {!isAuthenticated && (
              <Button variant="default" size="sm" className="mt-2">
                Connect to Reshot <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default StorageSettings;
