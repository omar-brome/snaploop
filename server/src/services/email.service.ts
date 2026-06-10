import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

// When SMTP credentials are absent (default in dev), emails are logged to the
// console instead of sent, so the reset-password flow remains testable.
let transporter: Transporter | null = null;

if (env.email.smtpHost) {
  transporter = nodemailer.createTransport({
    host: env.email.smtpHost,
    port: env.email.smtpPort,
    secure: env.email.smtpPort === 465,
    auth: env.email.smtpUser
      ? { user: env.email.smtpUser, pass: env.email.smtpPass }
      : undefined,
  });
}

async function send(to: string, subject: string, html: string) {
  if (!transporter) {
    console.log(`\n[email:dev] To: ${to}\n[email:dev] Subject: ${subject}\n[email:dev] ${html}\n`);
    return;
  }
  await transporter.sendMail({ from: env.email.from, to, subject, html });
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${env.clientUrl}/reset-password?token=${token}`;
  await send(
    to,
    'Reset your Snaploop password',
    `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${link}">${link}</a></p>`
  );
}

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${env.clientUrl}/verify-email?token=${token}`;
  await send(
    to,
    'Verify your Snaploop email',
    `<p>Welcome to Snaploop! Verify your email:</p><p><a href="${link}">${link}</a></p>`
  );
}
