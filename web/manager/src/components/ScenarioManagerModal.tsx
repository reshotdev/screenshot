import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Search,
  Plus,
  Minus,
  Check,
  FileText,
  Filter,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Scenario {
  key: string;
  name: string;
  url?: string;
  steps?: unknown[];
}

interface ScenarioManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceScenarios: string[];
  allScenarios: Scenario[];
  onScenariosChange: () => void;
}

type SortOption = "name" | "key" | "steps";
type FilterOption = "all" | "in-workspace" | "not-in-workspace";

export default function ScenarioManagerModal({
  open,
  onOpenChange,
  workspaceScenarios,
  allScenarios,
  onScenariosChange,
}: ScenarioManagerModalProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [loading, setLoading] = useState<Set<string>>(new Set());

  // Reset search when modal opens
  useEffect(() => {
    if (open) {
      setSearch("");
    }
  }, [open]);

  // Check if a scenario is in the workspace
  const isInWorkspace = (key: string) => workspaceScenarios.includes(key);

  // Filter and sort scenarios
  const filteredScenarios = useMemo(() => {
    let result = [...allScenarios];

    // Apply text search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(searchLower) ||
          s.key.toLowerCase().includes(searchLower) ||
          s.url?.toLowerCase().includes(searchLower)
      );
    }

    // Apply filter
    if (filterBy === "in-workspace") {
      result = result.filter((s) => isInWorkspace(s.key));
    } else if (filterBy === "not-in-workspace") {
      result = result.filter((s) => !isInWorkspace(s.key));
    }

    // Apply sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "key":
          return a.key.localeCompare(b.key);
        case "steps":
          return (b.steps?.length || 0) - (a.steps?.length || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [allScenarios, search, filterBy, sortBy, workspaceScenarios]);

  // Toggle scenario in workspace
  const toggleScenario = async (scenarioKey: string) => {
    const inWorkspace = isInWorkspace(scenarioKey);
    setLoading((prev) => new Set(prev).add(scenarioKey));

    try {
      if (inWorkspace) {
        // Remove from workspace
        const response = await fetch(
          `/api/workspace/scenarios/${encodeURIComponent(scenarioKey)}`,
          { method: "DELETE" }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to remove scenario");
        }
        toast({
          title: "Removed",
          description: `${scenarioKey} removed from workspace`,
        });
      } else {
        // Add to workspace
        const response = await fetch("/api/workspace/scenarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioKeys: [scenarioKey] }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to add scenario");
        }
        toast({
          title: "Added",
          description: `${scenarioKey} added to workspace`,
        });
      }
      onScenariosChange();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Operation failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(scenarioKey);
        return next;
      });
    }
  };

  // Add all visible scenarios
  const addAllVisible = async () => {
    const toAdd = filteredScenarios.filter((s) => !isInWorkspace(s.key));
    if (toAdd.length === 0) return;

    setLoading(new Set(toAdd.map((s) => s.key)));

    try {
      const response = await fetch("/api/workspace/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioKeys: toAdd.map((s) => s.key) }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add scenarios");
      }
      toast({
        title: "Added",
        description: `Added ${toAdd.length} scenarios to workspace`,
      });
      onScenariosChange();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Operation failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(new Set());
    }
  };

  // Remove all from workspace
  const removeAllFromWorkspace = async () => {
    const toRemove = filteredScenarios.filter((s) => isInWorkspace(s.key));
    if (toRemove.length === 0) return;

    setLoading(new Set(toRemove.map((s) => s.key)));

    try {
      // Remove one by one
      for (const scenario of toRemove) {
        await fetch(
          `/api/workspace/scenarios/${encodeURIComponent(scenario.key)}`,
          { method: "DELETE" }
        );
      }
      toast({
        title: "Removed",
        description: `Removed ${toRemove.length} scenarios from workspace`,
      });
      onScenariosChange();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Operation failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(new Set());
    }
  };

  const inWorkspaceCount = allScenarios.filter((s) =>
    isInWorkspace(s.key)
  ).length;
  const notInWorkspaceCount = allScenarios.length - inWorkspaceCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Workspace Scenarios</DialogTitle>
          <DialogDescription>
            Add or remove scenarios from your workspace. {inWorkspaceCount} of{" "}
            {allScenarios.length} scenarios selected.
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filters */}
        <div className="space-y-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search scenarios..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter buttons */}
            <div className="flex items-center gap-1 text-xs">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Button
                variant={filterBy === "all" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilterBy("all")}
              >
                All ({allScenarios.length})
              </Button>
              <Button
                variant={filterBy === "in-workspace" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilterBy("in-workspace")}
              >
                In Workspace ({inWorkspaceCount})
              </Button>
              <Button
                variant={
                  filterBy === "not-in-workspace" ? "secondary" : "ghost"
                }
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilterBy("not-in-workspace")}
              >
                Available ({notInWorkspaceCount})
              </Button>
            </div>

            <div className="flex-1" />

            {/* Sort dropdown */}
            <div className="flex items-center gap-1 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <Button
                variant={sortBy === "name" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortBy("name")}
              >
                Name
              </Button>
              <Button
                variant={sortBy === "key" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortBy("key")}
              >
                Key
              </Button>
              <Button
                variant={sortBy === "steps" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortBy("steps")}
              >
                Steps
              </Button>
            </div>
          </div>

          {/* Bulk actions */}
          {filteredScenarios.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addAllVisible}
                disabled={
                  filteredScenarios.every((s) => isInWorkspace(s.key)) ||
                  loading.size > 0
                }
              >
                <Plus className="h-3 w-3 mr-1" />
                Add All Visible
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={removeAllFromWorkspace}
                disabled={
                  !filteredScenarios.some((s) => isInWorkspace(s.key)) ||
                  loading.size > 0
                }
              >
                <Minus className="h-3 w-3 mr-1" />
                Remove All Visible
              </Button>
            </div>
          )}
        </div>

        {/* Scenario list */}
        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          {filteredScenarios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search
                ? "No scenarios match your search"
                : "No scenarios available"}
            </div>
          ) : (
            <div className="space-y-1 pb-4">
              {filteredScenarios.map((scenario) => {
                const inWs = isInWorkspace(scenario.key);
                const isLoading = loading.has(scenario.key);

                return (
                  <div
                    key={scenario.key}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                      inWs
                        ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                        : "bg-card border-border hover:bg-accent/50"
                    )}
                    onClick={() => !isLoading && toggleScenario(scenario.key)}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        inWs
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary-foreground" />
                      ) : inWs ? (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      ) : null}
                    </div>

                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {scenario.name}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {scenario.key}
                        </span>
                      </div>
                      {scenario.url && (
                        <p className="text-xs text-muted-foreground truncate">
                          {scenario.url}
                        </p>
                      )}
                    </div>

                    <Badge variant="secondary" className="text-xs shrink-0">
                      {scenario.steps?.length || 0} steps
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {inWorkspaceCount} scenario{inWorkspaceCount !== 1 ? "s" : ""} in
            workspace
          </p>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
