import "server-only";

/**
 * Central access to server-side configuration. Optional integrations report
 * whether they are configured so the UI can show an honest status instead of
 * pretending a connection exists.
 */
function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function requireEnv(name: string): string {
  const v = read(name);
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  appUrl: () => read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  supabaseUrl: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () =>
    read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  serviceRoleKey: () => read("SUPABASE_SERVICE_ROLE_KEY") ?? requireEnv("SUPABASE_SECRET_KEY"),
  cronSecret: () => read("CRON_SECRET"),
  tokenEncryptionKey: () => requireEnv("TOKEN_ENCRYPTION_KEY"),
  openaiKey: () => read("OPENAI_API_KEY"),
  openaiModel: () => read("OPENAI_MODEL") ?? "gpt-4.1-mini",
  openaiBaseUrl: () => (read("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  vapidPublicKey: () => read("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  vapidPrivateKey: () => read("VAPID_PRIVATE_KEY"),
  vapidSubject: () => read("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  resendKey: () => read("RESEND_API_KEY"),
  emailFrom: () => read("REMINDER_EMAIL_FROM"),
  googleClientId: () => read("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => read("GOOGLE_CLIENT_SECRET"),
  microsoftClientId: () => read("MICROSOFT_CLIENT_ID"),
  microsoftClientSecret: () => read("MICROSOFT_CLIENT_SECRET"),
  microsoftTenant: () => read("MICROSOFT_TENANT_ID") ?? "common",
};

export const features = {
  ai: () => Boolean(env.openaiKey()),
  push: () => Boolean(env.vapidPublicKey() && env.vapidPrivateKey()),
  emailReminders: () => Boolean(env.resendKey() && env.emailFrom()),
  google: () => Boolean(env.googleClientId() && env.googleClientSecret() && read("TOKEN_ENCRYPTION_KEY")),
  microsoft: () =>
    Boolean(env.microsoftClientId() && env.microsoftClientSecret() && read("TOKEN_ENCRYPTION_KEY")),
  serviceRole: () => Boolean(read("SUPABASE_SERVICE_ROLE_KEY") ?? read("SUPABASE_SECRET_KEY")),
};

export function featureStatus() {
  return {
    ai: features.ai(),
    push: features.push(),
    emailReminders: features.emailReminders(),
    google: features.google(),
    microsoft: features.microsoft(),
    serviceRole: features.serviceRole(),
  };
}
export type FeatureStatus = ReturnType<typeof featureStatus>;
