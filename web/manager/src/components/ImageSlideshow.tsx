import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Download,
  Grid,
} from "lucide-react";

interface Asset {
  path: string;
  relativePath: string;
  filename: string;
  size: number;
  mtime: string;
  url: string;
}

interface ImageSlideshowProps {
  assets: Asset[];
  title?: string;
  autoPlayInterval?: number;
  onAssetClick?: (asset: Asset) => void;
  // Controlled mode - external index management
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  // Controlled view mode
  viewMode?: "slideshow" | "grid";
  onViewModeChange?: (mode: "slideshow" | "grid") => void;
}

export default function ImageSlideshow({
  assets,
  title = "Step-by-Step Images",
  autoPlayInterval = 2000,
  onAssetClick,
  currentIndex: controlledIndex,
  onIndexChange,
  viewMode: controlledViewMode,
  onViewModeChange,
}: ImageSlideshowProps) {
  // Support both controlled and uncontrolled modes
  const [internalIndex, setInternalIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [internalViewMode, setInternalViewMode] = useState<
    "slideshow" | "grid"
  >("slideshow");

  // Use controlled values if provided, otherwise use internal state
  const currentIndex = controlledIndex ?? internalIndex;
  const viewMode = controlledViewMode ?? internalViewMode;

  const setCurrentIndex = useCallback(
    (indexOrUpdater: number | ((prev: number) => number)) => {
      const newIndex =
        typeof indexOrUpdater === "function"
          ? indexOrUpdater(currentIndex)
          : indexOrUpdater;

      if (onIndexChange) {
        onIndexChange(newIndex);
      } else {
        setInternalIndex(newIndex);
      }
    },
    [currentIndex, onIndexChange]
  );

  const setViewMode = useCallback(
    (mode: "slideshow" | "grid") => {
      if (onViewModeChange) {
        onViewModeChange(mode);
      } else {
        setInternalViewMode(mode);
      }
    },
    [onViewModeChange]
  );

  // Filter to only image assets
  const imageAssets = assets.filter(
    (a) =>
      a.filename.endsWith(".png") ||
      a.filename.endsWith(".jpg") ||
      a.filename.endsWith(".jpeg") ||
      a.filename.endsWith(".webp")
  );

  // Sort by filename to maintain step order
  const sortedAssets = [...imageAssets].sort((a, b) => {
    // Extract step number from filename like "step-0_before.png"
    const aMatch = a.filename.match(/step-(\d+)/);
    const bMatch = b.filename.match(/step-(\d+)/);
    if (aMatch && bMatch) {
      const aNum = parseInt(aMatch[1]);
      const bNum = parseInt(bMatch[1]);
      if (aNum !== bNum) return aNum - bNum;
      // If same step number, sort by before/after
      const aIsBefore = a.filename.includes("before");
      const bIsBefore = b.filename.includes("before");
      return aIsBefore === bIsBefore ? 0 : aIsBefore ? -1 : 1;
    }
    return a.filename.localeCompare(b.filename);
  });

  const currentAsset = sortedAssets[currentIndex];
  const progress =
    sortedAssets.length > 0
      ? ((currentIndex + 1) / sortedAssets.length) * 100
      : 0;

  const goToNext = useCallback(() => {
    if (currentIndex < sortedAssets.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else if (isPlaying) {
      setIsPlaying(false);
    }
  }, [currentIndex, sortedAssets.length, isPlaying]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const goToFirst = () => setCurrentIndex(0);
  const goToLast = () => setCurrentIndex(sortedAssets.length - 1);

  // Keyboard navigation - only when no modal/sheet is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== "slideshow") return;

      // Don't handle if a modal/sheet overlay is present (z-50 class)
      const hasOverlay = document.querySelector(".fixed.inset-0.z-50");
      if (hasOverlay) return;

      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "Home") {
        e.preventDefault();
        goToFirst();
      } else if (e.key === "End") {
        e.preventDefault();
        goToLast();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrev, viewMode]);

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(goToNext, autoPlayInterval);
    return () => clearInterval(interval);
  }, [isPlaying, goToNext, autoPlayInterval]);

  // Parse step info from filename
  const parseStepInfo = (filename: string) => {
    const match = filename.match(/step-(\d+)_(before|after)/);
    if (match) {
      return {
        stepNumber: parseInt(match[1]),
        phase: match[2] as "before" | "after",
      };
    }
    return null;
  };

  if (sortedAssets.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <p>No images to display.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (viewMode === "grid") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{title}</CardTitle>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("slideshow")}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Slideshow
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {sortedAssets.map((asset, idx) => {
              const stepInfo = parseStepInfo(asset.filename);
              return (
                <div
                  key={idx}
                  className="relative group cursor-pointer rounded-md overflow-hidden border hover:border-primary transition-colors"
                  onClick={() => {
                    setCurrentIndex(idx);
                    setViewMode("slideshow");
                  }}
                >
                  <img
                    src={asset.url}
                    alt={asset.filename}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white font-mono">
                        {stepInfo
                          ? `Step ${stepInfo.stepNumber}`
                          : asset.filename}
                      </span>
                      {stepInfo && (
                        <Badge
                          variant={
                            stepInfo.phase === "before"
                              ? "secondary"
                              : "default"
                          }
                          className="text-[8px] h-4"
                        >
                          {stepInfo.phase}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  const stepInfo = currentAsset ? parseStepInfo(currentAsset.filename) : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{title}</CardTitle>
            <Badge variant="outline" className="text-xs">
              {currentIndex + 1} / {sortedAssets.length}
            </Badge>
            {stepInfo && (
              <>
                <Badge variant="secondary" className="text-xs">
                  Step {stepInfo.stepNumber}
                </Badge>
                <Badge
                  variant={stepInfo.phase === "before" ? "outline" : "default"}
                  className="text-xs"
                >
                  {stepInfo.phase === "before" ? "Before" : "After"}
                </Badge>
              </>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("grid")}
              title="View as grid"
            >
              <Grid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                currentAsset && window.open(currentAsset.url, "_blank")
              }
              title="Open full size"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => currentAsset && onAssetClick?.(currentAsset)}
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Main Image */}
        <div className="relative bg-black aspect-video flex items-center justify-center">
          {currentAsset && (
            <img
              src={currentAsset.url}
              alt={currentAsset.filename}
              className="max-w-full max-h-full object-contain"
            />
          )}

          {/* Navigation overlay - left side */}
          <button
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className="absolute left-0 top-0 bottom-0 w-1/4 flex items-center justify-start pl-4 opacity-0 hover:opacity-100 transition-opacity disabled:cursor-not-allowed group"
          >
            <div className="bg-black/50 rounded-full p-2 group-hover:bg-black/70 transition-colors">
              <ChevronLeft className="h-6 w-6 text-white" />
            </div>
          </button>

          {/* Navigation overlay - right side */}
          <button
            onClick={goToNext}
            disabled={currentIndex === sortedAssets.length - 1}
            className="absolute right-0 top-0 bottom-0 w-1/4 flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-opacity disabled:cursor-not-allowed group"
          >
            <div className="bg-black/50 rounded-full p-2 group-hover:bg-black/70 transition-colors">
              <ChevronRight className="h-6 w-6 text-white" />
            </div>
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 py-2 bg-muted/30">
          <Progress value={progress} className="h-1" />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToFirst}
              disabled={currentIndex === 0}
              title="First (Home)"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrev}
              disabled={currentIndex === 0}
              title="Previous (←)"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={isPlaying ? "default" : "outline"}
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause" : "Play (Space)"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNext}
              disabled={currentIndex === sortedAssets.length - 1}
              title="Next (→)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToLast}
              disabled={currentIndex === sortedAssets.length - 1}
              title="Last (End)"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            {currentAsset?.filename}
          </div>
        </div>

        {/* Thumbnail strip */}
        <div className="border-t px-2 py-2 overflow-x-auto">
          <div className="flex gap-1.5">
            {sortedAssets.map((asset, idx) => {
              const info = parseStepInfo(asset.filename);
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative shrink-0 rounded overflow-hidden border-2 transition-colors ${
                    idx === currentIndex
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <img
                    src={asset.url}
                    alt={asset.filename}
                    className="w-16 h-10 object-cover"
                  />
                  {info && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white text-center py-0.5">
                      {info.stepNumber}
                      {info.phase === "after" ? "a" : "b"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
