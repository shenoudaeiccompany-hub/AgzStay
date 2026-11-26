import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Heart, Home, Menu, X } from 'lucide-react';
import {
  fetchMyNotifications,
  getCurrentAuthUser,
  markAllNotificationsRead,
  markNotificationRead,
  onAuthStateChange,
} from '@/services/agzstayRepository';
import type { AuthUserSummary, RouteSection, UserNotificationRecord } from '@/types/chalet';

interface NavbarProps {
  activeSection: RouteSection;
  favoritesCount: number;
  favoritesOnly: boolean;
  onNavigate: (section: RouteSection) => void;
  onToggleFavoritesOnly: () => void;
  onResetHome: () => void;
}

const NAV_LINKS: { id: RouteSection; label: string; href: string }[] = [
  { id: 'home', label: 'الرئيسية', href: '/' },
  { id: 'bookings', label: 'حجوزاتي', href: '/bookings' },
  { id: 'support', label: 'المساعدة والدعم', href: '/support' },
  { id: 'pricing', label: 'الباقات', href: '/pricing' },
  { id: 'owner', label: 'بوابة المعلن', href: '/owner' },
  { id: 'admin', label: 'الإدارة', href: '/admin' },
];

export function Navbar({
  activeSection,
  favoritesCount,
  favoritesOnly,
  onNavigate,
  onToggleFavoritesOnly,
  onResetHome,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [notifications, setNotifications] = useState<UserNotificationRecord[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    const res = await fetchMyNotifications();
    if (!res.error && res.data) {
      setNotifications(res.data);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const user = await getCurrentAuthUser();
      if (!active) return;
      setAuthUser(user);
      if (user) {
        await loadNotifications();
      }
    };
    void init();

    const unsubscribe = onAuthStateChange((user) => {
      setAuthUser(user);
      if (user) {
        void loadNotifications();
      } else {
        setNotifications([]);
        setNotifOpen(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!notifOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(event.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [notifOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNavClick = (section: RouteSection) => {
    setMobileMenuOpen(false);
    setNotifOpen(false);
    if (section === 'home') {
      onResetHome();
    } else {
      onNavigate(section);
    }
  };

  const handleNotificationClick = async (item: UserNotificationRecord) => {
    if (!item.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      await markNotificationRead(item.id);
    }
    setNotifOpen(false);
    if (item.linkSection) {
      onNavigate(item.linkSection);
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsRead();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[#FAF9F6]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        {/* Minimalist AgzStay Brand */}
        <button
          type="button"
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-3 text-right transition hover:opacity-90 focus:outline-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E3A5F] text-white shadow-xs">
            <Home className="h-5 w-5 text-[#C5A880]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight text-[#1E3A5F] sm:text-xl">
                AgzStay
              </span>
              <span className="text-xs font-semibold text-[#C5A880]">إجازة ستاي</span>
            </div>
            <span className="hidden text-[11px] font-medium text-[#6B7280] sm:block">
              دليل الإيجار الهادئ في مصر
            </span>
          </div>
        </button>

        {/* Clean Desktop Links */}
        <nav className="hidden items-center gap-1.5 md:flex" aria-label="التنقل الرئيسي">
          {NAV_LINKS.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <a
                key={link.id}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(link.id);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-[#1E3A5F] text-white shadow-xs'
                    : 'text-[#1F2937] hover:bg-white hover:text-[#1E3A5F]'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        {/* Notifications, Favorites & Mobile Trigger */}
        <div className="flex items-center gap-2">
          {authUser && (
            <div ref={notifContainerRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next) void loadNotifications();
                }}
                aria-label="الإشعارات"
                aria-expanded={notifOpen}
                className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  notifOpen
                    ? 'border-[#C5A880] bg-[#C5A880]/15 text-[#1E3A5F]'
                    : 'border-stone-200/70 bg-white text-[#1E3A5F] shadow-xs hover:border-stone-300'
                }`}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -left-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className="absolute left-0 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-xl"
                  role="region"
                  aria-label="قائمة الإشعارات"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                    <span className="text-xs font-bold text-[#1E3A5F]">
                      الإشعارات ({unreadCount.toLocaleString('ar-EG')} غير مقروء)
                    </span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleMarkAllRead()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        <span>تحديد الكل كمقروء</span>
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-[#6B7280]">
                      لا توجد إشعارات جديدة لحسابك حالياً.
                    </div>
                  ) : (
                    <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
                      {notifications.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => void handleNotificationClick(item)}
                            className={`w-full px-4 py-3 text-right transition hover:bg-[#FAF9F6] ${
                              item.isRead ? 'bg-white' : 'bg-[#FAF6F0]/70'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[#1E3A5F]">
                                {item.title}
                              </span>
                              {!item.isRead && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-[#C5A880]" />
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#6B7280]">
                              {item.body}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onNavigate('home');
              onToggleFavoritesOnly();
            }}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
              favoritesOnly && activeSection === 'home'
                ? 'border-[#C5A880] bg-[#C5A880]/15 text-[#1E3A5F]'
                : 'border-stone-200/70 bg-white text-[#1F2937] shadow-xs hover:border-stone-300'
            }`}
            aria-label="المفضلة"
          >
            <Heart
              className={`h-4 w-4 ${
                favoritesOnly ? 'fill-[#C5A880] text-[#C5A880]' : 'text-[#6B7280]'
              }`}
            />
            <span className="hidden sm:inline">المفضلة</span>
            {favoritesCount > 0 && (
              <span className="rounded-full bg-[#FAF9F6] px-1.5 py-0.5 text-[11px] font-bold text-[#1E3A5F]">
                {favoritesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="فتح القائمة"
            aria-expanded={mobileMenuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200/70 bg-white text-[#1E3A5F] shadow-xs transition hover:bg-stone-50 md:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Clean Mobile Dropdown */}
      {mobileMenuOpen && (
        <nav
          className="border-t border-stone-200/70 bg-white/95 px-4 py-3 backdrop-blur-md md:hidden"
          aria-label="قائمة الجوال"
        >
          <div className="flex flex-col gap-1.5">
            {NAV_LINKS.map((link) => {
              const isActive = activeSection === link.id;
              return (
                <a
                  key={link.id}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavClick(link.id);
                  }}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[#1E3A5F] text-white'
                      : 'text-[#1F2937] hover:bg-[#FAF9F6]'
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
