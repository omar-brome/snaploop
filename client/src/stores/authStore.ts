import { create } from 'zustand';
import type { CurrentUser } from '../types';

// Session state. `status` starts as 'loading' until the app's initial
// /auth/refresh resolves, so protected routes don't flash to /login.
interface AuthState {
  user: CurrentUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  setUser: (user: CurrentUser) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => set({ user, status: 'authenticated' }),
  clear: () => set({ user: null, status: 'unauthenticated' }),
}));
