import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRecorder } from "@/contexts/RecorderContext";
import { useToast } from "@/components/ui/toast";
import {
  Video,
  Circle,
  Loader2,
  MousePointer2,
  Type,
  Eye,
  X,
  Save,
  Trash2,
} from "lucide-react";

export interface RecorderControlsProps {
  visualKey?: string;
  visualTitle?: string;
  targetUrl?: string;
  targetId?: string;
  scenarioUrl?: string; // Optional custom URL to save with the scenario
  onRecordingComplete?: (savedKey?: string) => void;
}

export default function RecorderControls({
  visualKey,
  visualTitle,
  targetUrl,
  targetId,
  scenarioUrl,
  onRecordingComplete,
}: RecorderControlsProps) {
  const { status, steps, isConnected, start, stop, capture, removeStep } =
    useRecorder();
  const { toast } = useToast();
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [removingStepIndex, setRemovingStepIndex] = useState<number | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll step list
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      // Use visualKey if present, or title to generate one
      // Pass targetUrl/targetId to connect to specific Chrome tab
      // Pass scenarioUrl as the URL to save with the scenario (defaults to targetUrl)
      await start({
        visualKey,
        title: visualTitle || "Untitled Visual",
        targetUrl,
        targetId,
        scenarioUrl, // Custom URL to save with the scenario
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async (save: boolean) => {
    if (save) {
      setIsStopping(true);
    } else {
      setIsCancelling(true);
    }
    try {
      await stop(save);
      toast({
        title: save ? "Recording Saved" : "Recording Cancelled",
        description: save
          ? "Your scenario has been saved."
          : "Recording was discarded.",
        variant: save ? "success" : "default",
      });
      // Pass the visualKey so the parent can navigate to the correct scenario
      if (save && onRecordingComplete) {
        onRecordingComplete(status.visualKey);
      } else if (onRecordingComplete) {
        onRecordingComplete();
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsStopping(false);
      setIsCancelling(false);
    }
  };

  const handleCapture = async () => {
    try {
      await capture({
        outputFilename: `${status.visualKey}-${Date.now()}.png`,
      });
      toast({ title: "Screenshot Captured", variant: "success" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveStep = async (index: number) => {
    setRemovingStepIndex(index);
    try {
      await removeStep(index);
      toast({ title: "Step Removed", variant: "success" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRemovingStepIndex(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. STATUS BAR & CONTROLS */}
      <Card className={status.active ? "border-green-500/50" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">
                {status.active ? "Recording Active" : "Ready to Record"}
              </CardTitle>
              {status.active && (
                <Badge variant="default" className="animate-pulse bg-red-500">
                  LIVE
                </Badge>
              )}
            </div>
            {isConnected ? (
              <Badge
                variant="outline"
                className="text-green-500 border-green-500/30"
              >
                System Connected
              </Badge>
            ) : (
              <Badge variant="destructive">System Disconnected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!status.active ? (
            <Button
              onClick={handleStart}
              disabled={isStarting || !isConnected}
              className="w-full"
            >
              {isStarting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Video className="mr-2 h-4 w-4" />
              )}
              Start Recording
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  onClick={handleCapture}
                  variant="secondary"
                  className="flex-1"
                >
                  <Circle className="mr-2 h-4 w-4 fill-current" />
                  Capture Screen
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleStop(false)}
                  variant="outline"
                  disabled={isCancelling || isStopping}
                  className="flex-1"
                >
                  {isCancelling ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-2 h-4 w-4" />
                  )}
                  Cancel
                </Button>
                <Button
                  onClick={() => handleStop(true)}
                  variant="default"
                  disabled={isStopping || isCancelling}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isStopping ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Stop & Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {steps.length} step{steps.length !== 1 ? "s" : ""} recorded
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. LIVE ACTION LOG (The missing piece) */}
      {status.active && (
        <Card className="h-64 flex flex-col">
          <CardHeader className="py-3 border-b bg-muted/30">
            <CardTitle className="text-xs font-mono uppercase text-muted-foreground">
              Live Action Log
            </CardTitle>
          </CardHeader>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs"
          >
            {steps.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                Interact with the browser window to see actions here...
              </div>
            )}
            {steps.map((step, i) => (
              <div
                key={i}
                className="group flex items-start gap-2 p-2 rounded bg-muted/50 border border-transparent hover:border-border transition-colors"
              >
                <div className="mt-0.5 text-muted-foreground">
                  {step.action === "click" && (
                    <MousePointer2 className="h-3 w-3" />
                  )}
                  {step.action === "type" && <Type className="h-3 w-3" />}
                  {step.action === "screenshot" && <Eye className="h-3 w-3" />}
                </div>
                <div className="flex-1 break-all">
                  <span className="font-bold text-primary">
                    {step.action.toUpperCase()}
                  </span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span className="bg-background px-1 rounded border">
                    {step.selector || "page"}
                  </span>
                  {step.text && (
                    <div className="mt-1 text-muted-foreground">
                      Value: "{step.text}"
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveStep(i)}
                  disabled={removingStepIndex !== null}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 hover:text-red-600 rounded"
                  title="Remove this step"
                >
                  {removingStepIndex === i ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
