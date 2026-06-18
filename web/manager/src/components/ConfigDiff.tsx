import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiffItem {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  path: string;
  local?: any;
  remote?: any;
}

interface ConfigDiffProps {
  localConfig: any;
  remoteConfig: any;
  onSelectiveSync?: (selected: string[]) => void;
}

export default function ConfigDiff({ localConfig, remoteConfig, onSelectiveSync }: ConfigDiffProps) {
  const [diffs, setDiffs] = useState<DiffItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const calculateDiffs = () => {
      const items: DiffItem[] = [];
      const localScenarios = localConfig?.scenarios || [];
      const remoteScenarios = remoteConfig?.scenarios || [];

      const localKeys = new Set(localScenarios.map((s: any) => s.key));
      const remoteKeys = new Set(remoteScenarios.map((s: any) => s.key));

      // Added in remote (not in local)
      remoteScenarios.forEach((remote: any) => {
        if (!localKeys.has(remote.key)) {
          items.push({
            type: 'added',
            path: `scenarios/${remote.key}`,
            remote,
          });
        }
      });

      // Removed from remote (only in local)
      localScenarios.forEach((local: any) => {
        if (!remoteKeys.has(local.key)) {
          items.push({
            type: 'removed',
            path: `scenarios/${local.key}`,
            local,
          });
        }
      });

      // Modified (in both but different)
      localScenarios.forEach((local: any) => {
        const remote = remoteScenarios.find((r: any) => r.key === local.key);
        if (remote && JSON.stringify(local) !== JSON.stringify(remote)) {
          items.push({
            type: 'modified',
            path: `scenarios/${local.key}`,
            local,
            remote,
          });
        }
      });

      setDiffs(items);
      // Auto-select all items
      setSelectedItems(new Set(items.map(item => item.path)));
    };
    
    calculateDiffs();
  }, [localConfig, remoteConfig]);

  const handleToggleItem = (path: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedItems(new Set(diffs.map(item => item.path)));
  };

  const handleDeselectAll = () => {
    setSelectedItems(new Set());
  };

  const getDiffIcon = (type: DiffItem['type']) => {
    switch (type) {
      case 'added':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'removed':
        return <Minus className="h-4 w-4 text-red-500" />;
      case 'modified':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getDiffBadge = (type: DiffItem['type']) => {
    const variants = {
      added: { variant: 'default' as const, className: 'bg-green-500' },
      removed: { variant: 'destructive' as const, className: '' },
      modified: { variant: 'secondary' as const, className: 'bg-yellow-500' },
      unchanged: { variant: 'outline' as const, className: '' },
    };
    const config = variants[type];
    return (
      <Badge variant={config.variant} className={cn('text-xs', config.className)}>
        {type}
      </Badge>
    );
  };

  if (diffs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No differences found between local and remote configurations
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Configuration Differences</CardTitle>
              <CardDescription>
                {diffs.length} difference(s) found between local and remote
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={handleDeselectAll}>
                Deselect All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {diffs.map((diff) => (
              <div
                key={diff.path}
                className={cn(
                  'flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors',
                  selectedItems.has(diff.path)
                    ? 'bg-primary/5 border-primary'
                    : 'hover:bg-accent/50'
                )}
                onClick={() => handleToggleItem(diff.path)}
              >
                <input
                  type="checkbox"
                  checked={selectedItems.has(diff.path)}
                  onChange={() => handleToggleItem(diff.path)}
                  className="cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                {getDiffIcon(diff.type)}
                <div className="flex-1">
                  <div className="font-medium text-sm">{diff.path}</div>
                  {diff.type === 'modified' && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Local: {diff.local?.name || diff.local?.key} • Remote: {diff.remote?.name || diff.remote?.key}
                    </div>
                  )}
                  {diff.type === 'added' && (
                    <div className="text-xs text-muted-foreground mt-1">
                      New scenario: {diff.remote?.name || diff.remote?.key}
                    </div>
                  )}
                  {diff.type === 'removed' && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Local-only scenario: {diff.local?.name || diff.local?.key}
                    </div>
                  )}
                </div>
                {getDiffBadge(diff.type)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {onSelectiveSync && selectedItems.size > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() => onSelectiveSync(Array.from(selectedItems))}
          >
            Sync Selected ({selectedItems.size})
          </Button>
        </div>
      )}
    </div>
  );
}

