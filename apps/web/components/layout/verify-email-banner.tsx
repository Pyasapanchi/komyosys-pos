"use client";

import type { SessionUser } from "@nodedr-restaurant/types";
import { MailWarning } from "lucide-react";
import { useState } from "react";
import { useResendVerification } from "@/hooks/use-auth";

/** Shown to a self-signup owner until they click the link in their welcome email. */
export function VerifyEmailBanner({ user }: { user?: SessionUser }) {
  const resend = useResendVerification();
  const [sent, setSent] = useState(false);
  if (!user || user.emailVerified !== false) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground sm:px-6">
      <MailWarning className="h-4 w-4 shrink-0 text-primary" />
      <span>Please confirm your email address: we sent you a link when you signed up.</span>
      {sent ? (
        <span className="text-muted-foreground">Sent. Check your inbox and spam folder.</span>
      ) : (
        <button
          type="button"
          onClick={() => resend.mutate(undefined, { onSuccess: () => setSent(true) })}
          disabled={resend.isPending}
          className="font-medium text-primary underline underline-offset-2 hover:no-underline disabled:opacity-50"
        >
          {resend.isPending ? "Sending…" : "Send it again"}
        </button>
      )}
    </div>
  );
}
