import { requireUser } from "@/lib/auth";
import { ProfileForm } from "@/components/settings/profile-form";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "@/components/settings/password-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, profile } = await requireUser();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle>Profile</CardTitle><CardDescription>Signed in as {user.email}</CardDescription></div></CardHeader>
        <CardContent><ProfileForm profile={profile} /></CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Appearance</CardTitle><CardDescription>Light, dark or follow your device.</CardDescription></div></CardHeader>
        <CardContent><ThemeToggle /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent><PasswordForm /></CardContent>
      </Card>
    </div>
  );
}
