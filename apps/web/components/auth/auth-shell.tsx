"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ApiError } from "@/lib/api";

/** Centered card used by the password-reset and email-verification pages (same look as /login). */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(50%_50%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_90%),transparent)]"
      />
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-10 flex flex-col items-center gap-2 text-center">
          <Link href="/">
            <Logo size={44} />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </main>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          : "flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-foreground"
      }
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Same wording as the login page for server/network failures. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (err instanceof ApiError && err.status >= 500) return "The server is having a problem right now. Please try again in a minute.";
  if (err instanceof ApiError) return err.message;
  return "Can't reach the server. Check your internet connection and try again.";
}
