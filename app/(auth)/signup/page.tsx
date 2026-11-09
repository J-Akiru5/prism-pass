"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, IdCard, MailCheck, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { Input } from "@/components/ui/input";

const PANEL_POINTS = [
  { Icon: IdCard, text: "One identity for every organization you join." },
  { Icon: MailCheck, text: "A confirmed email keeps account creation tied to a real inbox." },
  { Icon: ShieldCheck, text: "No organization access until an administrator adds you." },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormErrors = Partial<Record<"email" | "password" | "confirmPassword" | "terms" | "form", string>>;

function signUpErrorMessage(error: { message?: string; code?: string; status?: number }): string {
  if (error.code === "user_already_exists" || /already registered/i.test(error.message ?? "")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (error.status === 429) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  return error.message || "We couldn't create your account. Please check your details and try again.";
}

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [provisionPending, setProvisionPending] = useState(false);
  const router = useRouter();

  function clearError(key: keyof FormErrors) {
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  }

  function validate(): FormErrors {
    const next: FormErrors = {};
    const address = email.trim();
    if (!address) next.email = "Enter your email address.";
    else if (!EMAIL_PATTERN.test(address)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Choose a password.";
    else if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (!confirmPassword) next.confirmPassword = "Re-enter your password.";
    else if (password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
    if (!accepted) next.terms = "You must accept the Terms of Service and Privacy Policy.";
    return next;
  }

  async function provisionInternalUser(): Promise<boolean> {
    const response = await fetch("/api/v1/auth/provision", { method: "POST", credentials: "include" });
    return response.ok;
  }

  async function retryProvision() {
    setBusy(true);
    setErrors({});
    try {
      if (await provisionInternalUser()) {
        router.replace("/consoles");
        router.refresh();
        return;
      }
      setErrors({ form: "We still couldn't finish setting up your account. Please try again in a moment." });
    } catch {
      setErrors({ form: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (provisionPending) {
      void retryProvision();
      return;
    }

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const address = email.trim();
    const name = fullName.trim();
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: {
          data: name ? { full_name: name } : {},
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/consoles`,
        },
      });

      if (error) {
        setErrors({ form: signUpErrorMessage(error) });
        return;
      }

      if (data.session) {
        setProvisionPending(true);
        try {
          if (await provisionInternalUser()) {
            router.replace("/consoles");
            router.refresh();
            return;
          }
          setErrors({ form: "Your account was created, but we couldn't finish linking it. Try again below." });
        } catch {
          setErrors({ form: "Your account was created, but we couldn't reach the server to finish setup. Try again below." });
        }
        return;
      }

      setSentTo(address);
    } catch {
      setErrors({ form: "We couldn't reach the authentication service. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden text-white lg:block">
        <div aria-hidden="true" className="pp-hero absolute inset-0">
          <div className="absolute -right-16 -top-24 size-[28rem] rounded-full bg-blue-500/25 blur-[110px]" />
          <div className="absolute -bottom-24 -left-16 size-[24rem] rounded-full bg-violet-500/20 blur-[110px]" />
          <BrandLogo variant="mark" size={460} decorative className="absolute -bottom-24 -right-20 opacity-[0.09]" />
        </div>
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" aria-label="Prism Pass home" className="w-fit">
            <BrandLogo onDark size={40} />
          </Link>
          <div className="max-w-md">
            <span aria-hidden="true" className="mb-5 flex items-center gap-2"><span className="h-1 w-10 rounded-full bg-white" /><span className="h-1 w-3 rounded-full bg-white/50" /><span className="size-1.5 rounded-full bg-emerald-300" /></span>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-100">Create your account</p>
            <p className="mt-3 text-balance font-display text-4xl font-bold leading-tight xl:text-5xl">
              Your pass starts with a verified identity.
            </p>
            <ul className="mt-8 space-y-4">
              {PANEL_POINTS.map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-[15px] text-white/90">{text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex items-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
              <MailCheck className="size-5 shrink-0 text-emerald-300" aria-hidden="true" />
              <p className="text-[13px] text-white/85">
                Email confirmation required before your first sign-in.
              </p>
            </div>
          </div>
          <SyntaxureCredit onDark />
        </div>
      </div>

      {/* form panel */}
      <div className="relative flex flex-col">
        <div aria-hidden="true" className="pp-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_20%,#000,transparent)]" />
        <div className="relative flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
          <Link
            href="/"
            aria-label="Back to Prism Pass home"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to home
          </Link>
          <span className="hidden text-sm text-slate-500 sm:inline">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-blue-700 underline underline-offset-2">
              Sign in
            </Link>
          </span>
        </div>
        <main className="relative flex flex-1 items-start justify-center px-4 py-8 sm:px-8 lg:items-center">
          <div className="w-full max-w-md">
            <div className="pp-hero relative mb-5 overflow-hidden rounded-2xl px-5 py-6 text-white lg:hidden">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-400 via-violet-400 to-teal-300" />
              <BrandLogo onDark size={32} />
              <p className="mt-5 text-balance text-[23px] font-semibold leading-[1.15] tracking-[-0.02em]">
                Create your Prism Pass account.
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">
                Confirm your email, then an administrator can add you to an organization.
              </p>
            </div>
            <Card className="shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
              {sentTo ? (
                <>
                  <CardHeader>
                    <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                      <MailCheck className="size-5" aria-hidden="true" />
                    </span>
                    <CardTitle as="h1">Check your email</CardTitle>
                    <CardDescription>Confirm your address to finish creating your account.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[15px] leading-relaxed text-slate-600">
                      Check your email to confirm your account. We sent a confirmation link to{" "}
                      <span className="font-semibold text-slate-900">{sentTo}</span>.
                    </p>
                    <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
                      Open the link on this device to finish setting up. If it doesn&apos;t arrive in a few minutes,
                      check your spam folder or contact your organization administrator.
                    </p>
                    <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}>
                      Back to sign in <ArrowRight aria-hidden="true" />
                    </Link>
                  </CardContent>
                </>
              ) : (
                <>
                  <CardHeader>
                    <CardTitle as="h1">Create your account</CardTitle>
                    <CardDescription>
                      Set up your Prism Pass identity. Organization access is added separately by an administrator.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      onSubmit={submit}
                      className="flex flex-col gap-4"
                      noValidate
                      aria-describedby={errors.form ? "signup-error" : undefined}
                    >
                      <FormField label="Full name" htmlFor="signup-name" hint="Optional. Administrators use this to match you to your organization.">
                        <Input
                          id="signup-name"
                          placeholder="e.g. Alex Cruz"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          type="text"
                          autoComplete="name"
                        />
                      </FormField>
                      <FormField label="Email" htmlFor="signup-email" required error={errors.email}>
                        <Input
                          id="signup-email"
                          placeholder="you@org.edu"
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                          type="email"
                          autoComplete="email"
                          required
                          autoFocus
                        />
                      </FormField>
                      <FormField label="Password" htmlFor="signup-password" required hint="At least 8 characters." error={errors.password}>
                        <PasswordInput
                          id="signup-password"
                          placeholder="At least 8 characters"
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                          autoComplete="new-password"
                          minLength={8}
                          required
                        />
                      </FormField>
                      <FormField label="Confirm password" htmlFor="signup-confirm-password" required error={errors.confirmPassword}>
                        <PasswordInput
                          id="signup-confirm-password"
                          placeholder="Re-enter your password"
                          value={confirmPassword}
                          onChange={(e) => { setConfirmPassword(e.target.value); clearError("confirmPassword"); }}
                          autoComplete="new-password"
                          minLength={8}
                          required
                        />
                      </FormField>

                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2.5">
                          <input
                            id="signup-terms"
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => { setAccepted(e.target.checked); clearError("terms"); }}
                            aria-invalid={errors.terms ? true : undefined}
                            aria-describedby={errors.terms ? "signup-terms-error" : undefined}
                            className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50"
                            required
                          />
                          <p className="text-[13.5px] leading-relaxed text-slate-600">
                            <label htmlFor="signup-terms" className="cursor-pointer">I have read and accept the</label>{" "}
                            <Link href="/terms" className="font-medium text-blue-700 underline underline-offset-2">Terms of Service</Link>{" "}
                            and{" "}
                            <Link href="/privacy" className="font-medium text-blue-700 underline underline-offset-2">Privacy Policy</Link>.
                          </p>
                        </div>
                        {errors.terms && (
                          <p id="signup-terms-error" role="alert" className="text-[13px] font-medium text-red-600">
                            {errors.terms}
                          </p>
                        )}
                      </div>

                      {errors.form && (
                        <p id="signup-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14.5px] text-red-700">
                          {errors.form}
                        </p>
                      )}

                      {provisionPending ? (
                        <Button type="button" size="lg" onClick={retryProvision} disabled={busy} className="w-full">
                          {busy ? "Finishing setup…" : (<>Finish setup <ArrowRight aria-hidden="true" /></>)}
                        </Button>
                      ) : (
                        <Button type="submit" size="lg" disabled={busy} className="w-full">
                          {busy ? "Creating account…" : (<>Create account <ArrowRight aria-hidden="true" /></>)}
                        </Button>
                      )}
                    </form>
                  </CardContent>
                </>
              )}
            </Card>
            <p className="mt-4 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-blue-700 underline underline-offset-2">
                Sign in
              </Link>
            </p>
            <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
              Creating an account does not grant organization access. An administrator must add you to your organization.
            </p>
            <p className="mt-2 text-center text-xs text-slate-500">
              <Link href="/privacy" className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2">
                Privacy & your rights
              </Link>{" "}
              — what the platform records and how to exercise your rights.
            </p>
            <div className="mt-6 flex justify-center">
              <SyntaxureCredit />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
