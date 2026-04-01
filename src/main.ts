import { registerSW } from 'virtual:pwa-register';
import { init, showUpdateBanner } from './app';

// Register the service worker produced by vite-plugin-pwa (Workbox).
// When a new SW is waiting, show the update banner.
const updateSW = registerSW({
  onNeedRefresh() {
    showUpdateBanner(() => {
      updateSW(true); // skip waiting + reload
    });
  },
  onOfflineReady() {
    // App is fully cached and ready for offline use — no user action needed.
  },
});

document.addEventListener('DOMContentLoaded', () => {
  init();
});
