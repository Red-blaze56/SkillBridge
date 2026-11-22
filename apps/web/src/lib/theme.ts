const THEME_KEY = 'skillbridge_theme';

export type Theme = 'light' | 'dark';

/**
 * The theme is the only thing kept in localStorage. The session is an httpOnly
 * cookie the page can't read, which is exactly the point.
 */
export const themeStorage = {
  get(): Theme | null {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  },
  set(theme: Theme) {
    localStorage.setItem(THEME_KEY, theme);
  },
};
