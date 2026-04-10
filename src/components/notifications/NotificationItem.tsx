import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle, 
  AlertCircle, 
  MessageSquare, 
  RefreshCw, 
  Star,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Notification } from '@/hooks/useNotifications';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  ticket_created: CheckCircle,
  new_ticket_alert: AlertCircle,
  new_message: MessageSquare,
  status_updated: RefreshCw,
  feedback_request: Star,
};

const iconColorMap: Record<string, string> = {
  ticket_created: 'text-green-500',
  new_ticket_alert: 'text-orange-500',
  new_message: 'text-blue-500',
  status_updated: 'text-purple-500',
  feedback_request: 'text-yellow-500',
};

export function NotificationItem({ 
  notification, 
  onMarkAsRead, 
  onDelete,
  onClose 
}: NotificationItemProps) {
  const navigate = useNavigate();
  const Icon = iconMap[notification.tipo] || AlertCircle;
  const iconColor = iconColorMap[notification.tipo] || 'text-muted-foreground';

  const handleClick = () => {
    if (!notification.lida) {
      onMarkAsRead(notification.id);
    }
    
    if (notification.ticket_id) {
      navigate(`/ticket/${notification.ticket_id}`);
      onClose?.();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(notification.id);
  };

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ptBR
  });

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors group relative",
        notification.lida 
          ? "bg-background hover:bg-muted/50" 
          : "bg-primary/5 hover:bg-primary/10"
      )}
    >
      <div className={cn("mt-0.5 flex-shrink-0", iconColor)}>
        <Icon className="h-5 w-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            "text-sm leading-tight",
            notification.lida ? "font-normal" : "font-semibold"
          )}>
            {notification.titulo}
          </p>
          
          {!notification.lida && (
            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary" />
          )}
        </div>
        
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {notification.mensagem}
        </p>
        
        <p className="text-xs text-muted-foreground mt-1">
          {timeAgo}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={handleDelete}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
