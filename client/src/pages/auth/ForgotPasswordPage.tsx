import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { AuthLayout, AuthSwitchLink } from './AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { forgotPassword } from '../../services/auth';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    await forgotPassword(values.email).catch(() => undefined);
    setSent(true);
  };

  return (
    <AuthLayout footer={<AuthSwitchLink text="Remembered it?" linkText="Back to login" to="/login" />}>
      <div className="mb-4 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-current">
          <Lock size={28} />
        </div>
      </div>
      {sent ? (
        <p className="text-center text-sm">
          If that email is registered, a reset link is on its way. Check your inbox (or the server
          console in dev mode).
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
          <p className="text-center text-sm text-muted-light dark:text-muted-dark">
            Enter your email and we'll send you a link to get back into your account.
          </p>
          <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
          <Button type="submit" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
