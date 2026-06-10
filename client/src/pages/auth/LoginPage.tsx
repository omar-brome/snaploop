import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AuthLayout, AuthSwitchLink } from './AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { login } from '../../services/auth';

const schema = z.object({
  identifier: z.string().min(1, 'Enter your username or email'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values.identifier, values.password);
      navigate((location.state as { from?: string })?.from ?? '/', { replace: true });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <AuthLayout
      footer={<AuthSwitchLink text="Don't have an account?" linkText="Sign up" to="/signup" />}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
        <Input
          label="Username or email"
          autoComplete="username"
          {...register('identifier')}
          error={errors.identifier?.message}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          error={errors.password?.message}
        />
        {serverError && <p className="text-center text-sm text-red-500">{serverError}</p>}
        <Button type="submit" loading={isSubmitting} className="mt-2">
          Log in
        </Button>
        <Link to="/forgot-password" className="mt-2 text-center text-xs text-primary">
          Forgot password?
        </Link>
      </form>
    </AuthLayout>
  );
}
