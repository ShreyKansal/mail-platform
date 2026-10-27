import { useEffect, useState } from 'react';
import { setBooleanFeatureFlagResolver } from '@atlaskit/platform-feature-flags';
import { setGlobalTheme } from '@atlaskit/tokens/set-global-theme';

// Atlassian's increased-contrast palettes ship behind this platform flag.
const ENABLED_FLAGS = new Set(['platform_increased-contrast-themes']);
setBooleanFeatureFlagResolver((flag) => ENABLED_FLAGS.has(flag));

/**
 * Theme preference, applied with the Atlassian Design System token themes.
 * "contrast" uses the increased-contrast palettes and still follows the
 * OS light/dark setting.
 */
export type ThemePreference = 'system' | 'light' | 'dark' | 'contrast';

export const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'contrast', label: 'Increased contrast' },
];

const KEY = 'mailer-theme';

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'contrast' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(pref: ThemePreference): Promise<unknown> {
  // The increased-contrast palettes are selected explicitly rather than via contrastMode.
  const contrast = pref === 'contrast';
  return setGlobalTheme({
    colorMode: pref === 'light' ? 'light' : pref === 'dark' ? 'dark' : 'auto',
    light: contrast ? 'light-increased-contrast' : 'light',
    dark: contrast ? 'dark-increased-contrast' : 'dark',
  });
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);
  useEffect(() => {
    void applyTheme(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // Storage unavailable (private mode): the choice still applies for this visit.
    }
  }, [pref]);
  return [pref, setPref];
}
