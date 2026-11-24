import { useState } from 'react';
import { Heart, Home, Menu, X } from 'lucide-react';
import type { RouteSection } from '@/types/chalet';

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

  const handleNavClick = (section: RouteSection) => {
    setMobileMenuOpen(false);
    if (section === 'home') {
      onResetHome();
    } else {
      onNavigate(section);
    }
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

        {/* Favorites & Mobile Trigger */}
        <div className="flex items-center gap-2">
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
