import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { themeStorage, type Theme } from '../../lib/theme.ts';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = themeStorage.get();
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    themeStorage.set(theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
      className="micro inline-flex items-center gap-1.5 border border-transparent px-2 py-1 transition-colors hover:border-line hover:text-ink"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
      <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  );
}
