import { useState, useEffect } from "react";
import { Image, FileImage, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import ImageViewer from "./ImageViewer";
import VideoPlayer from "./VideoPlayer";

interface AssetPreviewProps {
  url: string;
  filename: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  showControls?: boolean;
}

export default function AssetPreview({
  url,
  filename,
  className,
  size = "md",
  showControls = true,
}: AssetPreviewProps) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Reset loading/error state when URL changes
  useEffect(() => {
    setImageError(false);
    setImageLoading(true);
  }, [url]);

  const ext = filename.toLowerCase().split(".").pop();
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext || "");
  const isVideo = ["mp4", "webm", "mov"].includes(ext || "");

  const sizeClasses = {
    sm: "h-16 w-24",
    md: "h-32 w-48",
    lg: "h-64 w-96",
  };

  if (isImage) {
    return (
      <>
        <div
          className={cn(
            "relative rounded-md border border-border overflow-hidden bg-muted cursor-pointer group",
            sizeClasses[size],
            className
          )}
          onClick={() => setIsViewerOpen(true)}
        >
          {imageError ? (
            <div className="flex items-center justify-center h-full flex-col gap-1">
              <FileImage className="h-6 w-6 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Failed to load
              </span>
            </div>
          ) : (
            <>
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                </div>
              )}
              <img
                src={url}
                alt={filename}
                className={cn(
                  "w-full h-full object-contain transition-opacity",
                  imageLoading ? "opacity-0" : "opacity-100"
                )}
                loading="lazy"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
              />
            </>
          )}
          {showControls && !imageLoading && !imageError && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <Image className="h-6 w-6 text-white" />
            </div>
          )}
        </div>
        {isViewerOpen && (
          <ImageViewer
            url={url}
            filename={filename}
            onClose={() => setIsViewerOpen(false)}
          />
        )}
      </>
    );
  }

  if (isVideo) {
    // Small size: simple thumbnail with play icon (controls too small to use)
    if (size === "sm") {
      return (
        <div
          className={cn(
            "relative rounded-md border border-border overflow-hidden bg-muted group cursor-pointer",
            sizeClasses[size],
            className
          )}
        >
          <video
            src={url}
            className="w-full h-full object-contain"
            preload="metadata"
            muted
            playsInline
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="rounded-full bg-black/50 p-1">
              <Play className="h-3 w-3 text-white fill-white" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "rounded-md border border-border overflow-hidden bg-muted",
          sizeClasses[size],
          className
        )}
      >
        <VideoPlayer url={url} filename={filename} />
      </div>
    );
  }

  // Fallback for unknown file types
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted flex items-center justify-center",
        sizeClasses[size],
        className
      )}
    >
      <FileImage className="h-8 w-8 text-muted-foreground" />
    </div>
  );
}
