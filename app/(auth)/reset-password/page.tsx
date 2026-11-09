"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "expired" | "done";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Password update.
 *
 * The recovery link establishes a short-lived Supabase session before this page
 * is reached. The page requires that session instead of redirecting straight to
 * `/login`, so an expired or already-used link gets an explanation and a way to
 * request another one.
 */
export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [otherSessionsSignedOut, setOtherSessionsSignedOut] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        setStatus(data.user ? "ready" : "expired");
      } catch {
        if (active) setStatus("expired");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const nextPasswordError =
      password.length < MIN_PASSWORD_LENGTH
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
        : null;
    const nextConfirmError = confirmPassword !== password ? "Passwords don't match." : null;

    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (nextPasswordError || nextConfirmError) return;

    setBusy(true);
    setFormError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        if (error.status === 401) {
          setStatus("expired");
        } else {
          setFormError(
            error.message || "We couldn't update your password. Request a new link and try again.",
          );
        }
        return;
      }

      setPassword("");
      setConfirmPassword("");

      // Best effort: the current session must stay usable. If this fails, the
      // password change still succeeded; the UI says so rather than implying
      // other devices were signed out.
      try {
        const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
        setOtherSessionsSignedOut(!othersError);
      } catch {
        setOtherSessionsSignedOut(false);
      }

      setStatus("done");
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div
        aria-hidden="true"
        className="pp-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_0%,#000,transparent)]"
      />

      <header className="relative z-10 flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
        <Link
          href="/"
          aria-label="Prism Pass home"
          className="w-fit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50"
        >
          <BrandLogo size={30} />
        </Link>
        <Link
          href="/"
          aria-label="Back to home"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100/80 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to home
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-sm">
          <Card className="shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
            {status === "checking" && (
              <>
                <CardHeader>
                  <CardTitle as="h1">Checking your reset link</CardTitle>
                  <CardDescription>This only takes a moment.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600"
                  >
                    <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" aria-hidden="true" />
                    Verifying your session…
                  </div>
                </CardContent>
              </>
            )}

            {status === "expired" && (
              <>
                <CardHeader>
                  <CardTitle as="h1">This reset link has expired</CardTitle>
                  <CardDescription>
                    Reset links are single-use and expire after a short time.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center text-center">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                      <AlertTriangle className="size-6" aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                      This link is invalid, has already been used, or has expired. Request a new
                      link to continue.
                    </p>
                  </div>

                  <div className="mt-5 flex flex-col gap-2">
                    <Link
                      href="/forgot-password"
                      className={buttonVariants({ size: "lg" }) + " w-full"}
                    >
                      Request a new link
                      <ArrowRight aria-hidden="true" />
                    </Link>
                    <Link
                      href="/login"
                      className={buttonVariants({ variant: "ghost" }) + " w-full"}
                    >
                      Back to sign in
                    </Link>
                  </div>
                </CardContent>
              </>
            )}

            {status === "ready" && (
              <>
                <CardHeader>
                  <CardTitle as="h1">Choose a new password</CardTitle>
                  <CardDescription>
                    Use at least {MIN_PASSWORD_LENGTH} characters. Your current session stays
                    signed in.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                    <FormField
                      label="New password"
                      htmlFor="reset-password"
                      required
                      error={passwordError}
                      hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                    >
                      <PasswordInput
                        id="reset-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          if (passwordError) setPasswordError(null);
                        }}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                        autoFocus
                      />
                    </FormField>
                    <FormField
                      label="Confirm new password"
                      htmlFor="reset-password-confirm"
                      required
                      error={confirmError}
                    >
                      <PasswordInput
                        id="reset-password-confirm"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(event) => {
                          setConfirmPassword(event.target.value);
                          if (confirmError) setConfirmError(null);
                        }}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                      />
                    </FormField>

                    {formError && (
                      <p
                        role="alert"
                        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14.5px] text-red-700"
                      >
                        {formError}
                      </p>
                    )}

                    <Button type="submit" size="lg" disabled={busy} className="w-full">
                      {busy ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden="true" />
                          Updating password…
                        </>
                      ) : (
                        <>
                          Update password
                          <ArrowRight aria-hidden="true" />
                        </>
                      )}
                    </Button>
                  </form>

                  <p className="mt-4 text-center text-sm text-slate-500">
                    <Lock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
                    Changed your mind?{" "}
                    <Link
                      href="/login"
                      className="font-medium text-blue-700 underline underline-offset-2"
                    >
                      Back to sign in
                    </Link>
                  </p>
                </CardContent>
              </>
            )}

            {status === "done" && (
              <>
                <CardHeader>
                  <CardTitle as="h1">Password updated</CardTitle>
                  <CardDescription>Your password has been changed successfully.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div role="status" aria-live="polite" className="text-center">
                    <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                      <CheckCircle2 className="size-6" aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-[15px] font-semibold text-slate-900">
                      You can keep using this device.
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">
                      {otherSessionsSignedOut
                        ? "Other sessions have been signed out for your security. This device stays signed in."
                        : "We couldn't sign out your other sessions. If someone else may have access to your account, sign out on those devices too."}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-col gap-2">
                    <Link
                      href="/consoles"
                      className={buttonVariants({ size: "lg" }) + " w-full"}
                    >
                      Go to your consoles
                      <ArrowRight aria-hidden="true" />
                    </Link>
                    <Link
                      href="/login"
                      className={buttonVariants({ variant: "ghost" }) + " w-full"}
                    >
                      Back to sign in
                    </Link>
                  </div>
                </CardContent>
              </>
            )}
          </Card>

          <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
            Having trouble? Contact your organization administrator.
          </p>
          <div className="mt-6 flex justify-center">
            <SyntaxureCredit />
          </div>
        </div>
      </main>
    </div>
  );
}
