import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Inbox,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { AppNotification } from '@/types/chalet';

interface NotificationsBellProps {
  notifications: AppNotification[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onMarkAsRead: (id: string) => Promise<void> | void;
  onMarkAllRead: () => Promise<void> | void;
  onSelectNotification: (notification: AppNotification) => void;
}

function formatNotificationTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function NotificationsBell({
  notifications,
  loading,
  error,
  onRetry,
  onMarkAsRead,
  onMarkAllRead,
  onSelectNotification,
}: NotificationsBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`الإشعارات (${unreadCount} غير مقروء)`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-slate-700 transition hover:bg-slate-50"
      >
        <Bell className={`h-4 w-4 ${unreadCount > 0 ? 'text-secondary-600' : 'text-slate-600'}`} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-extrabold text-white shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="قائمة الإشعارات"
          className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-sand-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary-600" />
              <span className="text-xs font-extrabold text-slate-900">
                الإشعارات ({notifications.length})
              </span>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void onMarkAllRead()}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-secondary-700 shadow-sm hover:bg-secondary-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>تحديد الكل كمقروء</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
                <span>جاري تحميل الإشعارات...</span>
              </div>
            ) : error ? (
              <div className="space-y-2.5 p-5 text-center text-xs">
                <AlertTriangle className="mx-auto h-6 w-6 text-error-500" />
                <p className="font-bold text-error-700">{error}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-primary-600 px-3.5 py-1.5 text-[11px] font-bold text-white hover:bg-primary-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>إعادة المحاولة</span>
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <Inbox className="h-8 w-8 text-slate-300" />
                <p className="text-xs font-bold text-slate-700">لا توجد إشعارات حالياً</p>
                <p className="text-[11px] text-slate-500">
                  ستصلك تنبيهات فورية عند وصول طلبات حجز جديدة أو تحديث حالة الدفع والتوثيق.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!item.isRead) {
                          void onMarkAsRead(item.id);
                        }
                        onSelectNotification(item);
                        setIsOpen(false);
                      }}
                      className={`flex w-full items-start gap-2.5 px-4 py-3 text-right transition hover:bg-sand-50 ${
                        item.isRead ? 'bg-white' : 'bg-secondary-50/45'
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          item.isRead ? 'bg-slate-200' : 'bg-secondary-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-extrabold text-slate-900">
                            {item.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {formatNotificationTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                          {item.body}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
