import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crop, RotateCcw, Check, X, AlertCircle } from "lucide-react";

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropConfig {
  enabled: boolean;
  region?: CropRegion;
}

interface CropperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  currentCrop?: CropConfig;
  onSave: (cropConfig: CropConfig | null) => void;
  scenarioName?: string;
}

export default function CropperDialog({
  open,
  onOpenChange,
  imageUrl,
  currentCrop,
  onSave,
  scenarioName,
}: CropperDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [cropRect, setCropRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [cropData, setCropData] = useState<CropRegion | null>(currentCrop?.region || null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setImageLoaded(false);
      setImageError(false);
      setCropRect(null);
      setCropData(currentCrop?.region || null);
    }
  }, [open, currentCrop]);

  // Convert screen coordinates to image coordinates
  const screenToImage = useCallback((screenX: number, screenY: number) => {
    if (!imageRef.current || !containerRef.current) return { x: 0, y: 0 };
    
    const imgRect = imageRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    
    const scaleX = imageRef.current.naturalWidth / imgRect.width;
    const scaleY = imageRef.current.naturalHeight / imgRect.height;
    
    const relX = screenX - (imgRect.left - containerRect.left);
    const relY = screenY - (imgRect.top - containerRect.top);
    
    return {
      x: Math.round(relX * scaleX),
      y: Math.round(relY * scaleY),
    };
  }, []);

  // Initialize crop rect from existing crop data when image loads
  useEffect(() => {
    if (imageLoaded && currentCrop?.region && imageRef.current && containerRef.current) {
      const imgRect = imageRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      
      const scaleX = imgRect.width / imageRef.current.naturalWidth;
      const scaleY = imgRect.height / imageRef.current.naturalHeight;
      
      const offsetX = imgRect.left - containerRect.left;
      const offsetY = imgRect.top - containerRect.top;
      
      setCropRect({
        left: offsetX + currentCrop.region.x * scaleX,
        top: offsetY + currentCrop.region.y * scaleY,
        width: currentCrop.region.width * scaleX,
        height: currentCrop.region.height * scaleY,
      });
      setCropData(currentCrop.region);
    }
  }, [imageLoaded, currentCrop]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    const target = e.target as HTMLElement;
    const containerRect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;
    
    // Check if clicking on resize handle
    if (target.dataset.handle) {
      setIsResizing(true);
      setResizeHandle(target.dataset.handle);
      setStartPos({ x: e.clientX, y: e.clientY });
      return;
    }
    
    // Start new crop
    setIsDrawing(true);
    setStartPos({ x, y });
    setCropRect({ left: x, top: y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    
    if (isDrawing) {
      const currentX = e.clientX - containerRect.left;
      const currentY = e.clientY - containerRect.top;
      
      const width = currentX - startPos.x;
      const height = currentY - startPos.y;
      
      setCropRect({
        left: width < 0 ? currentX : startPos.x,
        top: height < 0 ? currentY : startPos.y,
        width: Math.abs(width),
        height: Math.abs(height),
      });
    } else if (isResizing && cropRect && resizeHandle) {
      const deltaX = e.clientX - startPos.x;
      const deltaY = e.clientY - startPos.y;
      
      let newRect = { ...cropRect };
      
      if (resizeHandle.includes('e')) {
        newRect.width = Math.max(10, cropRect.width + deltaX);
      }
      if (resizeHandle.includes('w')) {
        newRect.left = cropRect.left + deltaX;
        newRect.width = Math.max(10, cropRect.width - deltaX);
      }
      if (resizeHandle.includes('s')) {
        newRect.height = Math.max(10, cropRect.height + deltaY);
      }
      if (resizeHandle.includes('n')) {
        newRect.top = cropRect.top + deltaY;
        newRect.height = Math.max(10, cropRect.height - deltaY);
      }
      
      setCropRect(newRect);
      setStartPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    if ((isDrawing || isResizing) && cropRect && cropRect.width > 5 && cropRect.height > 5) {
      // Calculate image coordinates
      const topLeft = screenToImage(cropRect.left, cropRect.top);
      const bottomRight = screenToImage(cropRect.left + cropRect.width, cropRect.top + cropRect.height);
      
      setCropData({
        x: Math.max(0, topLeft.x),
        y: Math.max(0, topLeft.y),
        width: Math.max(1, bottomRight.x - topLeft.x),
        height: Math.max(1, bottomRight.y - topLeft.y),
      });
    }
    
    setIsDrawing(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const handleReset = () => {
    setCropRect(null);
    setCropData(null);
  };

  const handleSave = () => {
    if (cropData && cropData.width > 0 && cropData.height > 0) {
      onSave({
        enabled: true,
        region: cropData,
      });
    } else {
      onSave(null);
    }
    onOpenChange(false);
  };

  const handleDisableCrop = () => {
    onSave(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5" />
            Configure Crop Region
          </DialogTitle>
          <DialogDescription>
            {scenarioName 
              ? `Drag to select the crop region for "${scenarioName}". This will apply to all captures.`
              : "Drag to select the crop region. This will apply to all captures."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 py-4">
          {!imageUrl ? (
            <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No reference image available.</p>
                <p className="text-xs mt-1">Run the scenario first to capture an image.</p>
              </div>
            </div>
          ) : imageError ? (
            <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Failed to load image.</p>
              </div>
            </div>
          ) : (
            <div 
              ref={containerRef}
              className="relative mx-auto select-none overflow-auto max-h-[50vh] border rounded-lg bg-zinc-900"
              style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Reference screenshot"
                className="block max-w-full"
                style={{ maxHeight: '50vh' }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                draggable={false}
              />
              
              {/* Crop rectangle overlay */}
              {cropRect && cropRect.width > 0 && cropRect.height > 0 && (
                <div
                  className="absolute border-2 border-green-500 bg-green-500/10 pointer-events-none"
                  style={{
                    left: cropRect.left,
                    top: cropRect.top,
                    width: cropRect.width,
                    height: cropRect.height,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {/* Resize handles */}
                  <div data-handle="nw" className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-green-500 border border-white cursor-nw-resize pointer-events-auto" />
                  <div data-handle="ne" className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-green-500 border border-white cursor-ne-resize pointer-events-auto" />
                  <div data-handle="sw" className="absolute -left-1.5 -bottom-1.5 w-3 h-3 bg-green-500 border border-white cursor-sw-resize pointer-events-auto" />
                  <div data-handle="se" className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-green-500 border border-white cursor-se-resize pointer-events-auto" />
                  <div data-handle="n" className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 bg-green-500 border border-white cursor-n-resize pointer-events-auto" />
                  <div data-handle="s" className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-green-500 border border-white cursor-s-resize pointer-events-auto" />
                  <div data-handle="w" className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-green-500 border border-white cursor-w-resize pointer-events-auto" />
                  <div data-handle="e" className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-green-500 border border-white cursor-e-resize pointer-events-auto" />
                </div>
              )}
            </div>
          )}
          
          {/* Crop info */}
          {cropData && (
            <div className="mt-3 p-2 bg-muted rounded text-xs font-mono text-center">
              Crop: x={cropData.x}, y={cropData.y}, {cropData.width}×{cropData.height}px
            </div>
          )}
        </div>
        
        <DialogFooter className="flex-shrink-0 gap-2">
          {currentCrop?.enabled && (
            <Button variant="outline" onClick={handleDisableCrop} className="mr-auto">
              <X className="h-4 w-4 mr-2" />
              Disable Crop
            </Button>
          )}
          <Button variant="outline" onClick={handleReset} disabled={!cropRect}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!imageUrl || (!cropData && !currentCrop?.enabled)}>
            <Check className="h-4 w-4 mr-2" />
            Save Crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
