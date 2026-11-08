"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BadgeCheck, IdCard, ScanLine, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

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
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-100">Welcome back</p>
            <p className="mt-3 text-balance font-display text-4xl font-bold leading-tight xl:text-5xl">
              Attendance you can prove, not just record.
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
            {/* mini verified-scan chip */}
            <div className="mt-8 flex items-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
              <BadgeCheck className="size-5 shrink-0 text-emerald-300" aria-hidden="true" />
              <p className="text-[13px] text-white/85">
                Verified check-in · Maria Santos · 8:02 AM
              </p>
            </div>
          </div>
          <SyntaxureCredit onDark />
        </div>
      </div>

      {/* form panel */}
      <div className="relative flex flex-col">
        <div aria-hidden="true" className="pp-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_20%,#000,transparent)]" />
        <div className="flex h-16 items-center justify-between px-4 sm:px-8">
          <span className="hidden text-sm text-slate-500 lg:inline">
            New to Prism Pass?{" "}
            <Link href="/demo" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Book a demo
            </Link>
          </span>
          
        </div>
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="pp-hero relative mb-5 overflow-hidden rounded-2xl px-5 py-6 text-white lg:hidden">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-400 via-violet-400 to-teal-300" />
              <BrandLogo onDark size={32} />
              <p className="mt-5 text-balance text-[23px] font-semibold leading-[1.15] tracking-[-0.02em]">
                Attendance you can prove.
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">
                Sign in to reach your organization consoles.
              </p>
            </div>
            <Card className="shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <CardTitle as="h1">Sign in</CardTitle>
                <CardDescription>Use your organization-issued email account.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={submit}
                  className="flex flex-col gap-4"
                  noValidate
                  aria-describedby={err ? "login-error" : undefined}
                >
                  <FormField label="Email" htmlFor="login-email" required error={err && !email ? "Enter your email address." : null}>
                    <Input id="login-email" placeholder="you@org.edu" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required autoFocus />
                  </FormField>
                  <FormField label="Password" htmlFor="login-password" required error={err && !password ? "Password is required." : null}>
                    <Input id="login-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
                  </FormField>
                  {err && (
                    <p id="login-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14.5px] text-red-700">
                      Sign in failed — {err}
                    </p>
                  )}
                  <Button type="submit" size="lg" disabled={busy} className="w-full">
                    {busy ? "Signing in…" : (<>Sign in <ArrowRight aria-hidden="true" /></>)}
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-slate-500">
                  Forgot your password?{" "}
                  <Link href="/reset-password" className="font-medium text-blue-700 underline underline-offset-2">
                    Reset it
                  </Link>
                </p>
              </CardContent>
            </Card>
            <p className="mt-6 text-center text-xs text-slate-500">
              Having trouble? Contact your organization administrator.
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
