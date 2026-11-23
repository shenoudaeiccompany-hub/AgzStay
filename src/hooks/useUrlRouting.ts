import { useEffect, useState } from 'react';
import type { AppSectionTab } from '@/types/chalet';

function readSectionFromLocation(): AppSectionTab {
  try {
    return window.location.pathname === '/admin' ? 'admin' : 'browse';
  } catch {
    return 'browse';
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
  const [activeSection, setActiveSection] = useState<AppSectionTab>(readSectionFromLocation);
  const [selectedChaletId, setSelectedChaletId] = useState<string | null>(readChaletIdFromLocation);

  // Listen to browser back / forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const nextSection = readSectionFromLocation();
      const nextChaletId = readChaletIdFromLocation();
      setActiveSection((prev) => (nextSection === 'admin' ? 'admin' : prev === 'admin' ? 'browse' : prev));
      setSelectedChaletId(nextChaletId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Keep clean canonical URL path (/admin or /chalet/:id or /)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('unit');
      url.searchParams.delete('chalet');

      let targetPath = url.pathname;
      if (activeSection === 'admin') {
        targetPath = '/admin';
      } else if (selectedChaletId) {
        targetPath = `/chalet/${encodeURIComponent(selectedChaletId)}`;
      } else if (url.pathname === '/admin' || /^\/(?:unit|chalet)\//.test(url.pathname)) {
        targetPath = '/';
      }

      if (targetPath !== url.pathname || window.location.search !== url.search) {
        const nextUrl = `${targetPath}${url.search}`;
        if (activeSection === 'admin' || selectedChaletId) {
          window.history.pushState(null, '', nextUrl);
        } else {
          window.history.replaceState(null, '', nextUrl);
        }
      }
    } catch {
      // Ignore history API restrictions in embedded contexts
    }
  }, [activeSection, selectedChaletId]);

  return {
    activeSection,
    setActiveSection,
    selectedChaletId,
    setSelectedChaletId,
  };
}
