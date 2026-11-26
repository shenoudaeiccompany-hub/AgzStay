import { useEffect, useState } from 'react';
import type { RouteSection } from '@/types/chalet';

function readSectionFromLocation(): RouteSection {
  try {
    const path = window.location.pathname;
    if (path === '/bookings') return 'bookings';
    if (path === '/support') return 'support';
    if (path === '/pricing') return 'pricing';
    if (path === '/owner') return 'owner';
    if (path === '/admin') return 'admin';
    return 'home';
  } catch {
    return 'home';
  }
}

function readChaletIdFromLocation(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('unit') || params.get('chalet');
    if (fromQuery) return fromQuery;
    const pathMatch = window.location.pathname.match(/\/(?:unit|chalet)\/([^/]+)/);
    return pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : null;
  } catch {
    return null;
  }
}

export function useUrlRouting() {
  const [activeSection, setActiveSection] = useState<RouteSection>(readSectionFromLocation);
  const [selectedChaletId, setSelectedChaletId] = useState<string | null>(readChaletIdFromLocation);

  useEffect(() => {
    const handlePopState = () => {
      setActiveSection(readSectionFromLocation());
      setSelectedChaletId(readChaletIdFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('unit');
      url.searchParams.delete('chalet');

      let targetPath = '/';
      if (selectedChaletId) {
        targetPath = `/chalet/${encodeURIComponent(selectedChaletId)}`;
      } else if (activeSection === 'bookings') {
        targetPath = '/bookings';
      } else if (activeSection === 'support') {
        targetPath = '/support';
      } else if (activeSection === 'pricing') {
        targetPath = '/pricing';
      } else if (activeSection === 'owner') {
        targetPath = '/owner';
      } else if (activeSection === 'admin') {
        targetPath = '/admin';
      }

      if (targetPath !== url.pathname || window.location.search !== url.search) {
        const nextUrl = `${targetPath}${url.search}`;
        if (selectedChaletId || activeSection !== 'home') {
          window.history.pushState(null, '', nextUrl);
        } else {
          window.history.replaceState(null, '', nextUrl);
        }
      }
    } catch {
      // Ignore history API restrictions in embedded contexts
    }
  }, [activeSection, selectedChaletId]);

  const navigateToSection = (section: RouteSection) => {
    setSelectedChaletId(null);
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openChaletDetail = (chaletId: string) => {
    setSelectedChaletId(chaletId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeChaletDetail = () => {
    setSelectedChaletId(null);
  };

  return {
    activeSection,
    selectedChaletId,
    navigateToSection,
    openChaletDetail,
    closeChaletDetail,
  };
}
