export type Platform = 'ios' | 'android' | 'desktop';

/**
 * Returns true when the app is running in PWA standalone mode.
 * Works on both iOS (navigator.standalone) and Android/desktop
 * (display-mode media query).
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // iOS Safari sets this non-standard property when running from home screen
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }

  // Standard media query — Chrome/Android and desktop PWA installs
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    // matchMedia may throw in some environments (e.g. certain test runners)
  }

  return false;
}

/** Detect the host platform so the right install instructions can be shown. */
export function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Check whether the app is running in standalone mode and update the DOM
 * accordingly.
 *
 * Returns `true` when standalone (app shell is shown) and `false` when the
 * install splash is shown.
 */
export function applyInstallGate(doc: Document = document): boolean {
  const splash = doc.getElementById('install-splash');
  const shell = doc.getElementById('app-shell');

  if (isStandalone()) {
    if (splash) splash.hidden = true;
    if (shell) shell.hidden = false;
    return true;
  }

  // Not standalone — show the splash and activate the right hint
  if (splash) splash.hidden = false;
  if (shell) shell.hidden = true;

  const platform = getPlatform();
  const iosHint = doc.getElementById('ios-hint');
  const androidHint = doc.getElementById('android-hint');
  const desktopHint = doc.getElementById('desktop-hint');

  if (iosHint) iosHint.hidden = platform !== 'ios';
  if (androidHint) androidHint.hidden = platform !== 'android';
  if (desktopHint) desktopHint.hidden = platform !== 'desktop';

  return false;
}
