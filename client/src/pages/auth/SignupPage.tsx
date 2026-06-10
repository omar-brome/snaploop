import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AuthLayout, AuthSwitchLink } from './AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { register as registerAccount } from '../../services/auth';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  fullName: z.string().min(1, 'Enter your full name').max(100),
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9._]+$/, 'Letters, numbers, dots and underscores only'),
  password: z.string().min(8, 'At least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await registerAccount(values);
      // New accounts go through profile setup (avatar + bio).
      navigate('/accounts/setup', { replace: true });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Sign up failed');
    }
  };

  return (
    <AuthLayout footer={<AuthSwitchLink text="Have an account?" linkText="Log in" to="/login" />}>
      <p className="mb-4 text-center text-sm font-semibold text-muted-light dark:text-muted-dark">
        Sign up to see photos and videos from your friends.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
        <Input label="Email" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
        <Input label="Full name" autoComplete="name" {...register('fullName')} error={errors.fullName?.message} />
        <Input label="Username" autoComplete="username" {...register('username')} error={errors.username?.message} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          error={errors.password?.message}
        />
        {serverError && <p className="text-center text-sm text-red-500">{serverError}</p>}
        <Button type="submit" loading={isSubmitting} className="mt-2">
          Sign up
        </Button>
      </form>
    </AuthLayout>
  );
}
