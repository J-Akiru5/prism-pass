"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BadgeCheck, IdCard, ScanLine, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

const PANEL_POINTS = [
  { Icon: IdCard, text: "One directory, one QR identity pass per member." },
  { Icon: ScanLine, text: "Gate scanning with instant server verification." },
  { Icon: ShieldCheck, text: "Tenant-scoped data with a full audit trail." },
];

/**
 * Modern split-view sign-in: brand + value panel on the left (desktop),
 * form card on the right. Auth logic unchanged — Supabase only.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get("next") || "/consoles";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(next);
  }

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden bg-navy-deep text-white lg:block">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-deep via-navy to-[#070F22]" />
          <div className="absolute -left-32 top-[-10%] h-[28rem] w-[28rem] rounded-full bg-[#1B3A6B]/70 blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] h-[26rem] w-[26rem] rounded-full bg-[#C9A24B]/20 blur-[120px]" />
          <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
        </div>
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" aria-label="Prism Pass home" className="w-fit">
            <PrismPassLogo onDark size={40} />
          </Link>
          <div className="max-w-md">
            <span aria-hidden="true" className="mb-5 block h-px w-12 bg-gradient-to-r from-gold-soft to-transparent" />
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold-soft">Welcome back</p>
            <h1 className="mt-3 text-balance font-display text-4xl font-bold leading-tight xl:text-5xl">
              Attendance you can prove, not just record.
            </h1>
            <ul className="mt-8 space-y-4">
              {PANEL_POINTS.map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-soft">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-[15px] text-white/80">{text}</span>
                </li>
              ))}
            </ul>
            {/* mini verified-scan chip */}
            <div className="mt-8 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
              <BadgeCheck className="size-5 shrink-0 text-emerald-300" aria-hidden="true" />
              <p className="text-xs text-white/70">
                Verified check-in · Maria Santos · BSIT 3-A · <span className="font-mono">08:02:14</span>
              </p>
            </div>
          </div>
          <SyntaxureCredit onDark />
        </div>
      </div>

      {/* form panel */}
      <div className="relative flex flex-col">
        <div className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link href="/" className="lg:hidden" aria-label="Prism Pass home">
            <PrismPassLogo size={30} />
          </Link>
          <span className="hidden text-sm text-muted-foreground lg:inline">
            New to Prism Pass?{" "}
            <Link href="/demo" className="font-semibold text-primary underline-offset-2 hover:underline">
              Book a demo
            </Link>
          </span>
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="mb-6 lg:hidden">
              <h1 className="text-balance font-display text-3xl font-bold tracking-tight">Welcome back</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Sign in to reach your organization consoles.</p>
            </div>
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Sign in</CardTitle>
                <CardDescription>Use your organization-issued email account.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
                  <FormField label="Email" htmlFor="login-email" required error={err && !email ? "Enter your email address." : null}>
                    <Input id="login-email" placeholder="you@org.edu" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required autoFocus />
                  </FormField>
                  <FormField label="Password" htmlFor="login-password" required error={err && !password ? "Password is required." : null}>
                    <Input id="login-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
                  </FormField>
                  {err && (
                    <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      Sign in failed — {err}
                    </p>
                  )}
                  <Button type="submit" size="lg" disabled={busy} className="w-full">
                    {busy ? "Signing in…" : (<>Sign in <ArrowRight aria-hidden="true" /></>)}
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Forgot your password?{" "}
                  <Link href="/reset-password" className="font-medium text-primary underline underline-offset-2">
                    Reset it
                  </Link>
                </p>
              </CardContent>
            </Card>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Having trouble? Contact your organization administrator.
            </p>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              <Link href="/privacy" className="font-semibold text-primary underline decoration-accent/60 underline-offset-2">
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
