"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

const SUPPORTED_OTP_TYPES = ["recovery", "signup", "email", "invite", "magiclink"] as const;
type SupportedOtpType = (typeof SUPPORTED_OTP_TYPES)[number];

function isSupportedOtpType(value: string | null): value is SupportedOtpType {
  return value !== null && (SUPPORTED_OTP_TYPES as readonly string[]).includes(value);
}

/** Error text arrives in a URL; keep it short and single-line before rendering. */
function cleanDetail(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, 240);
  return cleaned || null;
}

type Status = "working" | "error" | "provision-failed";

const ERROR_BODY =
  "This link is invalid, has already been used, or has expired. Request a new link and try again.";

function AuthShell({ children }: { children: ReactNode }) {
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
          {children}
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

function AuthConfirmCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);

  // Freeze `next` before the URL is scrubbed below, so a retry cannot lose the
  // destination and fall back to the default by accident.
  const [nextPath] = useState(() => resolveNext(searchParams.get("next")));

  const [status, setStatus] = useState<Status>("working");
  const [workingLabel, setWorkingLabel] = useState("Confirming your link…");
  const [errorBody, setErrorBody] = useState(ERROR_BODY);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const showError = useCallback((detail?: string | null, body: string = ERROR_BODY) => {
    setErrorBody(body);
    setErrorDetail(cleanDetail(detail));
    setStatus("error");
  }, []);

  const completeProvisioning = useCallback(async () => {
    setStatus("working");
    setWorkingLabel("Setting up your profile…");

    try {
      const response = await fetch("/api/v1/auth/provision", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        setStatus("provision-failed");
        return;
      }
    } catch {
      setStatus("provision-failed");
      return;
    }

    router.replace(nextPath);
  }, [nextPath, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const errorCode = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // One-time credentials and provider errors do not belong in the address
    // bar, history, screenshots or a shared link. Capture them, then strip them.
    if (code || tokenHash || errorCode || errorDescription) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    void (async () => {
      try {
        if (errorCode || errorDescription) {
          showError(errorDescription || errorCode);
          return;
        }

        const supabase = createClient();

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            showError(error.message);
            return;
          }
        } else if (tokenHash) {
          if (!isSupportedOtpType(type)) {
            showError("The link is missing or has an unsupported confirmation type.");
            return;
          }
          const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          if (error) {
            showError(error.message);
            return;
          }
        } else {
          // Implicit links carry the session in the URL hash. The browser client
          // detects it during initialisation; getSession() awaits that work.
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            showError("The link did not include a confirmation code.");
            return;
          }
        }

        await completeProvisioning();
      } catch {
        showError(
          "The request could not be completed.",
          "We couldn't reach the authentication service. Check your connection and try again.",
        );
      }
    })();
  }, [completeProvisioning, searchParams, showError]);

  return (
    <AuthShell>
      <Card className="shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
        {status === "working" && (
          <>
            <CardHeader>
              <CardTitle as="h1">Confirming your link</CardTitle>
              <CardDescription>
                Please wait while we verify this link and prepare your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600"
              >
                <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" aria-hidden="true" />
                {workingLabel}
              </div>
            </CardContent>
          </>
        )}

        {status === "error" && (
          <>
            <CardHeader>
              <CardTitle as="h1">We couldn&apos;t confirm this link</CardTitle>
              <CardDescription>
                Password reset and confirmation links are single-use and expire.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div role="alert" className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm leading-relaxed text-slate-600">{errorBody}</p>
                  {errorDetail && (
                    <p className="mt-2 break-words text-[13px] leading-relaxed text-slate-500">
                      {errorDetail}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <Link
                  href="/forgot-password"
                  className={buttonVariants({ size: "lg" }) + " w-full"}
                >
                  Request a new reset link
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link href="/login" className={buttonVariants({ variant: "ghost" }) + " w-full"}>
                  Back to sign in
                </Link>
              </div>
            </CardContent>
          </>
        )}

        {status === "provision-failed" && (
          <>
            <CardHeader>
              <CardTitle as="h1">Account confirmed, but profile setup failed</CardTitle>
              <CardDescription>
                Your sign-in is confirmed. We just couldn&apos;t finish preparing your profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div role="alert" className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm leading-relaxed text-slate-600">
                    Retry the setup. If this keeps happening, contact your organization
                    administrator with the email address you sign in with.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => void completeProvisioning()}
                >
                  <RefreshCw aria-hidden="true" />
                  Retry profile setup
                </Button>
                <Link href="/login" className={buttonVariants({ variant: "ghost" }) + " w-full"}>
                  Back to sign in
                </Link>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </AuthShell>
  );
}

function AuthConfirmFallback() {
  return (
    <AuthShell>
      <Card className="shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <CardTitle as="h1">Confirming your link</CardTitle>
          <CardDescription>Please wait while we verify this link.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600"
          >
            <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" aria-hidden="true" />
            Loading…
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

/**
 * Shared email-link callback for recovery, signup, invite, magic-link and email
 * confirmation. Supported entry shapes:
 * - `?code=…` (PKCE exchange)
 * - `?token_hash=…&type=…` (token-hash verification)
 * - an implicit `#access_token=…` fragment detected by the browser client
 * - provider errors (`?error=…&error_description=…`)
 */
export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<AuthConfirmFallback />}>
      <AuthConfirmCard />
    </Suspense>
  );
}
