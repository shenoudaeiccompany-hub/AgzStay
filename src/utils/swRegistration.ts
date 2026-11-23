type UpdateAvailableListener = (applyUpdate: () => void) => void;

let waitingRegistration: ServiceWorkerRegistration | null = null;
const listeners = new Set<UpdateAvailableListener>();

function notifyListeners() {
  if (!waitingRegistration?.waiting) return;
  const apply = () => {
    waitingRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };
  listeners.forEach((cb) => cb(apply));
}

export function onServiceWorkerUpdateAvailable(listener: UpdateAvailableListener): () => void {
  listeners.add(listener);
  if (waitingRegistration?.waiting) {
    listener(() => {
      waitingRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD && window.location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting) {
          waitingRegistration = registration;
          notifyListeners();
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              waitingRegistration = registration;
              notifyListeners();
            }
          });
        });
      })
      .catch(() => {
        // Ignore SW registration failure (e.g., WebView or restricted origin)
      });
  });
}
