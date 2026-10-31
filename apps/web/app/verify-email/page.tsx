"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthShell, FormAlert, errorText } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useVerifyEmail } from "@/hooks/use-auth";

export default function VerifyEmailPage() {
  const verify = useVerifyEmail();
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React dev mode runs effects twice; a link works once.
    started.current = true;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.pathname + url.search);
    if (!token) {
      setError("This link is incomplete. Open the link from your email again.");
      setState("failed");
      return;
    }
    verify.mutate(token, {
      onSuccess: () => setState("done"),
      onError: (err) => {
        setError(errorText(err));
        setState("failed");
      },
    });
  }, [verify]);

  return (
    <AuthShell title="Confirm your email">
      {state === "working" && <p className="text-center text-sm text-muted-foreground">Confirming…</p>}
      {state === "done" && (
        <div className="flex flex-col gap-5">
          <FormAlert tone="success">Thanks, your email address is confirmed.</FormAlert>
          <Button className="h-12 text-base" render={<Link href="/dashboard" />}>
            Go to dashboard
          </Button>
        </div>
      )}
      {state === "failed" && (
        <FormAlert tone="error">
          {error} You can send a new link from the banner at the top of your dashboard.
        </FormAlert>
      )}
    </AuthShell>
  );
}
