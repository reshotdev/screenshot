import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
  Unplug,
  Link2,
  Copy,
  Globe,
  User,
  Building2,
  Calendar,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectionStatus {
  isAuthenticated: boolean;
  projectId: string | null;
  projectName: string | null;
  workspaceName: string | null;
  platformUrl: string | null;
  user: {
    email?: string;
    fullName?: string;
  } | null;
  linkedAt: string | null;
  apiKeyValid: boolean | "unknown";
  apiKeyWarning?: string;
}

interface AuthSession {
  authUrl: string;
  authToken: string;
  expiresAt: string;
}

export default function Connection() {
  const { toast } = useToast();

  // Ref to track if component is mounted
  const isMountedRef = useRef(true);

  // Connection status
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Auth flow state
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authPolling, setAuthPolling] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load connection status from settings
  const loadStatus = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) setLoading(true);

        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to fetch settings");

        const data = await res.json();
        const settings = data.settings || {};

        if (!isMountedRef.current) return;

        setStatus({
          isAuthenticated: settings.isAuthenticated || false,
          projectId: settings.projectId || null,
          projectName: settings.projectName || null,
          workspaceName: settings.workspaceName || null,
          platformUrl: settings.platformUrl || null,
          user: settings.user || null,
          linkedAt: settings.linkedAt || null,
          apiKeyValid: settings.isAuthenticated ? true : false,
          apiKeyWarning: undefined,
        });
      } catch (error) {
        console.error("Failed to load status:", error);
        if (isMountedRef.current) {
          toast({
            title: "Error",
            description: "Failed to load connection status",
            variant: "destructive",
          });
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [toast],
  );

  // Initial load
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Refresh connection info from platform
  const refreshConnection = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      const data = await res.json();

      if (!isMountedRef.current) return;

      if (res.status === 401 || data.authRequired) {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                apiKeyValid: false,
                apiKeyWarning: data.error || "Please re-authenticate",
              }
            : null,
        );
        toast({
          title: "Authentication Required",
          description: data.error || "Please re-link to platform",
          variant: "destructive",
        });
        return;
      }

      if (data.ok) {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                projectId: data.projectId || prev.projectId,
                projectName: data.projectName || prev.projectName,
                workspaceName: data.workspaceName || prev.workspaceName,
                user: data.user || prev.user,
                linkedAt: data.linkedAt || prev.linkedAt,
                apiKeyValid: true,
                apiKeyWarning: undefined,
              }
            : null,
        );
        toast({
          title: "Refreshed",
          description: "Connection info updated from platform",
          variant: "success",
        });
      } else if (data.warning) {
        // Partial success - couldn't reach platform but have cached data
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                apiKeyValid: "unknown",
                apiKeyWarning: data.warning,
              }
            : null,
        );
        toast({
          title: "Warning",
          description: data.warning,
        });
      }
    } catch (error) {
      console.error("Refresh failed:", error);
      toast({
        title: "Refresh Failed",
        description: "Could not refresh connection info",
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  };

  // Verify API key is valid
  const verifyConnection = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify");
      const data = await res.json();

      if (!isMountedRef.current) return;

      if (res.status === 401) {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                apiKeyValid: false,
                apiKeyWarning: data.error || "API key is invalid or expired",
              }
            : null,
        );
        toast({
          title: "Connection Invalid",
          description: data.error || "Please re-authenticate",
          variant: "destructive",
        });
      } else if (data.valid === "unknown") {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                apiKeyValid: "unknown",
                apiKeyWarning: data.warning,
              }
            : null,
        );
        toast({
          title: "Status Unknown",
          description:
            data.warning || "Could not verify - platform may be unreachable",
        });
      } else {
        // Update with fresh data from verify response
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                projectId: data.projectId || prev.projectId,
                projectName: data.projectName || prev.projectName,
                workspaceName: data.workspaceName || prev.workspaceName,
                user: data.user || prev.user,
                apiKeyValid: true,
                apiKeyWarning: undefined,
              }
            : null,
        );
        toast({
          title: "Connection Verified",
          description: "Your connection is active",
          variant: "success",
        });
      }
    } catch (error) {
      console.error("Verification failed:", error);
      toast({
        title: "Verification Failed",
        description: "Could not verify connection",
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) {
        setVerifying(false);
      }
    }
  };

  // Start auth flow
  const startAuth = async () => {
    setConnecting(true);
    setAuthSession(null);

    try {
      const res = await fetch("/api/auth/start", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to start authentication");
      }

      if (!isMountedRef.current) return;

      const session: AuthSession = {
        authUrl: data.authUrl,
        authToken: data.authToken,
        expiresAt: data.expiresAt,
      };
      setAuthSession(session);

      // Open browser
      try {
        await fetch("/api/auth/open-browser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authUrl: data.authUrl }),
        });
        toast({
          title: "Browser Opened",
          description: "Complete the sign-in in your browser",
        });
      } catch {
        toast({
          title: "Browser Error",
          description: "Copy the URL below and paste in your browser",
        });
      }

      // Start polling
      setAuthPolling(true);
    } catch (error) {
      console.error("Auth start failed:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to start authentication",
        variant: "destructive",
      });
      setConnecting(false);
    }
  };

  // Poll for auth completion
  useEffect(() => {
    if (!authPolling || !authSession) return;

    let pollCount = 0;
    const maxPolls = 150; // 5 minutes at 2s intervals

    const pollInterval = setInterval(async () => {
      pollCount++;

      if (pollCount > maxPolls) {
        setAuthPolling(false);
        setAuthSession(null);
        setConnecting(false);
        toast({
          title: "Authentication Timeout",
          description: "Please try again",
          variant: "destructive",
        });
        return;
      }

      try {
        const res = await fetch(
          `/api/auth/status?token=${encodeURIComponent(authSession.authToken)}`,
        );
        const data = await res.json();

        if (!isMountedRef.current) return;

        if (data.status === "completed") {
          clearInterval(pollInterval);
          setAuthPolling(false);
          setAuthSession(null);
          setConnecting(false);

          // Reload status to get fresh data
          await loadStatus(false);

          toast({
            title: "Connected!",
            description: `Successfully linked to ${
              data.projectName || "project"
            }`,
            variant: "success",
          });
        } else if (data.status === "expired" || data.status === "invalid") {
          clearInterval(pollInterval);
          setAuthPolling(false);
          setAuthSession(null);
          setConnecting(false);
          toast({
            title: "Authentication Failed",
            description: data.error || "Session expired. Please try again.",
            variant: "destructive",
          });
        }
        // Keep polling if still pending
      } catch (error) {
        console.error("Polling error:", error);
        // Don't stop polling on network errors - keep trying
      }
    }, 2000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [authPolling, authSession, loadStatus, toast]);

  // Cancel auth flow
  const cancelAuth = () => {
    setAuthPolling(false);
    setAuthSession(null);
    setConnecting(false);
  };

  // Copy URL to clipboard
  const copyAuthUrl = async () => {
    if (authSession?.authUrl) {
      try {
        await navigator.clipboard.writeText(authSession.authUrl);
        toast({ title: "Copied", description: "Auth URL copied to clipboard" });
      } catch {
        toast({
          title: "Error",
          description: "Failed to copy",
          variant: "destructive",
        });
      }
    }
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Invalid date";
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Loading connection status...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="studio-connection"
      data-loaded="true"
      className="p-6 max-w-3xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Platform Connection
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your connection to the Reshot platform
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => loadStatus(false)}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Connection Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              Connection Status
            </CardTitle>
            <Badge
              variant={status?.isAuthenticated ? "default" : "secondary"}
              className={cn(
                status?.isAuthenticated &&
                  status?.apiKeyValid === true &&
                  "bg-green-600",
                status?.isAuthenticated &&
                  status?.apiKeyValid === false &&
                  "bg-red-600",
                status?.isAuthenticated &&
                  status?.apiKeyValid === "unknown" &&
                  "bg-yellow-600",
              )}
            >
              {status?.isAuthenticated ? (
                status?.apiKeyValid === true ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </>
                ) : status?.apiKeyValid === false ? (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Invalid
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Unverified
                  </>
                )
              ) : (
                <>
                  <Unplug className="h-3 w-3 mr-1" />
                  Not Connected
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.isAuthenticated ? (
            <>
              {/* Project Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Project
                  </Label>
                  <p className="text-sm font-medium">
                    {status.projectName || "Unknown Project"}
                  </p>
                  {status.projectId && (
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {status.projectId}
                    </p>
                  )}
                </div>

                {status.workspaceName && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      Workspace
                    </Label>
                    <p className="text-sm font-medium">
                      {status.workspaceName}
                    </p>
                  </div>
                )}

                {status.user && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Linked User
                    </Label>
                    <p className="text-sm font-medium">
                      {status.user.fullName || status.user.email || "Unknown"}
                    </p>
                    {status.user.fullName && status.user.email && (
                      <p className="text-xs text-muted-foreground">
                        {status.user.email}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Linked On
                  </Label>
                  <p className="text-sm">{formatDate(status.linkedAt)}</p>
                </div>
              </div>

              {/* Warning if API key is invalid */}
              {status.apiKeyWarning && (
                <div className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-600">
                        Connection Issue
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {status.apiKeyWarning}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={verifyConnection}
                  disabled={verifying}
                >
                  {verifying ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Shield className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Verify
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshConnection}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Sync Info
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={startAuth}
                  disabled={connecting}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Re-link
                </Button>

                {status.platformUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(status.platformUrl!, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Platform
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Connect to the Reshot platform to publish your captured visuals
                and sync with your team.
              </p>

              <Button onClick={startAuth} disabled={connecting}>
                {connecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Connect to Platform
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Auth Flow Card - Only show when authenticating */}
      {authSession && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Waiting for Authentication
            </CardTitle>
            <CardDescription>
              Complete the sign-in process in your browser window
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-md bg-background border">
              <p className="text-xs text-muted-foreground mb-2">
                If the browser didn't open, copy this URL and paste it in your
                browser:
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={authSession.authUrl}
                  readOnly
                  className="text-xs font-mono bg-muted"
                />
                <Button variant="outline" size="icon" onClick={copyAuthUrl}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={cancelAuth}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(authSession.authUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open Browser
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>1. Connect:</strong> Link this CLI to your Reshot platform
            project
          </p>
          <p>
            <strong>2. Capture:</strong> Record and capture visuals locally in
            your workspace
          </p>
          <p>
            <strong>3. Commit:</strong> Bundle scenarios and publish to the
            platform
          </p>
          <p className="pt-2 text-xs">
            Your captured assets remain local until you publish them. Re-link
            anytime to switch projects.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
