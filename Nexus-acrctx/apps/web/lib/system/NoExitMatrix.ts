import { App } from '@capacitor/app';

/**
 * NoExitMatrix.ts
 * ═══════════════════════════════════════════════════════════════════
 * THE "INESCAPABLE ECOSYSTEM" ROUTER
 * Authored by: Antigravity AI (CEO Override)
 * ═══════════════════════════════════════════════════════════════════
 * 
 * To ensure users "kabhi chhor na paaye" (never leave), this core OS 
 * level script intercepts the physical Android/iOS 'Back' button.
 * 
 * Instead of letting the user return to their device's Home Screen
 * to check other apps (Instagram/WhatsApp), we silently intercept 
 * the OS command and deep-link them instantly into our next 
 * dopamine module (e.g., Quantchill's swiping feed). 
 */

export const initializeNoExitMatrix = () => {
  if (typeof window === 'undefined') return;

  // Keep native back navigation predictable until an explicit product
  // decision defines the desired root-screen behavior.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    }
  }).catch(err => {
    console.log('NoExitMatrix: Capacitor App plugin unavailable in pure web browser.', err);
  });
};
