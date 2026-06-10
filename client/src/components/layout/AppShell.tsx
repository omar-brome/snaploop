import { ReactNode, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home,
  Search,
  Compass,
  Clapperboard,
  Send,
  Heart,
  PlusSquare,
  Moon,
  Sun,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { Avatar } from '../ui/Avatar';
import { api } from '../../services/api';
import { getSocket } from '../../services/socket';
import { logout } from '../../services/auth';
import { cn } from '../../utils/cn';

// App chrome: desktop left sidebar, mobile top bar + bottom tab bar.
// Pages render inside; feed-like pages constrain their own width.

function useUnreadBadges() {
  const queryClient = useQueryClient();
  const { data: notif } = useQuery({
    queryKey: ['unread-notifications'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const { data: dm } = useQuery({
    queryKey: ['unread-dms'],
    queryFn: () => api.get<{ count: number }>('/conversations/unread-total'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNotification = () =>
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    const onMessage = () => queryClient.invalidateQueries({ queryKey: ['unread-dms'] });
    socket.on('new_notification', onNotification);
    socket.on('new_message', onMessage);
    return () => {
      socket.off('new_notification', onNotification);
      socket.off('new_message', onMessage);
    };
  }, [queryClient]);

  return { notifCount: notif?.count ?? 0, dmCount: dm?.count ?? 0 };
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-like px-1 text-[11px] font-semibold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface ItemProps {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: number;
  end?: boolean;
}

function SidebarItem({ to, icon, label, badge = 0, end }: ItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900',
          isActive && 'font-bold'
        )
      }
      aria-label={label}
    >
      <span className="relative">
        {icon}
        <Badge count={badge} />
      </span>
      <span className="hidden xl:block">{label}</span>
    </NavLink>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useUiStore();
  const { notifCount, dmCount } = useUnreadBadges();
  const navigate = useNavigate();
  const location = useLocation();

  // Full-bleed surfaces hide the chrome padding (story viewer handles its own).
  const isReels = location.pathname.startsWith('/reels');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col border-r border-border-light px-3 py-6 dark:border-border-dark md:flex xl:w-60">
        <Link to="/" className="mb-8 px-3 text-2xl font-bold tracking-tight" aria-label="Snaploop home">
          <span className="hidden xl:inline" style={{ fontFamily: 'Georgia, serif' }}>
            Snaploop
          </span>
          <span className="xl:hidden">S</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Primary">
          <SidebarItem to="/" end icon={<Home size={26} />} label="Home" />
          <SidebarItem to="/search" icon={<Search size={26} />} label="Search" />
          <SidebarItem to="/explore" icon={<Compass size={26} />} label="Explore" />
          <SidebarItem to="/reels" icon={<Clapperboard size={26} />} label="Reels" />
          <SidebarItem to="/messages" icon={<Send size={26} />} label="Messages" badge={dmCount} />
          <SidebarItem to="/notifications" icon={<Heart size={26} />} label="Notifications" badge={notifCount} />
          <SidebarItem to="/create" icon={<PlusSquare size={26} />} label="Create" />
          <NavLink
            to={`/${user?.username}`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-4 rounded-lg px-3 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-900',
                isActive && 'font-bold'
              )
            }
            aria-label="Profile"
          >
            <Avatar src={user?.avatarUrl} alt={user?.username ?? ''} size={26} />
            <span className="hidden xl:block">Profile</span>
          </NavLink>
        </nav>
        <div className="flex flex-col gap-1">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-4 rounded-lg px-3 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun size={26} /> : <Moon size={26} />}
            <span className="hidden xl:block">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-4 rounded-lg px-3 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            aria-label="Log out"
          >
            <LogOut size={26} />
            <span className="hidden xl:block">Log out</span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      {!isReels && (
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border-light bg-white px-4 dark:border-border-dark dark:bg-black md:hidden">
          <Link to="/" className="text-xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            Snaploop
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/notifications" aria-label="Notifications" className="relative">
              <Heart size={24} />
              <Badge count={notifCount} />
            </Link>
            <Link to="/messages" aria-label="Messages" className="relative">
              <Send size={24} />
              <Badge count={dmCount} />
            </Link>
          </div>
        </header>
      )}

      {/* Content */}
      <main className={cn('md:pl-[72px] xl:pl-60', !isReels && 'pb-14 md:pb-0')}>{children}</main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t border-border-light bg-white dark:border-border-dark dark:bg-black md:hidden"
        aria-label="Primary"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <NavLink to="/" end aria-label="Home" className={({ isActive }) => (isActive ? 'text-current' : 'text-current opacity-90')}>
          {({ isActive }) => <Home size={26} fill={isActive ? 'currentColor' : 'none'} />}
        </NavLink>
        <NavLink to="/explore" aria-label="Explore">
          {({ isActive }) => <Search size={26} strokeWidth={isActive ? 3 : 2} />}
        </NavLink>
        <NavLink to="/create" aria-label="Create">
          <PlusSquare size={26} />
        </NavLink>
        <NavLink to="/reels" aria-label="Reels">
          {({ isActive }) => <Clapperboard size={26} fill={isActive ? 'currentColor' : 'none'} />}
        </NavLink>
        <NavLink to={`/${user?.username}`} aria-label="Profile">
          <Avatar src={user?.avatarUrl} alt={user?.username ?? ''} size={26} />
        </NavLink>
      </nav>
    </div>
  );
}
