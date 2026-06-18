import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  KeyRound,
  Cloud,
  HardDrive,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthenticated: () => void;
}

type AuthStatus = "idle" | "starting" | "waiting" | "completed" | "error";
type StorageType = "platform" | "s3" | "r2" | "local";

const storageOptions: { value: StorageType; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { value: "platform", label: "Reshot Platform", icon: Cloud, description: "Managed hosting" },
  { value: "s3", label: "Amazon S3", icon: Database, description: "Your own bucket" },
  { value: "r2", label: "Cloudflare R2", icon: Database, description: "Your own bucket" },
  { value: "local", label: "Local Storage", icon: HardDrive, description: "Offline only" },
];

export default function AuthPrompt({
  open,
  onOpenChange,
  onAuthenticated,
}: AuthPromptProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [storageType, setStorageType] = useState<StorageType>("platform");
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectInfo, setProjectInfo] = useState<{
    projectId: string;
    projectName: string;
    workspaceName?: string;
  } | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStatus("idle");
      setAuthUrl(null);
      setAuthToken(null);
      setError(null);
      setProjectInfo(null);
    }
  }, [open]);

  // Poll for auth status
  useEffect(() => {
    if (status !== "waiting" || !authToken) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/status?token=${authToken}`);
        const data = await res.json();

        if (data.status === "completed") {
          setStatus("completed");
          setProjectInfo({
            projectId: data.projectId,
            projectName: data.projectName,
            workspaceName: data.workspaceName,
          });
          clearInterval(pollInterval);

          setTimeout(() => {
            onAuthenticated();
            onOpenChange(false);
          }, 1500);
        } else if (data.status === "expired" || data.status === "invalid") {
          setStatus("error");
          setError(data.error || "Authentication session expired");
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [status, authToken, onAuthenticated, onOpenChange]);

  const startAuth = async () => {
    setStatus("starting");
    setError(null);

    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (data.ok && data.authUrl) {
        setAuthUrl(data.authUrl);
        setAuthToken(data.authToken);
        setStatus("waiting");

        // Try to open browser automatically
        try {
          await fetch("/api/auth/open-browser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authUrl: data.authUrl }),
          });
        } catch (e) {
          // Browser open failed, user can use the link
        }
      } else {
        throw new Error(data.error || "Failed to start authentication");
      }
    } catch (err: any) {
      setStatus("error");
      setError(err.message || "Failed to start authentication");
    }
  };

  const copyUrl = useCallback(async () => {
    if (!authUrl) return;
    try {
      await navigator.clipboard.writeText(authUrl);
      toast({
        title: "Copied",
        description: "Authentication URL copied to clipboard",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy URL",
        variant: "destructive",
      });
    }
  }, [authUrl, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Connect to Reshot Platform
          </DialogTitle>
          <DialogDescription>
            Choose your storage destination and authenticate to sync your assets.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {status === "idle" && (
            <div className="space-y-4">
              {/* Storage Options */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Storage Destination</label>
                <div className="grid grid-cols-2 gap-2">
                  {storageOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setStorageType(option.value)}
                        className={cn(
                          "flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors",
                          storageType === option.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span className="text-sm font-medium">{option.label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {storageType === "platform" && (
                <Button onClick={startAuth} className="w-full">
                  <KeyRound className="h-4 w-4 mr-2" />
                  Authenticate with Platform
                </Button>
              )}

              {storageType === "s3" && (
                <div className="text-center space-y-2 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    S3 storage requires configuration in your project settings.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Run <code className="bg-muted px-1 rounded">reshot config --storage s3</code>
                  </p>
                </div>
              )}

              {storageType === "r2" && (
                <div className="text-center space-y-2 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Cloudflare R2 storage requires configuration in your project settings.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Run <code className="bg-muted px-1 rounded">reshot config --storage r2</code>
                  </p>
                </div>
              )}

              {storageType === "local" && (
                <div className="text-center space-y-2 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Local storage keeps assets only on your machine. Great for testing.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      onAuthenticated();
                      onOpenChange(false);
                      toast({
                        title: "Local Mode",
                        description: "Working in local-only mode",
                        variant: "success",
                      });
                    }}
                    className="w-full mt-2"
                  >
                    Use Local Storage
                  </Button>
                </div>
              )}

              {/* Docs link */}
              <div className="pt-2 border-t border-border">
                <a
                  href="https://docs.reshot.dev/reference/cli"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  View CLI Documentation
                </a>
              </div>
            </div>
          )}

          {status === "starting" && (
            <div className="text-center space-y-4 py-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">
                Starting authentication...
              </p>
            </div>
          )}

          {status === "waiting" && authUrl && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm font-medium">
                  Complete authentication in your browser
                </p>
                <p className="text-xs text-muted-foreground">
                  A browser window should have opened. Select a project to link.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  If the browser didn't open, click below or copy the URL:
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(authUrl, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Open in Browser
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyUrl}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {status === "completed" && projectInfo && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
              <div>
                <p className="font-medium">Successfully Connected!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Linked to{" "}
                  {projectInfo.workspaceName &&
                    `${projectInfo.workspaceName} / `}
                  {projectInfo.projectName}
                </p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="text-center space-y-4 py-4">
              <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
              <div>
                <p className="font-medium">Authentication Failed</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {error || "Something went wrong"}
                </p>
              </div>
              <Button onClick={startAuth} variant="outline">
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
