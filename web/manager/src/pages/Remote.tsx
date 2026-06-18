import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PlatformVisualCard from "@/components/PlatformVisualCard";
import { Globe, Eye } from "lucide-react";

interface Visual {
  id: string;
  name: string;
  key: string;
  status?: string;
  [key: string]: any;
}

interface ReviewItem {
  id: string;
  visualId: string;
  status: string;
  [key: string]: any;
}

export default function Remote() {
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"visuals" | "review">("visuals");
  const [visualsError, setVisualsError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [localScenarios, setLocalScenarios] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load local scenarios for sync status
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        const scenarios = data.config?.scenarios || [];
        setLocalScenarios(new Set(scenarios.map((s: any) => s.key)));
      })
      .catch(() => {});

    Promise.all([
      fetch("/api/remote/visuals")
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setVisualsError(data.error);
            setVisuals([]);
          } else {
            setVisuals(data.visuals || []);
            setVisualsError(null);
          }
        })
        .catch((err) => {
          console.error("Failed to load visuals:", err);
          setVisualsError("Failed to fetch visuals from platform");
          setVisuals([]);
        }),
      fetch("/api/remote/review-queue")
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setReviewError(data.error);
            setReviewQueue([]);
          } else {
            setReviewQueue(data.queue || []);
            setReviewError(null);
          }
        })
        .catch((err) => {
          console.error("Failed to load review queue:", err);
          setReviewError("Failed to fetch review queue from platform");
          setReviewQueue([]);
        }),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Remote Platform State</h1>
        <p className="text-muted-foreground mt-2">
          View visuals and review queue from the Reshot platform (read-only)
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("visuals")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "visuals"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Globe className="h-4 w-4 inline mr-2" />
          Visuals ({visuals.length})
        </button>
        <button
          onClick={() => setActiveTab("review")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "review"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye className="h-4 w-4 inline mr-2" />
          Review Queue ({reviewQueue.length})
        </button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading remote data...</div>
      ) : activeTab === "visuals" ? (
        visualsError ? (
          <Card className="dagster-card border-warning/50">
            <CardHeader>
              <CardTitle>Unable to Load Visuals</CardTitle>
              <CardDescription>
                {visualsError.includes("401") ||
                visualsError.includes("unauthorized")
                  ? "Authentication required. Please check your API key in settings."
                  : visualsError.includes("404")
                  ? "Visuals endpoint not available. This may not be configured on the platform yet."
                  : visualsError}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Remote visuals are read-only views from the Reshot platform. If
                this endpoint is not configured or requires different
                authentication, you can still use the local CLI workflow.
              </p>
            </CardContent>
          </Card>
        ) : visuals.length === 0 ? (
          <Card className="dagster-card">
            <CardHeader>
              <CardTitle>No Visuals</CardTitle>
              <CardDescription>
                No visuals found on the platform. Publish assets to create
                visuals.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visuals.map((visual) => {
              const isLocal = localScenarios.has(visual.key);
              const syncStatus = isLocal ? "synced" : "remote-only";

              return (
                <PlatformVisualCard
                  key={visual.id}
                  visual={visual}
                  localScenarioKey={isLocal ? visual.key : undefined}
                  syncStatus={syncStatus}
                  onOpenInBrowser={(visualId) => {
                    // Open in platform (would need platform URL from settings)
                    window.open(`/app/projects/${visualId}`, "_blank");
                  }}
                />
              );
            })}
          </div>
        )
      ) : reviewError ? (
        <Card className="dagster-card border-warning/50">
          <CardHeader>
            <CardTitle>Unable to Load Review Queue</CardTitle>
            <CardDescription>
              {reviewError.includes("401") ||
              reviewError.includes("unauthorized")
                ? "Authentication required. Please check your API key in settings."
                : reviewError.includes("404")
                ? "Review queue endpoint not available. This may not be configured on the platform yet."
                : reviewError}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The review queue shows items pending approval on the platform. If
              this endpoint is not configured, you can still manage reviews
              through the platform UI.
            </p>
          </CardContent>
        </Card>
      ) : reviewQueue.length === 0 ? (
        <Card className="dagster-card">
          <CardHeader>
            <CardTitle>Empty Review Queue</CardTitle>
            <CardDescription>
              No items pending review on the platform.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviewQueue.map((item) => (
            <Card key={item.id} className="dagster-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">Review Item</CardTitle>
                  <Badge
                    variant={
                      item.status === "approved" ? "approved" : "pending"
                    }
                  >
                    {item.status === "approved" ? "Approved" : item.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <div>
                    <span className="font-medium">Visual ID:</span>{" "}
                    <span className="font-mono text-xs">{item.visualId}</span>
                  </div>
                  <div>
                    <span className="font-medium">Item ID:</span>{" "}
                    <span className="font-mono text-xs">{item.id}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
