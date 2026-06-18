import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface PlatformVisualCardProps {
  visual: {
    id: string;
    name?: string;
    key: string;
    status?: string;
    thumbnailUrl?: string;
    [key: string]: any;
  };
  localScenarioKey?: string;
  syncStatus?: 'synced' | 'out-of-sync' | 'local-only' | 'remote-only';
  onOpenInBrowser?: (visualId: string) => void;
}

export default function PlatformVisualCard({
  visual,
  localScenarioKey,
  syncStatus,
  onOpenInBrowser,
}: PlatformVisualCardProps) {
  const getStatusIcon = () => {
    switch (visual.status) {
      case 'approved':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getSyncStatusBadge = () => {
    if (!syncStatus) return null;

    const variants = {
      'synced': { variant: 'default' as const, label: 'Synced' },
      'out-of-sync': { variant: 'secondary' as const, label: 'Out of Sync' },
      'local-only': { variant: 'outline' as const, label: 'Local Only' },
      'remote-only': { variant: 'outline' as const, label: 'Remote Only' },
    };

    const config = variants[syncStatus];
    return (
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    );
  };

  return (
    <Card className="dagster-card group hover:border-primary transition-colors">
      {visual.thumbnailUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-t-md bg-muted">
          <img
            src={visual.thumbnailUrl}
            alt={visual.name || visual.key}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <CardHeader className="px-4 py-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
              {visual.name || visual.key}
            </CardTitle>
            <CardDescription className="font-mono text-[10px] mt-1 text-muted-foreground">
              {visual.key}
            </CardDescription>
          </div>
          {visual.status && (
            <div className="flex items-center gap-1">
              {getStatusIcon()}
              <Badge
                variant={
                  visual.status === 'approved'
                    ? 'default'
                    : visual.status === 'pending'
                    ? 'secondary'
                    : 'destructive'
                }
                className="text-[10px] h-4 px-1.5"
              >
                {visual.status}
              </Badge>
            </div>
          )}
        </div>
        {syncStatus && (
          <div className="mt-2">
            {getSyncStatusBadge()}
          </div>
        )}
        {localScenarioKey && localScenarioKey !== visual.key && (
          <div className="mt-2">
            <Badge variant="outline" className="text-xs">
              Local: {localScenarioKey}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground font-mono">
            ID: {visual.id.slice(0, 8)}...
          </div>
          {onOpenInBrowser && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onOpenInBrowser(visual.id)}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

