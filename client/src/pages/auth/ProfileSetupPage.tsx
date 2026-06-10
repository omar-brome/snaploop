import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Input';
import { api } from '../../services/api';
import { uploadFiles, compressImage } from '../../services/upload';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import type { CurrentUser } from '../../types';

// Post-signup step: pick an avatar and write a bio. Skippable.
export default function ProfileSetupPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const compressed = await compressImage(avatarFile, 640);
        const [media] = await uploadFiles([compressed], { kind: 'avatar' });
        avatarUrl = media.url;
      }
      const updated = await api.patch<CurrentUser>('/users/me', {
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
      });
      setUser({ ...user!, ...updated });
      toast('Profile updated');
      navigate('/', { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold">Welcome, {user?.fullName?.split(' ')[0]}!</h1>
        <p className="mt-1 text-sm text-muted-light dark:text-muted-dark">
          Add a photo and a bio so friends can recognize you.
        </p>

        <button
          className="group relative mx-auto mt-8 block rounded-full"
          onClick={() => fileRef.current?.click()}
          aria-label="Upload avatar"
        >
          <Avatar src={avatarPreview ?? user?.avatarUrl} alt={user?.username ?? ''} size={112} />
          <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow group-hover:bg-primary-hover">
            <Camera size={16} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />

        <Textarea
          className="mt-6"
          rows={3}
          maxLength={500}
          placeholder="Write a short bio..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          aria-label="Bio"
        />

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onSave} loading={saving}>
            Done
          </Button>
          <Button variant="text" onClick={() => navigate('/', { replace: true })}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}
