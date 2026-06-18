import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobStatusBadgeProps {
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  className?: string;
}

export default function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  const getIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'failed':
        return <XCircle className="h-3 w-3" />;
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getVariant = (): 'default' | 'secondary' | 'destructive' => {
    switch (status) {
      case 'success':
        return 'default';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <Badge variant={getVariant()} className={cn('text-[10px] h-5 px-2 font-medium flex items-center gap-1', className)}>
      {getIcon()}
      {status}
    </Badge>
  );
}


