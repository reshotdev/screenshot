const fs = require("fs-extra");

function isRecordableTarget(target) {
  return (
    target.type === "page" &&
    !target.url.startsWith("chrome://") &&
    !target.url.startsWith("chrome-error://") &&
    target.url !== "about:blank"
  );
}

function toRecorderTab(target) {
  const isOurUI =
    target.url.includes("localhost:4300") ||
    target.url.includes("127.0.0.1:4300");
  const isChrome =
    target.url.startsWith("chrome://") ||
    target.url.startsWith("chrome-error://") ||
    target.url === "about:blank";

  return {
    id: target.id,
    url: target.url,
    title: target.title || target.url,
    isOurUI,
    isChrome,
  };
}

function sortRecorderTabs(a, b) {
  if (a.isOurUI && !b.isOurUI) return 1;
  if (!a.isOurUI && b.isOurUI) return -1;
  if (a.isChrome && !b.isChrome) return 1;
  if (!a.isChrome && b.isChrome) return -1;
  return 0;
}

function getChromeInstructions() {
  return {
    darwin:
      '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.reshot/chrome-debug"',
    win32:
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\\.reshot\\chrome-debug"',
    linux:
      'google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.reshot/chrome-debug"',
  };
}

function getRecorderServiceUnavailableResponse() {
  return {
    ok: true,
    status: { active: false, error: "Recorder service not available" },
  };
}

function attachRecorderRoutes(app, context, deps = {}) {
  const recordCdp = deps.recordCdp || require("./record-cdp");
  const fileSystem = deps.fs || fs;

  app.get("/api/recorder/check-chrome", async (req, res) => {
    try {
      const endpointCheck = await recordCdp.checkCdpEndpoint("localhost", 9222);

      if (!endpointCheck.available) {
        return res.json({
          ok: false,
          chromeAvailable: false,
          error: endpointCheck.error,
          instructions: getChromeInstructions(),
        });
      }

      let targets = [];
      try {
        targets = await recordCdp.getCdpTargets("localhost", 9222);
      } catch (e) {
        // Keep this endpoint helpful even when target enumeration fails.
      }

      const pageTargets = targets.filter((target) => target.type === "page");
      const validTargets = pageTargets.filter(isRecordableTarget);

      res.json({
        ok: true,
        chromeAvailable: true,
        browserInfo: endpointCheck.info,
        tabs: pageTargets.map((target) => ({
          title: target.title,
          url: target.url,
          isValid: isRecordableTarget(target),
        })),
        hasValidTab: validTargets.length > 0,
        message:
          validTargets.length > 0
            ? `Chrome ready with ${validTargets.length} valid tab(s)`
            : "Chrome is running but no valid tabs found. Please navigate to your application.",
      });
    } catch (error) {
      res.json({
        ok: false,
        chromeAvailable: false,
        error: error.message,
      });
    }
  });

  app.get("/api/recorder/status", async (req, res, next) => {
    try {
      const { recorderService } = context;
      if (!recorderService) {
        return res.json(getRecorderServiceUnavailableResponse());
      }

      const status = recorderService.getStatus();
      res.json({ ok: true, status });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/recorder/steps", async (req, res, next) => {
    try {
      const { recorderService } = context;
      if (!recorderService) {
        return res.json({ ok: true, steps: [] });
      }

      const steps = recorderService.getSteps();
      res.json({ ok: true, steps });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/recorder/tabs", async (req, res) => {
    try {
      const endpointCheck = await recordCdp.checkCdpEndpoint("localhost", 9222);
      if (!endpointCheck.available) {
        return res.json({
          ok: false,
          chromeAvailable: false,
          error: "Chrome is not running with remote debugging enabled",
          tabs: [],
        });
      }

      const targets = await recordCdp.getCdpTargets("localhost", 9222);
      const tabs = targets
        .filter((target) => target.type === "page")
        .map(toRecorderTab)
        .sort(sortRecorderTabs);

      res.json({ ok: true, chromeAvailable: true, tabs });
    } catch (error) {
      console.error("[Recorder API] Get tabs failed:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to get Chrome tabs" });
    }
  });

  app.post("/api/recorder/start", async (req, res) => {
    try {
      const { recorderService } = context;
      if (!recorderService) {
        return res
          .status(503)
          .json({ error: "Recorder service not available" });
      }

      const { visualKey, title, targetUrl, targetId, scenarioUrl } = req.body;

      const result = await recorderService.start({
        visualKey,
        title,
        targetUrl,
        targetId,
        scenarioUrl,
        uiMode: true,
      });

      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[Recorder API] Start failed:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to start recording" });
    }
  });

  app.post("/api/recorder/stop", async (req, res) => {
    try {
      const { recorderService } = context;
      if (!recorderService) {
        return res
          .status(503)
          .json({ error: "Recorder service not available" });
      }

      const { save = true, mergeMode = "replace" } = req.body;

      const result = await recorderService.stop(save, {
        uiMode: true,
        mergeMode,
      });

      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[Recorder API] Stop failed:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to stop recording" });
    }
  });

  app.post("/api/recorder/capture", async (req, res) => {
    try {
      const { recorderService } = context;
      if (!recorderService) {
        return res
          .status(503)
          .json({ error: "Recorder service not available" });
      }

      const { outputFilename, areaType, selector } = req.body;

      const step = await recorderService.capture({
        outputFilename,
        areaType: areaType || "full",
        selector,
        uiMode: true,
      });

      res.json({ ok: true, step });
    } catch (error) {
      console.error("[Recorder API] Capture failed:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to capture screenshot" });
    }
  });

  app.delete("/api/recorder/steps/:index", async (req, res) => {
    try {
      const { recorderService } = context;
      if (!recorderService) {
        return res
          .status(503)
          .json({ error: "Recorder service not available" });
      }

      const index = parseInt(req.params.index, 10);
      if (isNaN(index)) {
        return res.status(400).json({ error: "Invalid step index" });
      }

      const result = recorderService.removeStep(index);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[Recorder API] Remove step failed:", error);
      res.status(500).json({ error: error.message || "Failed to remove step" });
    }
  });

  app.post("/api/recorder/save-session", async (req, res) => {
    try {
      const sessionPath = recordCdp.getDefaultSessionPath();
      const result = await recordCdp.saveSessionState(sessionPath);

      if (result.success) {
        res.json({
          ok: true,
          path: result.path,
          message:
            "Session saved successfully. Captures will now use your authenticated session.",
        });
      } else {
        res.status(400).json({
          ok: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("[Recorder API] Save session failed:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to save session" });
    }
  });

  app.get("/api/recorder/session-status", async (req, res) => {
    try {
      const sessionPath = recordCdp.getDefaultSessionPath();

      if (fileSystem.existsSync(sessionPath)) {
        const stat = fileSystem.statSync(sessionPath);
        const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

        try {
          const sessionData = fileSystem.readJsonSync(sessionPath);
          res.json({
            ok: true,
            hasSession: true,
            path: sessionPath,
            savedAt: stat.mtime.toISOString(),
            ageHours: Math.round(ageHours * 10) / 10,
            cookieCount: sessionData.cookies?.length || 0,
            originsCount: sessionData.origins?.length || 0,
            isStale: ageHours > 24,
          });
        } catch (parseError) {
          res.json({
            ok: true,
            hasSession: true,
            path: sessionPath,
            error: "Session file is corrupted",
          });
        }
      } else {
        res.json({
          ok: true,
          hasSession: false,
          message:
            "No saved session. Use 'Save Session' in Recorder to capture your authenticated state.",
        });
      }
    } catch (error) {
      console.error("[Recorder API] Session status failed:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to check session status" });
    }
  });
}

module.exports = {
  attachRecorderRoutes,
  isRecordableTarget,
  sortRecorderTabs,
  toRecorderTab,
};
