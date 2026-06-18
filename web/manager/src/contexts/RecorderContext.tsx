import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";

interface RecorderStatus {
  active: boolean;
  sessionId?: string;
  visualKey?: string;
  phase?: string;
  mode?: string;
  stepsCount?: number;
  url?: string;
}

interface RecorderStep {
  action: string;
  selector?: string;
  text?: string;
  key?: string;
  path?: string;
  id?: string;
  [key: string]: any;
}

interface RecorderEvent {
  type: string;
  sessionId?: string;
  [key: string]: any;
}

interface RecorderDiagnostic {
  level: "info" | "error" | "warn";
  message: string;
  timestamp: string;
}

interface RecorderContextType {
  status: RecorderStatus;
  steps: RecorderStep[];
  isConnected: boolean;
  lastEvent: RecorderStep | null;
  error: string | null;
  diagnostics: RecorderDiagnostic[];
  start: (options: {
    visualKey?: string;
    title?: string;
    targetUrl?: string;
    targetId?: string;
    scenarioUrl?: string;
  }) => Promise<void>;
  stop: (save?: boolean) => Promise<void>;
  capture: (options?: {
    outputFilename?: string;
    areaType?: "full" | "element";
    selector?: string;
  }) => Promise<void>;
  removeStep: (index: number) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshSteps: () => Promise<void>;
}

const RecorderContext = createContext<RecorderContextType | undefined>(
  undefined
);

export function RecorderProvider({ children }: { children: ReactNode }) {
  const [, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<RecorderStatus>({ active: false });
  const [steps, setSteps] = useState<RecorderStep[]>([]);
  const [lastEvent, setLastEvent] = useState<RecorderStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RecorderDiagnostic[]>([]);

  useEffect(() => {
    // Connect to socket.io server
    const newSocket = io(window.location.origin, {
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      setIsConnected(true);
      console.log("[Recorder] Connected to server");
    });

    newSocket.on("disconnect", () => {
      setIsConnected(false);
      console.log("[Recorder] Disconnected from server");
    });

    // 1. Listen for STATUS updates (Start/Stop)
    newSocket.on("recorder:status", (newStatus: RecorderStatus) => {
      console.log("STATUS UPDATE:", newStatus);
      setStatus(newStatus);
    });

    // 2. Listen for ACTIONS (The missing logs)
    // The backend emits { sessionId, step }
    newSocket.on("recorder:action", (data: { step: RecorderStep }) => {
      console.log("ACTION RECEIVED:", data);
      setSteps((prev) => [...prev, data.step]);
    });

    // 3. Listen for FULL SYNC (On load/reconnect)
    newSocket.on("recorder:steps", (data: { steps: RecorderStep[] }) => {
      setSteps(data.steps);
    });

    // Listen for recorder events
    newSocket.on("recorder:event", (event: RecorderEvent) => {
      console.log("[Recorder] Event:", event);

      switch (event.type) {
        case "session_started":
          refreshStatus();
          break;
        case "session_stopped":
          refreshStatus();
          refreshSteps();
          break;
        case "capture_started":
        case "capture_completed":
        case "capture_error":
          refreshStatus();
          refreshSteps();
          break;
      }
    });

    // Listen for recorder diagnostics
    newSocket.on(
      "recorder:diagnostic",
      (data: {
        level: "info" | "error" | "warn";
        message: string;
        sessionId?: string;
      }) => {
        const diagnostic: RecorderDiagnostic = {
          level: data.level,
          message: data.message,
          timestamp: new Date().toISOString(),
        };
        setDiagnostics((prev) => {
          const updated = [...prev, diagnostic];
          // Keep only last 50 diagnostics
          return updated.slice(-50);
        });

        // Set error if it's an error level
        if (data.level === "error") {
          setError(data.message);
        }
      }
    );

    setSocket(newSocket);

    // Initial fetch to sync state if we refreshed the page
    fetch("/api/recorder/status")
      .then((r) => r.json())
      .then((d) => d.ok && setStatus(d.status));
    fetch("/api/recorder/steps")
      .then((r) => r.json())
      .then((d) => d.ok && setSteps(d.steps));

    return () => {
      newSocket.close();
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/recorder/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status || { active: false });
      }
    } catch (err) {
      console.error("[Recorder] Failed to refresh status:", err);
    }
  }, []);

  const refreshSteps = useCallback(async () => {
    try {
      const res = await fetch("/api/recorder/steps");
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps || []);
      }
    } catch (err) {
      console.error("[Recorder] Failed to refresh steps:", err);
    }
  }, []);

  const start = useCallback(
    async (options: {
      visualKey?: string;
      title?: string;
      targetUrl?: string;
      targetId?: string;
      scenarioUrl?: string;
    }) => {
      setSteps([]); // Clear old steps
      try {
        setError(null);
        const res = await fetch("/api/recorder/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
        });

        if (!res.ok) {
          const error = await res.json();
          const errorMsg = error.error || "Failed to start recording";
          setError(errorMsg);
          throw new Error(errorMsg);
        }

        // IMMEDIATE FEEDBACK:
        // The backend might take a moment to emit the socket event.
        // We can optimistically set active to true to trigger UI logic
        setStatus((prev) => ({
          ...prev,
          active: true,
          visualKey: options.visualKey || prev.visualKey,
        }));

        // Then the socket event will arrive and sync the true state
        const statusRes = await fetch("/api/recorder/status");
        if (statusRes.ok) {
          const data = await statusRes.json();
          setStatus(data.status || { active: false });
        }
      } catch (err: any) {
        console.error("[Recorder] Failed to start:", err);
        setError(err.message || "Failed to start recording");
        throw err;
      }
    },
    []
  );

  const stop = useCallback(async (save = true) => {
    try {
      setError(null);
      const res = await fetch("/api/recorder/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save }),
      });

      if (!res.ok) {
        const error = await res.json();
        const errorMsg = error.error || "Failed to stop recording";
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      // Refresh status and steps
      const [statusRes, stepsRes] = await Promise.all([
        fetch("/api/recorder/status"),
        fetch("/api/recorder/steps"),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data.status || { active: false });
      }
      if (stepsRes.ok) {
        const data = await stepsRes.json();
        setSteps(data.steps || []);
      }
      setLastEvent(null);
    } catch (err: any) {
      console.error("[Recorder] Failed to stop:", err);
      setError(err.message || "Failed to stop recording");
      throw err;
    }
  }, []);

  const capture = useCallback(
    async (
      options: {
        outputFilename?: string;
        areaType?: "full" | "element";
        selector?: string;
      } = {}
    ) => {
      try {
        const res = await fetch("/api/recorder/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to capture");
        }

        // Refresh status and steps
        const [statusRes, stepsRes] = await Promise.all([
          fetch("/api/recorder/status"),
          fetch("/api/recorder/steps"),
        ]);
        if (statusRes.ok) {
          const data = await statusRes.json();
          setStatus(data.status || { active: false });
        }
        if (stepsRes.ok) {
          const data = await stepsRes.json();
          setSteps(data.steps || []);
        }
      } catch (err) {
        console.error("[Recorder] Failed to capture:", err);
        throw err;
      }
    },
    []
  );

  const removeStep = useCallback(async (index: number) => {
    try {
      const res = await fetch(`/api/recorder/steps/${index}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to remove step");
      }

      // The backend will emit recorder:steps event to update UI
      // But we can also optimistically update local state
      setSteps((prev) => prev.filter((_, i) => i !== index));
    } catch (err) {
      console.error("[Recorder] Failed to remove step:", err);
      throw err;
    }
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      status,
      steps,
      isConnected,
      lastEvent,
      error,
      diagnostics,
      start,
      stop,
      capture,
      removeStep,
      refreshStatus,
      refreshSteps,
    }),
    [
      status,
      steps,
      isConnected,
      lastEvent,
      error,
      diagnostics,
      start,
      stop,
      capture,
      removeStep,
      refreshStatus,
      refreshSteps,
    ]
  );

  return (
    <RecorderContext.Provider value={contextValue}>
      {children}
    </RecorderContext.Provider>
  );
}

export function useRecorder() {
  const context = useContext(RecorderContext);
  if (context === undefined) {
    throw new Error("useRecorder must be used within a RecorderProvider");
  }
  return context;
}
