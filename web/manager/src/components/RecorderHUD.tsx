import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRecorder } from "@/contexts/RecorderContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, Square, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import RecorderControls from "./RecorderControls";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface RecorderHUDProps {
  onRecordComplete?: () => void;
}

export default function RecorderHUD({ onRecordComplete }: RecorderHUDProps) {
  const navigate = useNavigate();
  const { status, isConnected, lastEvent, error, stop } = useRecorder();
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [recordTitle, setRecordTitle] = useState("");

  // Automatically open the detailed controls when recording starts
  useEffect(() => {
    if (status.active) {
      setIsRecordDialogOpen(true);
    }
  }, [status.active]);

  const handleStartClick = () => {
    setIsRecordDialogOpen(true);
  };

  const handleStopClick = async (save: boolean) => {
    try {
      const visualKey = status.visualKey;
      await stop(save);
      setIsRecordDialogOpen(false);
      setRecordTitle("");

      // Navigate to scenario detail if we have a visualKey
      if (save && visualKey) {
        navigate(`/scenarios/${visualKey}`);
      }

      if (onRecordComplete) {
        onRecordComplete();
      }
    } catch (err) {
      // Error is handled by RecorderContext
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50 border border-border/50">
        <AlertCircle className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">
          Recorder: Not connected
        </span>
      </div>
    );
  }

  if (!status.active) {
    return (
      <>
        <Button
          onClick={handleStartClick}
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] gap-1"
        >
          <Video className="h-3 w-3" />
          Record
        </Button>
        <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record New Visual</DialogTitle>
              <DialogDescription className="text-xs">
                Create a new visual by recording steps in your application
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block">
                  Visual Title
                </label>
                <input
                  type="text"
                  value={recordTitle}
                  onChange={(e) => setRecordTitle(e.target.value)}
                  placeholder="e.g., Login Flow"
                  className="w-full px-2 py-1.5 text-xs border rounded-md"
                />
              </div>
              <RecorderControls
                visualTitle={recordTitle}
                onRecordingComplete={() => {
                  const visualKey = status.visualKey;
                  setIsRecordDialogOpen(false);
                  setRecordTitle("");

                  // Navigate to scenario detail if we have a visualKey
                  if (visualKey) {
                    navigate(`/scenarios/${visualKey}`);
                  }

                  if (onRecordComplete) {
                    onRecordComplete();
                  }
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Active recording state
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1 rounded-md border cursor-pointer transition-colors",
          "bg-primary/10 border-primary/30 hover:bg-primary/15"
        )}
        onClick={() => setIsRecordDialogOpen(true)}
      >
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] font-medium">Recording</span>
        {status.stepsCount !== undefined && status.stepsCount > 0 && (
          <Badge variant="secondary" className="h-4 px-1 text-[9px]">
            {status.stepsCount} step{status.stepsCount !== 1 ? "s" : ""}
          </Badge>
        )}
        {lastEvent && (
          <span className="text-[9px] text-muted-foreground truncate max-w-[200px]">
            Last: {lastEvent.action}{" "}
            {lastEvent.selector ? `on ${lastEvent.selector}` : ""}
          </span>
        )}
        {status.url && (
          <span className="text-[9px] text-muted-foreground truncate max-w-[150px] font-mono">
            {new URL(status.url).hostname}
          </span>
        )}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            handleStopClick(true);
          }}
          size="sm"
          variant="destructive"
          className="h-5 px-2 text-[9px] gap-1"
        >
          <Square className="h-2.5 w-2.5" />
          Stop
        </Button>
      </div>
      <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
        <DialogContent className="max-w-2xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Recording Session</DialogTitle>
            <DialogDescription className="text-xs">
              {status.url && (
                <span className="font-mono text-[10px]">{status.url}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <div className="p-2 rounded-md bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  <span>{error}</span>
                </div>
              </div>
            )}
            <RecorderControls
              visualKey={status.visualKey}
              visualTitle={recordTitle}
              onRecordingComplete={() => {
                setIsRecordDialogOpen(false);
                if (onRecordComplete) {
                  onRecordComplete();
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
