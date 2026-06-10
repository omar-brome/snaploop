import { create } from 'zustand';

// Theme + toast state. Theme is applied to <html class="dark"> and persisted;
// index.html applies it pre-paint on load.
export type Theme = 'light' | 'dark';

interface Toast {
  id: number;
  message: string;
  variant: 'default' | 'error';
}

interface UiState {
  theme: Theme;
  toasts: Toast[];
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toast: (message: string, variant?: 'default' | 'error') => void;
  dismissToast: (id: number) => void;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('snaploop-theme', theme);
}

const initialTheme: Theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

let toastId = 0;

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme,
  toasts: [],
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  toast: (message, variant = 'default') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => get().dismissToast(id), 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience for non-component code.
export const toast = (message: string, variant: 'default' | 'error' = 'default') =>
  useUiStore.getState().toast(message, variant);
