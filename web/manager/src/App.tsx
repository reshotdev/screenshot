import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  LayoutGrid,
  FileText,
  Image,
  Video,
  Settings,
  Command,
  ChevronRight,
  Plug,
  FolderKanban,
  Chrome,
} from "lucide-react";
import { ToastProvider } from "./components/ui/toast";
import { RecorderProvider } from "./contexts/RecorderContext";
import {
  JobMonitorProvider,
  FloatingJobMonitor,
} from "./components/FloatingJobMonitor";
import AuthPrompt from "./components/AuthPrompt";
import Home from "./pages/Home";
import Scenarios from "./pages/Scenarios";
import ScenarioDetail from "./pages/ScenarioDetail";
import Assets from "./pages/Assets";
import Connection from "./pages/Connection";
import Jobs from "./pages/Jobs";
import AssetDetail from "./pages/AssetDetail";
import Recorder from "./pages/Recorder";
import Config from "./pages/Config";
import { cn } from "./lib/utils";

function App() {
  return (
    <ToastProvider>
      <RecorderProvider>
        <BrowserRouter>
          <JobMonitorProvider>
            <div className="min-h-screen bg-background">
              <AppLayout />
              <FloatingJobMonitor />
            </div>
          </JobMonitorProvider>
        </BrowserRouter>
      </RecorderProvider>
    </ToastProvider>
  );
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState<string>("Project");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const [chromeStatus, setChromeStatus] = useState<
    "ready" | "no-tabs" | "not-running"
  >("not-running");
  const chromeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = () => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings?.projectName) {
          setProjectName(data.settings.projectName);
        }
        setIsAuthenticated(data.settings?.isAuthenticated || false);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const checkChromeStatus = useCallback(() => {
    fetch("/api/recorder/check-chrome")
      .then((res) => res.json())
      .then((data) => {
        if (data.chromeAvailable && data.hasValidTab) {
          setChromeStatus("ready");
        } else if (data.chromeAvailable) {
          setChromeStatus("no-tabs");
        } else {
          setChromeStatus("not-running");
        }
      })
      .catch(() => setChromeStatus("not-running"));
  }, []);

  useEffect(() => {
    checkChromeStatus();
    chromeTimerRef.current = setInterval(checkChromeStatus, 12000);
    return () => {
      if (chromeTimerRef.current) clearInterval(chromeTimerRef.current);
    };
  }, [checkChromeStatus]);

  // Keyboard navigation (Cmd+K style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const routes = ["/", "/recorder", "/config"];
        const index = parseInt(e.key) - 1;
        if (routes[index]) navigate(routes[index]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  // Streamlined navigation - Core workflow: Home only in nav
  const navItems = [
    { path: "/", label: "Home", icon: FolderKanban, shortcut: "1" },
  ];

  // Secondary items accessible but not primary focus
  const secondaryItems = [
    { path: "/scenarios", label: "All Scenarios", icon: FileText },
    { path: "/assets", label: "Assets", icon: Image },
    { path: "/jobs", label: "Jobs", icon: LayoutGrid },
  ];

  // Get current page title and breadcrumb
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === "/") return { title: "Overview", breadcrumb: null };
    if (path.startsWith("/scenarios/")) {
      const key = path.split("/")[2];
      return { title: key, breadcrumb: "Scenarios" };
    }
    if (path.startsWith("/assets/"))
      return { title: "Asset", breadcrumb: "Assets" };

    const item = [
      ...navItems,
      ...secondaryItems,
      { path: "/config", label: "Settings" },
    ].find((i) => path === i.path || path.startsWith(i.path + "/"));
    return { title: item?.label || "Page", breadcrumb: null };
  };

  const { title, breadcrumb } = getCurrentPage();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Linear style compact */}
      <aside className="w-[200px] border-r border-sidebar-border bg-sidebar-background flex flex-col">
        {/* Logo & Project */}
        <div className="h-12 flex items-center px-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
              <Command className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-sidebar-foreground truncate">
                {projectName}
              </p>
            </div>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto linear-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "group flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-sidebar-foreground"
                  )}
                />
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="kbd opacity-0 group-hover:opacity-100 transition-opacity">
                    ⌘{item.shortcut}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Divider */}
          <div className="h-px bg-sidebar-border my-2" />

          {/* Record New Scenario Button */}
          <Link
            to="/recorder"
            className={cn(
              "flex items-center gap-2.5 px-2 py-2 rounded-md text-[13px] transition-colors border",
              location.pathname === "/recorder"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50"
            )}
          >
            <Video className="h-4 w-4 shrink-0" />
            <span className="flex-1 font-medium">Record New Scenario</span>
          </Link>

          {/* Divider */}
          <div className="h-px bg-sidebar-border my-2" />

          {/* Secondary nav */}
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors",
                  isActive
                    ? "bg-sidebar-accent/50 text-sidebar-foreground"
                    : "text-muted-foreground/70 hover:bg-sidebar-accent/30 hover:text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-sidebar-border space-y-0.5">
          <Link
            to="/config"
            className={cn(
              "group flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors",
              location.pathname === "/config"
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span className="flex-1">Settings</span>
            <span className="kbd opacity-0 group-hover:opacity-100 transition-opacity">
              ⌘5
            </span>
          </Link>

          {/* Auth Status - Opens connection modal */}
          <button
            onClick={() => setIsAuthPromptOpen(true)}
            className={cn(
              "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors",
              "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <div
              className={cn(
                "status-dot",
                isAuthenticated ? "status-dot-success" : "status-dot-neutral"
              )}
            />
            <span className="flex-1 text-left">
              {isAuthenticated ? "Connected" : "Not connected"}
            </span>
            {!isAuthenticated && <Plug className="h-3.5 w-3.5 opacity-50" />}
          </button>

          {/* Chrome CDP Status */}
          <button
            onClick={() => navigate("/recorder")}
            className={cn(
              "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors",
              "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <div
              className={cn(
                "status-dot",
                chromeStatus === "ready"
                  ? "status-dot-success"
                  : chromeStatus === "no-tabs"
                    ? "status-dot-warning"
                    : "status-dot-neutral"
              )}
            />
            <span className="flex-1 text-left">
              {chromeStatus === "ready"
                ? "Chrome ready"
                : chromeStatus === "no-tabs"
                  ? "Chrome: no tabs"
                  : "Chrome: not running"}
            </span>
            <Chrome className="h-3.5 w-3.5 opacity-50" />
          </button>
        </div>

        {/* Auth Prompt Dialog */}
        <AuthPrompt
          open={isAuthPromptOpen}
          onOpenChange={setIsAuthPromptOpen}
          onAuthenticated={refreshStatus}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 border-b border-border bg-background/50 backdrop-blur-sm flex items-center justify-between px-4">
          <div className="flex items-center gap-2 text-[13px]">
            {breadcrumb && (
              <>
                <Link
                  to={`/${breadcrumb.toLowerCase()}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {breadcrumb}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              </>
            )}
            <span className="font-medium text-foreground">{title}</span>
          </div>

          {/* Project name - clickable to open connection modal */}
          <button
            onClick={() => setIsAuthPromptOpen(true)}
            className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-sidebar-accent/50"
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                isAuthenticated ? "bg-green-500" : "bg-neutral-400"
              )}
            />
            <span>{projectName}</span>
          </button>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-background linear-scrollbar">
          <Routes>
            {/* Core workflow routes */}
            <Route path="/" element={<Home />} />
            <Route path="/recorder" element={<Recorder />} />
            <Route path="/connection" element={<Connection />} />

            {/* Scenario management */}
            <Route path="/scenarios" element={<Scenarios />} />
            <Route path="/scenarios/:key" element={<ScenarioDetail />} />

            {/* Asset viewing */}
            <Route path="/assets" element={<Assets />} />
            <Route
              path="/assets/:scenarioKey/:variationSlug/:captureKey"
              element={<AssetDetail />}
            />

            {/* Secondary routes */}
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/config" element={<Config />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
