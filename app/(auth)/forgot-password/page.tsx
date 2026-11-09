"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

const COOLDOWN_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Password-reset request.
 *
 * The response is intentionally identical for every address: Supabase is not
 * asked whether the account exists, and the UI never surfaces an
 * account-specific error. That removes the page as an account-enumeration
 * oracle.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendResetEmail() {
    if (busy) return;

    const address = email.trim();
    if (!address) {
      setFormError("Enter the email address for your account.");
      return;
    }
    if (!EMAIL_PATTERN.test(address)) {
      setFormError("Enter a valid email address.");
      return;
    }

    setFormError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
      });
    } catch {
      // Deliberately ignored: the visible outcome must not differ between an
      // existing account, an unknown address or a transient request failure.
      // Supabase remains the authority for delivery and rate limiting.
    } finally {
      setBusy(false);
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendResetEmail();
  }

  function useDifferentEmail() {
    setSent(false);
    setFormError(null);
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
            <CardHeader>
              <CardTitle as="h1">Reset your password</CardTitle>
              <CardDescription>
                Enter your account email and we&apos;ll send a secure reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sent ? (
                <div role="status" aria-live="polite" className="text-center">
                  <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                    <CheckCircle2 className="size-6" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-[15px] font-semibold text-slate-900">
                    If an account exists, a reset link has been sent.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    Check the inbox for <span className="font-medium text-slate-700">{email.trim()}</span>,
                    including the spam folder. The link expires after a short time.
                  </p>

                  <div className="mt-5 flex flex-col gap-2">
                    <Button
                      type="button"
                      size="lg"
                      className="w-full"
                      onClick={() => void sendResetEmail()}
                      disabled={busy || cooldown > 0}
                    >
                      {busy ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden="true" />
                          Sending…
                        </>
                      ) : cooldown > 0 ? (
                        `Send another link in ${cooldown}s`
                      ) : (
                        "Send another link"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={useDifferentEmail}
                    >
                      Use a different email
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                  <FormField
                    label="Email"
                    htmlFor="forgot-email"
                    required
                    error={formError}
                    hint="Use the address your organization issued to you."
                  >
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@org.edu"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (formError) setFormError(null);
                      }}
                      autoComplete="email"
                      inputMode="email"
                      required
                      autoFocus
                    />
                  </FormField>
                  <Button type="submit" size="lg" disabled={busy} className="w-full">
                    {busy ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Send reset link
                        <ArrowRight aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              <p className="mt-4 text-center text-sm text-slate-500">
                Remembered your password?{" "}
                <Link
                  href="/login"
                  className="font-medium text-blue-700 underline underline-offset-2"
                >
                  Back to sign in
                </Link>
              </p>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
            <Mail className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
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
