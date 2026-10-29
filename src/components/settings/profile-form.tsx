"use client";
import { Field, Input, Select } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { saveProfile } from "@/app/actions/settings";
import { COMMON_TIMEZONES } from "@/lib/dates";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import type { Profile } from "@/lib/types";

export function ProfileForm({ profile }: { profile: Profile }) {
  const { formAction, fieldErrors, pending } = useFormAction(saveProfile);
  const zones = COMMON_TIMEZONES.includes(profile.timezone) ? COMMON_TIMEZONES : [profile.timezone, ...COMMON_TIMEZONES];
  return (
    <form onSubmit={formAction} className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name" htmlFor="pf-name" error={fieldErrors.full_name} className="sm:col-span-2"><Input id="pf-name" name="full_name" defaultValue={profile.full_name ?? ""} required /></Field>
      <Field label="Time zone" htmlFor="pf-tz" error={fieldErrors.timezone} hint="Used for reminders, briefings and all dates.">
        <Select id="pf-tz" name="timezone" defaultValue={profile.timezone}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select>
      </Field>
      <Field label="Default currency" htmlFor="pf-cur" error={fieldErrors.default_currency}>
        <Select id="pf-cur" name="default_currency" defaultValue={profile.default_currency}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
      </Field>
      <div className="sm:col-span-2"><SubmitButton pending={pending} variant="accent">Save profile</SubmitButton></div>
    </form>
  );
}
