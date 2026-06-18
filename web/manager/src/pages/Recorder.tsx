import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { useRecorder } from "@/contexts/RecorderContext";
import RecorderControls from "@/components/RecorderControls";
import { useToast } from "@/components/ui/toast";
import {
  AlertCircle,
  CheckCircle2,
  Video,
  Settings,
  Terminal,
  RefreshCw,
  Chrome,
  Globe,
  KeyRound,
  Copy,
} from "lucide-react";

interface Scenario {
  key: string;
  name: string;
  url: string;
  steps: any[];
}

interface ChromeTab {
  id: string;
  url: string;
  title: string;
  isOurUI: boolean;
  isChrome: boolean;
}

interface ChromeStatus {
  ok: boolean;
  chromeAvailable: boolean;
  browserInfo?: { Browser?: string };
  tabs?: { title: string; url: string; isValid: boolean }[];
  hasValidTab?: boolean;
  message?: string;
  error?: string;
  instructions?: { darwin: string; win32: string; linux: string };
}

interface SessionStatus {
  hasSession: boolean;
  path?: string;
  savedAt?: string;
  ageHours?: number;
  cookieCount?: number;
  isStale?: boolean;
}

export default function Recorder() {
  const navigate = useNavigate();
  const { status, isConnected, error, diagnostics } = useRecorder();
  const { toast } = useToast();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [newVisualTitle, setNewVisualTitle] = useState("");
  const [newVisualUrl, setNewVisualUrl] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [chromeStatus, setChromeStatus] = useState<ChromeStatus | null>(null);
  const [isCheckingChrome, setIsCheckingChrome] = useState(false);

  // Tab selection state
  const [availableTabs, setAvailableTabs] = useState<ChromeTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string>("");
  const [isLoadingTabs, setIsLoadingTabs] = useState(false);

  // Session state for authenticated captures
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(
    null
  );
  const [isSavingSession, setIsSavingSession] = useState(false);

  const checkChrome = useCallback(async () => {
    setIsCheckingChrome(true);
    try {
      const res = await fetch("/api/recorder/check-chrome");
      const data = await res.json();
      setChromeStatus(data);
    } catch (err) {
      setChromeStatus({
        ok: false,
        chromeAvailable: false,
        error: "Failed to check Chrome status",
      });
    } finally {
      setIsCheckingChrome(false);
    }
  }, []);

  const loadTabs = useCallback(async () => {
    setIsLoadingTabs(true);
    try {
      const res = await fetch("/api/recorder/tabs");
      const data = await res.json();
      if (data.ok && data.tabs) {
        // Filter out our UI and chrome:// pages
        const validTabs = data.tabs.filter(
          (t: ChromeTab) => !t.isOurUI && !t.isChrome
        );
        setAvailableTabs(validTabs);
        // Auto-select first valid tab if none selected
        setSelectedTabId((prev) => {
          if (!prev && validTabs.length > 0) {
            return validTabs[0].id;
          }
          // If previous selection is still valid, keep it
          if (prev && validTabs.some((t: ChromeTab) => t.id === prev)) {
            return prev;
          }
          // Otherwise select first available
          return validTabs.length > 0 ? validTabs[0].id : "";
        });
      }
    } catch (err) {
      console.error("Failed to load tabs:", err);
    } finally {
      setIsLoadingTabs(false);
    }
  }, []); // Remove selectedTabId from dependencies to avoid stale closure

  // Check if there's a saved session for authenticated captures
  const checkSessionStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/recorder/session-status");
      const data = await res.json();
      if (data.ok) {
        setSessionStatus(data);
      }
    } catch (err) {
      console.error("Failed to check session status:", err);
    }
  }, []);

  // Save the current browser session for use in captures
  const saveSession = useCallback(async () => {
    setIsSavingSession(true);
    try {
      const res = await fetch("/api/recorder/save-session", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast({
          title: "Session Saved",
          description:
            "Your authenticated session has been saved. Future captures will use your login state.",
        });
        checkSessionStatus(); // Refresh status
      } else {
        toast({
          title: "Save Failed",
          description:
            data.error ||
            "Could not save session. Make sure Chrome is running with your app logged in.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    } finally {
      setIsSavingSession(false);
    }
  }, [toast, checkSessionStatus]);

  // Load scenarios from config
  const loadScenarios = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.config?.scenarios) {
        setScenarios(data.config.scenarios);
      }
    } catch (err) {
      console.error("Failed to load scenarios:", err);
    }
  }, []);

  useEffect(() => {
    // Fetch existing scenarios
    loadScenarios();

    // Check Chrome status on mount
    checkChrome();

    // Check session status on mount
    checkSessionStatus();
  }, [checkChrome, checkSessionStatus]);

  // Load tabs when Chrome is available
  useEffect(() => {
    if (chromeStatus?.chromeAvailable) {
      loadTabs();
    }
  }, [chromeStatus?.chromeAvailable, loadTabs]);

  const getVisualKeyAndTitle = () => {
    if (mode === "existing" && selectedScenario) {
      const scenario = scenarios.find((s) => s.key === selectedScenario);
      return {
        visualKey: selectedScenario,
        title: scenario?.name || selectedScenario,
      };
    }
    if (mode === "new" && newVisualTitle.trim()) {
      const key = newVisualTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
      return { visualKey: key, title: newVisualTitle.trim() };
    }
    return { visualKey: undefined, title: undefined };
  };

  const { visualKey, title } = getVisualKeyAndTitle();

  // Get selected tab info for RecorderControls
  const selectedTab = availableTabs.find((t) => t.id === selectedTabId);

  return (
    <div
      data-testid="studio-recorder"
      data-loaded="true"
      className="p-8 space-y-6 max-w-4xl mx-auto"
    >
      <div>
        <h1 className="text-3xl font-bold">Recording Studio</h1>
        <p className="text-muted-foreground mt-2">
          Capture screenshots and user interactions from your application
        </p>
      </div>

      {/* Chrome Status - Most Important */}
      <Card
        className={
          chromeStatus?.hasValidTab
            ? "border-green-500/50 bg-green-500/5"
            : chromeStatus?.chromeAvailable
            ? "border-yellow-500/50 bg-yellow-500/5"
            : "border-red-500/50 bg-red-500/5"
        }
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Chrome className="h-4 w-4" />
              Chrome Browser Status
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={checkChrome}
                disabled={isCheckingChrome}
                title="Refresh"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    isCheckingChrome ? "animate-spin" : ""
                  }`}
                />
              </Button>
              {chromeStatus && (
                <Badge
                  variant={
                    chromeStatus.hasValidTab
                      ? "default"
                      : chromeStatus.chromeAvailable
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {chromeStatus.hasValidTab ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ready
                    </>
                  ) : chromeStatus.chromeAvailable ? (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Needs Tab
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Not Running
                    </>
                  )}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!chromeStatus?.chromeAvailable && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Badge variant="secondary">Not Connected</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                To enable recording, launch a dedicated Chrome instance:
              </p>
              <div className="bg-background rounded-md p-3 border space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Run this command in your Terminal:
                </p>
                <div className="relative">
                  <code className="block bg-muted px-3 py-2 pr-10 rounded text-xs font-mono break-all select-all">
                    /Applications/Google\ Chrome.app/Contents/MacOS/Google\
                    Chrome --remote-debugging-port=9222
                    --user-data-dir="$HOME/.reshot/chrome-debug"
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.reshot/chrome-debug"'
                      );
                      toast({
                        title: "Copied",
                        description: "Command copied to clipboard",
                      });
                    }}
                    title="Copy command"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Note: This launches a separate Chrome profile. You do not need
                  to close your main browser.
                </p>
              </div>
            </div>
          )}

          {chromeStatus?.chromeAvailable && !chromeStatus.hasValidTab && (
            <div className="space-y-2">
              <p className="text-sm text-yellow-600 font-medium">
                Chrome is running, but no valid tabs found.
              </p>
              <p className="text-xs text-muted-foreground">
                Please open a tab and navigate to your application, then click
                "Refresh" above.
              </p>
            </div>
          )}

          {chromeStatus?.hasValidTab && (
            <div className="space-y-3">
              <p className="text-sm text-green-600 font-medium">
                ✓ Chrome is ready for recording!
              </p>

              {/* Tab Selector - Most important! */}
              {availableTabs.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Select Tab to Record:
                  </Label>
                  <div className="space-y-1.5">
                    {availableTabs.map((tab) => (
                      <div
                        key={tab.id}
                        onClick={() => setSelectedTabId(tab.id)}
                        className={`flex items-center gap-2 text-xs px-3 py-2 rounded cursor-pointer transition-colors ${
                          selectedTabId === tab.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 hover:bg-muted"
                        }`}
                      >
                        <Globe className="h-3 w-3 flex-shrink-0" />
                        <div className="truncate flex-1">
                          <div className="font-medium truncate">
                            {tab.title || "Untitled"}
                          </div>
                          <div
                            className={`text-[10px] truncate ${
                              selectedTabId === tab.id
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {tab.url}
                          </div>
                        </div>
                        {selectedTabId === tab.id && (
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadTabs}
                    disabled={isLoadingTabs}
                    className="text-xs"
                  >
                    <RefreshCw
                      className={`h-3 w-3 mr-1 ${
                        isLoadingTabs ? "animate-spin" : ""
                      }`}
                    />
                    Refresh Tabs
                  </Button>
                </div>
              )}

              {availableTabs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No recordable tabs found. Open your application in Chrome.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Status - For authenticated captures */}
      {chromeStatus?.chromeAvailable && (
        <Card
          className={
            sessionStatus?.hasSession ? "border-blue-500/30" : "border-muted"
          }
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Authentication Session
              </CardTitle>
              {sessionStatus?.hasSession && (
                <Badge
                  variant={sessionStatus.isStale ? "secondary" : "default"}
                >
                  {sessionStatus.isStale ? "Stale" : "Active"}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Save your logged-in session so captures can access authenticated
              pages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessionStatus?.hasSession ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Session saved</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{sessionStatus.cookieCount} cookies stored</p>
                  <p>
                    Saved{" "}
                    {sessionStatus.ageHours
                      ? `${sessionStatus.ageHours}h ago`
                      : "recently"}
                  </p>
                  {sessionStatus.isStale && (
                    <p className="text-yellow-600">
                      Session may be expired - consider saving a fresh one
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                <p>
                  No saved session. Most localhost capture runs do not need one.
                  If your scenario signs into the local app in Chrome, save the
                  session here.
                </p>
              </div>
            )}
            <Button
              variant={sessionStatus?.hasSession ? "outline" : "default"}
              size="sm"
              onClick={saveSession}
              disabled={isSavingSession || !chromeStatus?.chromeAvailable}
              className="w-full"
            >
              {isSavingSession ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <KeyRound className="h-3 w-3 mr-2" />
                  {sessionStatus?.hasSession
                    ? "Update Session"
                    : "Save Session"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Socket.io Connection Status */}
      <Card
        className={isConnected ? "border-green-500/30" : "border-red-500/30"}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Server Connection
            </CardTitle>
            <Badge variant={isConnected ? "default" : "destructive"}>
              {isConnected ? (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Disconnected
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {isConnected
              ? "Real-time events will be captured and displayed."
              : "Connection lost. Please refresh the page."}
          </p>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-500/50 bg-red-50/10">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium text-red-600">Recording Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visual Configuration */}
      {!status.active && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Video className="h-4 w-4" />
              Configure Recording Session
            </CardTitle>
            <CardDescription>
              Choose to record a new visual or edit an existing scenario
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={mode === "new" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("new")}
              >
                New Visual
              </Button>
              <Button
                variant={mode === "existing" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("existing")}
                disabled={scenarios.length === 0}
              >
                Edit Existing ({scenarios.length})
              </Button>
            </div>

            {mode === "new" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="visual-title">Visual Title</Label>
                  <Input
                    id="visual-title"
                    placeholder="e.g., Admin Dashboard View"
                    value={newVisualTitle}
                    onChange={(e) => setNewVisualTitle(e.target.value)}
                  />
                  {newVisualTitle && (
                    <p className="text-xs text-muted-foreground">
                      Key:{" "}
                      <code className="bg-muted px-1 rounded">{visualKey}</code>
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visual-url">
                    Scenario URL{" "}
                    <span className="text-muted-foreground text-xs">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="visual-url"
                    placeholder="https://your-app.com/page (uses tab URL if blank)"
                    value={newVisualUrl}
                    onChange={(e) => setNewVisualUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {newVisualUrl
                      ? "This URL will be saved with the scenario."
                      : "Leave blank to use the URL from the selected Chrome tab."}
                  </p>
                </div>
              </div>
            )}

            {mode === "existing" && scenarios.length > 0 && (
              <div className="space-y-2">
                <Label>Select Scenario</Label>
                <div className="grid gap-2">
                  {scenarios.map((scenario) => (
                    <div
                      key={scenario.key}
                      onClick={() => setSelectedScenario(scenario.key)}
                      className={`p-3 rounded-md border cursor-pointer transition-colors ${
                        selectedScenario === scenario.key
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium text-sm">{scenario.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {scenario.key} • {scenario.steps?.length || 0} steps
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recorder Controls */}
      <RecorderControls
        visualKey={visualKey}
        visualTitle={title}
        targetUrl={selectedTab?.url}
        targetId={selectedTabId}
        scenarioUrl={
          mode === "new" && newVisualUrl.trim()
            ? newVisualUrl.trim()
            : undefined
        }
        onRecordingComplete={(savedKey?: string) => {
          toast({
            title: "Recording Complete",
            description: "Scenario has been saved.",
            variant: "success",
          });

          // Navigate to the saved scenario
          const scenarioKey = savedKey || visualKey;
          if (scenarioKey) {
            // Short delay to allow backend to complete save
            setTimeout(() => {
              navigate(`/scenarios/${scenarioKey}`);
            }, 500);
          } else {
            // Fallback: refresh scenarios list and navigate to scenarios page
            fetch("/api/config")
              .then((res) => res.json())
              .then((data) => {
                if (data.config?.scenarios) {
                  setScenarios(data.config.scenarios);
                  // Navigate to the most recently added scenario
                  const latestScenario =
                    data.config.scenarios[data.config.scenarios.length - 1];
                  if (latestScenario?.key) {
                    navigate(`/scenarios/${latestScenario.key}`);
                  } else {
                    navigate("/scenarios");
                  }
                }
              })
              .catch(() => {
                navigate("/scenarios");
              });
          }
        }}
      />

      {/* Diagnostics Log */}
      {diagnostics.length > 0 && (
        <Card>
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-2">
              <Terminal className="h-3 w-3" />
              Diagnostic Log ({diagnostics.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-48 overflow-y-auto">
            <div className="font-mono text-xs divide-y divide-border">
              {diagnostics.slice(-20).map((diag, i) => (
                <div
                  key={i}
                  className={`px-4 py-2 ${
                    diag.level === "error"
                      ? "bg-red-50/10 text-red-600"
                      : diag.level === "warn"
                      ? "bg-yellow-50/10 text-yellow-600"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="opacity-50">
                    [{new Date(diag.timestamp).toLocaleTimeString()}]
                  </span>{" "}
                  {diag.message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm font-medium">How to Record</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-4">
          <ol className="list-decimal list-inside space-y-3">
            <li>
              <strong>Launch a dedicated Chrome instance</strong> with debugging
              enabled:
              <div className="relative mt-1">
                <code className="block bg-background px-2 py-1.5 pr-10 rounded text-xs font-mono select-all">
                  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
                  --remote-debugging-port=9222
                  --user-data-dir="$HOME/.reshot/chrome-debug"
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.reshot/chrome-debug"'
                    );
                    toast({
                      title: "Copied",
                      description: "Command copied to clipboard",
                    });
                  }}
                  title="Copy command"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/70 mt-1 italic">
                This uses a separate Chrome profile. Your main browser stays
                untouched.
              </p>
            </li>
            <li>
              <strong>Navigate to your application</strong> in the Chrome window
              that opens
            </li>
            <li>
              <strong>Click "Refresh"</strong> in the Chrome Status card above
              to verify connection
            </li>
            <li>
              Configure a new visual or select an existing scenario, then click{" "}
              <strong>"Start Recording"</strong>
            </li>
            <li>
              Interact with your app - clicks and inputs will be captured. Click{" "}
              <strong>"Capture Screen"</strong> for screenshots.
            </li>
            <li>
              Click <strong>"Stop & Save"</strong> when finished
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
