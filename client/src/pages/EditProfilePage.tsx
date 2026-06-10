import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronLeft } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/uiStore';
import { uploadFiles } from '../services/upload';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input, Textarea } from '../components/ui/Input';
import { cn } from '../utils/cn';
import { errorCode, errorMessage, profileApi } from '../features/profile/api';
import { AvatarCropModal } from '../features/profile/AvatarCropModal';
import { Toggle } from '../features/profile/Toggle';

const BIO_MAX = 500;

const schema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name').max(100, 'At most 100 characters'),
  username: z
    .string()
    .regex(/^[a-zA-Z0-9._]{3,30}$/, '3–30 characters: letters, numbers, dots and underscores'),
  bio: z.string().max(BIO_MAX, `At most ${BIO_MAX} characters`),
  websiteUrl: z
    .string()
    .trim()
    .max(200, 'At most 200 characters')
    .refine((v) => !v || /^(https?:\/\/)?[^\s]+\.[^\s]{2,}$/i.test(v), 'Enter a valid URL'),
  gender: z.string(),
});

type FormValues = z.infer<typeof schema>;

const GENDER_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'custom', label: 'Custom' },
] as const;

export default function EditProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // Avatar: pick → crop → keep the blob until save.
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  // Privacy toggle confirms before flipping; sent with the save.
  const [isPrivate, setIsPrivate] = useState(me?.isPrivate ?? false);
  const [confirmPrivacy, setConfirmPrivacy] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: me?.fullName ?? '',
      username: me?.username ?? '',
      bio: me?.bio ?? '',
      websiteUrl: me?.websiteUrl ?? '',
      gender: me?.gender ?? '',
    },
  });
  const bioLength = watch('bio')?.length ?? 0;

  if (!me) return null;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Choose an image file', 'error');
      return;
    }
    setPickedFile(file);
  };

  const onCropped = (blob: Blob) => {
    setAvatarBlob(blob);
    // The effect above revokes the previous URL when this one replaces it.
    setAvatarPreview(URL.createObjectURL(blob));
  };

  const onSubmit = async (values: FormValues) => {
    try {
      let avatarUrl: string | undefined;
      if (avatarBlob) {
        const [media] = await uploadFiles([avatarBlob], { kind: 'avatar' });
        avatarUrl = media.url;
      }
      const updated = await profileApi.updateMe({
        fullName: values.fullName.trim(),
        username: values.username,
        bio: values.bio.trim() || null,
        websiteUrl: values.websiteUrl.trim() || null,
        gender: values.gender || null,
        isPrivate,
        ...(avatarUrl ? { avatarUrl } : {}),
      });
      setUser({ ...me, ...updated });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast('Profile saved');
      navigate(`/${updated.username ?? values.username}`);
    } catch (err) {
      if (errorCode(err) === 'USERNAME_TAKEN') {
        setError('username', {
          message: errorMessage(err, 'That username is already taken'),
        });
      } else {
        toast(errorMessage(err, 'Could not save your profile'), 'error');
      }
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 md:pt-8">
      <div className="mb-6 flex items-center gap-2">
        <Link
          to={`/${me.username}`}
          aria-label="Back to your profile"
          className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronLeft size={22} aria-hidden />
        </Link>
        <h1 className="text-xl font-bold">Edit profile</h1>
      </div>

      {/* Avatar row */}
      <div className="mb-8 flex items-center gap-4 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-900">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Change profile photo"
          className="group relative rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Avatar src={avatarPreview ?? me.avatarUrl} alt={me.username} size={64} />
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow group-hover:bg-primary-hover"
          >
            <Camera size={13} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{me.username}</p>
          <p className="truncate text-xs text-muted-light dark:text-muted-dark">{me.fullName}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          Change photo
        </Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Input
          label="Full name"
          autoComplete="name"
          {...register('fullName')}
          error={errors.fullName?.message}
        />
        <Input
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          {...register('username')}
          error={errors.username?.message}
        />
        <div>
          <Textarea
            label="Bio"
            rows={4}
            maxLength={BIO_MAX}
            placeholder="Tell people a little about yourself"
            {...register('bio')}
            error={errors.bio?.message}
          />
          <p
            aria-live="polite"
            className={cn(
              'mt-1 text-right text-xs',
              bioLength >= BIO_MAX ? 'text-red-500' : 'text-muted-light dark:text-muted-dark'
            )}
          >
            {bioLength}/{BIO_MAX}
          </p>
        </div>
        <Input
          label="Website"
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          autoComplete="url"
          {...register('websiteUrl')}
          error={errors.websiteUrl?.message}
        />

        <div className="w-full">
          <label
            htmlFor="gender"
            className="mb-1 block text-xs font-medium text-muted-light dark:text-muted-dark"
          >
            Gender
          </label>
          <select
            id="gender"
            {...register('gender')}
            className={cn(
              'w-full rounded-md border border-border-light bg-neutral-50 px-3 py-2 text-sm outline-none',
              'focus:border-neutral-400 dark:border-border-dark dark:bg-neutral-900 dark:focus:border-neutral-500'
            )}
          >
            {GENDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Private account */}
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border-light p-4 dark:border-border-dark">
          <div>
            <label htmlFor="private-account" className="block text-sm font-semibold">
              Private account
            </label>
            <p className="mt-0.5 text-xs text-muted-light dark:text-muted-dark">
              When your account is private, only people you approve can see your photos and
              videos.
            </p>
          </div>
          <Toggle
            id="private-account"
            checked={isPrivate}
            onChange={() => setConfirmPrivacy(true)}
            label="Private account"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/${me.username}`)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Save changes
          </Button>
        </div>
      </form>

      <AvatarCropModal
        file={pickedFile}
        onClose={() => setPickedFile(null)}
        onCropped={onCropped}
      />

      <ConfirmDialog
        open={confirmPrivacy}
        onClose={() => setConfirmPrivacy(false)}
        onConfirm={() => setIsPrivate((v) => !v)}
        title={isPrivate ? 'Switch to a public account?' : 'Switch to a private account?'}
        body={
          isPrivate
            ? 'Anyone will be able to see your photos and videos. The change applies when you save.'
            : 'Only your approved followers will see your photos and videos. The change applies when you save.'
        }
        confirmLabel={isPrivate ? 'Switch to public' : 'Switch to private'}
        destructive={false}
      />
    </main>
  );
}
