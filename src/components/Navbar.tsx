import {
  BarChart3,
  Building2,
  CalendarCheck2,
  Heart,
  Home,
  LogIn,
  LogOut,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserCircle2,
} from 'lucide-react';
import { NotificationsBell } from '@/components/NotificationsBell';
import type { AppNotification, AppSectionTab, AppUser, UserMode } from '@/types/chalet';

interface NavbarProps {
  activeSection: AppSectionTab;
  userMode: UserMode;
  favoritesCount: number;
  bookingsCount: number;
  pendingHostInquiriesCount: number;
  pendingAdminVerificationsCount: number;
  renterTrustAverage: number;
  favoritesOnly: boolean;
  currentUser: AppUser | null;
  notifications: AppNotification[];
  notificationsLoading: boolean;
  notificationsError: string | null;
  onRetryNotifications: () => void;
  onMarkNotificationRead: (id: string) => Promise<void> | void;
  onMarkAllNotificationsRead: () => Promise<void> | void;
  onSelectNotification: (notification: AppNotification) => void;
  onSelectSection: (section: AppSectionTab) => void;
  onSwitchUserMode: (mode: UserMode) => void;
  onToggleFavoritesOnly: () => void;
  onOpenBookings: () => void;
  onOpenAddProperty: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onResetFilters: () => void;
}

export function Navbar({
  activeSection,
  userMode,
  favoritesCount,
  bookingsCount,
  pendingHostInquiriesCount,
  pendingAdminVerificationsCount,
  renterTrustAverage,
  favoritesOnly,
  currentUser,
  notifications,
  notificationsLoading,
  notificationsError,
  onRetryNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onSelectNotification,
  onSelectSection,
  onSwitchUserMode,
  onToggleFavoritesOnly,
  onOpenBookings,
  onOpenAddProperty,
  onOpenAuth,
  onSignOut,
  onResetFilters,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-primary-700/15 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              onSwitchUserMode('renter');
              onSelectSection('browse');
              onResetFilters();
            }}
            className="flex items-center gap-2.5 text-right focus:outline-none"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
              <Home className="h-5 w-5 text-sand-100" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-extrabold tracking-tight text-primary-600 sm:text-xl">
                  إجازة ستاي
                </span>
                <span className="rounded-md bg-secondary-50 px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-secondary-600">
                  AgzStay
                </span>
                <span className="hidden items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-bold text-success-700 lg:inline-flex">
                  <ShieldCheck className="h-3 w-3" />
                  كل محافظات مصر
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                شقق مفروشة • استوديوهات • شاليهات وفيلات للإيجار بلا تلاعب
              </p>
            </div>
          </button>

          <nav className="hidden items-center gap-1.5 md:flex" aria-label="التنقل الرئيسي">
            <button
              type="button"
              onClick={() => {
                onSwitchUserMode('renter');
                onSelectSection('browse');
              }}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                activeSection === 'browse'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              تصفح الوحدات
            </button>

            <button
              type="button"
              onClick={() => onSelectSection('price-guide')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                activeSection === 'price-guide'
                  ? 'bg-secondary-500 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-secondary-50 hover:text-secondary-600'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>مؤشر الأسعار</span>
            </button>

            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={() => onSelectSection('admin')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                  activeSection === 'admin'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                <span>الإدارة العامة</span>
                {pendingAdminVerificationsCount > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-900">
                    {pendingAdminVerificationsCount}
                  </span>
                )}
              </button>
            )}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-slate-200 bg-sand-100 p-0.5"
            role="group"
            aria-label="تبديل وضع الاستخدام"
          >
            <button
              type="button"
              onClick={() => onSwitchUserMode('renter')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                userMode === 'renter'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-primary-600'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>مستأجر</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchUserMode('host')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                userMode === 'host'
                  ? 'bg-secondary-500 text-white shadow-sm'
                  : 'text-slate-700 hover:text-secondary-600'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>مالك / وسيط</span>
              {pendingHostInquiriesCount > 0 && (
                <span className="rounded-full bg-warning-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {pendingHostInquiriesCount}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSelectSection('price-guide')}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-bold transition md:hidden ${
              activeSection === 'price-guide'
                ? 'border-secondary-500 bg-secondary-500 text-white'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>الأسعار</span>
          </button>

          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onSelectSection('admin')}
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-bold transition md:hidden ${
                activeSection === 'admin'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <span>الإدارة</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onSwitchUserMode('renter');
              onSelectSection('browse');
              onToggleFavoritesOnly();
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
              favoritesOnly && activeSection === 'browse'
                ? 'border-accent-500 bg-accent-50 text-accent-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            aria-label="عرض المفضلة"
          >
            <Heart className={`h-4 w-4 ${favoritesOnly ? 'fill-accent-500 text-accent-500' : ''}`} />
            <span className="hidden lg:inline">المفضلة</span>
            {favoritesCount > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">
                {favoritesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenBookings}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <CalendarCheck2 className="h-4 w-4 text-secondary-500" />
            <span className="hidden sm:inline">طلباتي</span>
            <span className="hidden rounded-md bg-success-50 px-1.5 py-0.5 text-[10px] font-bold text-success-700 xl:inline">
              ثقة {renterTrustAverage.toFixed(1)}★
            </span>
            {bookingsCount > 0 && (
              <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                {bookingsCount}
              </span>
            )}
          </button>

          {currentUser && (
            <NotificationsBell
              notifications={notifications}
              loading={notificationsLoading}
              error={notificationsError}
              onRetry={onRetryNotifications}
              onMarkAsRead={onMarkNotificationRead}
              onMarkAllRead={onMarkAllNotificationsRead}
              onSelectNotification={onSelectNotification}
            />
          )}

          {currentUser ? (
            <div className="inline-flex items-center gap-1 rounded-xl border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-bold text-primary-700">
              <UserCircle2 className="h-4 w-4 text-primary-600" />
              <span className="hidden max-w-[85px] truncate sm:inline">{currentUser.name}</span>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="تسجيل الخروج"
                className="rounded-lg p-1 text-primary-600 hover:bg-primary-100"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <LogIn className="h-4 w-4 text-primary-600" />
              <span className="hidden sm:inline">دخول</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAddProperty}
            className="inline-flex items-center gap-1.5 rounded-xl bg-secondary-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-secondary-600"
          >
            <PlusCircle className="h-4 w-4" />
            <span>أضف وحدة</span>
          </button>
        </div>
      </div>
    </header>
  );
}
