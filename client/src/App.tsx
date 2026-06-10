import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import { bootstrapSession } from './services/auth';

import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import ProfileSetupPage from './pages/auth/ProfileSetupPage';

import FeedPage from './pages/FeedPage';
import ExplorePage from './pages/ExplorePage';
import SearchPage from './pages/SearchPage';
import HashtagPage from './pages/HashtagPage';
import PlacePage from './pages/PlacePage';
import ReelsPage from './pages/ReelsPage';
import ReelDetailPage from './pages/ReelDetailPage';
import MessagesPage from './pages/MessagesPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import EditProfilePage from './pages/EditProfilePage';
import SettingsPage from './pages/SettingsPage';
import PostDetailPage from './pages/PostDetailPage';
import CreatePage from './pages/CreatePage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  // Restore session from the refresh cookie once on boot.
  useEffect(() => {
    void bootstrapSession();
  }, []);

  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        {/* Profile setup renders without the app chrome */}
        <Route path="/accounts/setup" element={<ProfileSetupPage />} />

        <Route
          path="*"
          element={
            <AppShell>
              <Routes>
                <Route path="/" element={<FeedPage />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/explore/tags/:name" element={<HashtagPage />} />
                <Route path="/explore/places/:name" element={<PlacePage />} />
                <Route path="/reels" element={<ReelsPage />} />
                <Route path="/reels/:reelId" element={<ReelDetailPage />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/messages/:conversationId" element={<MessagesPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/create" element={<CreatePage />} />
                <Route path="/p/:postId" element={<PostDetailPage />} />
                <Route path="/accounts/edit" element={<EditProfilePage />} />
                <Route path="/accounts/settings" element={<SettingsPage />} />
                <Route path="/:username" element={<ProfilePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppShell>
          }
        />
      </Route>
    </Routes>
  );
}
