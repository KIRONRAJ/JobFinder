/**
 * Modern Telegram WebApp SDK Wrapper & Helpers
 * Implements Telegram Bot API 6.0 - 10.1 features:
 * - HapticFeedback (impact, notification, selection)
 * - BackButton & MainButton lifecycle
 * - CloudStorage with localStorage fallback
 * - Native Dialogs (showConfirm, showAlert)
 * - Safe external link opening via tg.openLink
 * - Vertical swipe management & viewport expansion
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export function getTg() {
  if (typeof window === 'undefined') return null;
  return (window as any).Telegram?.WebApp || null;
}

export const tgHaptic = {
  impact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') {
    try {
      getTg()?.HapticFeedback?.impactOccurred(style);
    } catch {}
  },
  notification(type: 'error' | 'success' | 'warning') {
    try {
      getTg()?.HapticFeedback?.notificationOccurred(type);
    } catch {}
  },
  selection() {
    try {
      getTg()?.HapticFeedback?.selectionChanged();
    } catch {}
  },
};

export const tgBackButton = {
  show(onClick: () => void) {
    const tg = getTg();
    if (!tg?.BackButton) return;
    try {
      tg.BackButton.show();
      tg.BackButton.offClick(onClick);
      tg.BackButton.onClick(onClick);
    } catch {}
  },
  hide(onClick?: () => void) {
    const tg = getTg();
    if (!tg?.BackButton) return;
    try {
      if (onClick) tg.BackButton.offClick(onClick);
      tg.BackButton.hide();
    } catch {}
  },
};

export const tgMainButton = {
  show(
    text: string,
    onClick: () => void,
    opts?: { color?: string; textColor?: string; isActive?: boolean }
  ) {
    const tg = getTg();
    if (!tg?.MainButton) return;
    try {
      tg.MainButton.setText(text);
      if (opts?.color) tg.MainButton.color = opts.color;
      if (opts?.textColor) tg.MainButton.textColor = opts.textColor;
      if (opts?.isActive !== undefined) {
        if (opts.isActive) tg.MainButton.enable();
        else tg.MainButton.disable();
      } else {
        tg.MainButton.enable();
      }
      tg.MainButton.offClick(onClick);
      tg.MainButton.onClick(onClick);
      tg.MainButton.show();
    } catch {}
  },
  hide(onClick?: () => void) {
    const tg = getTg();
    if (!tg?.MainButton) return;
    try {
      if (onClick) tg.MainButton.offClick(onClick);
      tg.MainButton.hide();
    } catch {}
  },
  setLoading(loading: boolean) {
    const tg = getTg();
    if (!tg?.MainButton) return;
    try {
      if (loading) tg.MainButton.showProgress(false);
      else tg.MainButton.hideProgress();
    } catch {}
  },
};

export const tgCloudStorage = {
  async setItem(key: string, value: string): Promise<boolean> {
    const tg = getTg();
    if (tg?.CloudStorage?.setItem) {
      return new Promise((resolve) => {
        try {
          tg.CloudStorage.setItem(key, value, (err: any, ok: boolean) => {
            if (err) resolve(false);
            else resolve(Boolean(ok));
          });
        } catch {
          resolve(false);
        }
      });
    }
    try {
      localStorage.setItem(`tg_cloud_${key}`, value);
      return true;
    } catch {
      return false;
    }
  },

  async getItem(key: string): Promise<string | null> {
    const tg = getTg();
    if (tg?.CloudStorage?.getItem) {
      return new Promise((resolve) => {
        try {
          tg.CloudStorage.getItem(key, (err: any, val: string | null) => {
            if (err) resolve(null);
            else resolve(val ?? null);
          });
        } catch {
          resolve(null);
        }
      });
    }
    try {
      return localStorage.getItem(`tg_cloud_${key}`);
    } catch {
      return null;
    }
  },
};

export const tgDialogs = {
  async confirm(message: string): Promise<boolean> {
    const tg = getTg();
    if (tg?.showConfirm) {
      return new Promise((resolve) => {
        try {
          tg.showConfirm(message, (confirmed: boolean) => resolve(Boolean(confirmed)));
        } catch {
          resolve(window.confirm(message));
        }
      });
    }
    return Promise.resolve(window.confirm(message));
  },

  async alert(message: string): Promise<void> {
    const tg = getTg();
    if (tg?.showAlert) {
      return new Promise((resolve) => {
        try {
          tg.showAlert(message, () => resolve());
        } catch {
          window.alert(message);
          resolve();
        }
      });
    }
    window.alert(message);
    return Promise.resolve();
  },
};

export function tgOpenLink(url: string, { tryInstantView = false }: { tryInstantView?: boolean } = {}) {
  const tg = getTg();
  if (tg?.openLink) {
    try {
      tg.openLink(url, { try_instant_view: tryInstantView });
      return;
    } catch {}
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function initTelegramEnvironment() {
  const tg = getTg();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    // Prevent accidental swipe-down-to-close gesture while scrolling application cards
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    // Align header and bottom chrome with Telegram palette
    if (tg.setHeaderColor) tg.setHeaderColor('secondary_bg_color');
    if (tg.setBottomBarColor) tg.setBottomBarColor('secondary_bg_color');
    if (tg.setBackgroundColor) tg.setBackgroundColor('bg_color');
  } catch {}
}
