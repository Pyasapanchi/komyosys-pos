"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthShell, FormAlert, errorText } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useResetPassword } from "@/hooks/use-auth";

/** Reads ?token= once, then drops it from the address bar and browser history. */
function useLinkToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const url = new URL(window.location.href);
    setToken(url.searchParams.get("token"));
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);
  return token;
}

export default function ResetPasswordPage() {
  const token = useLinkToken();
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    reset.mutate(
      { token: token ?? "", password },
      { onSuccess: () => setDone(true), onError: (err) => setError(errorText(err)) },
    );
  };

  if (token === undefined) return null;

  return (
    <AuthShell title="Choose a new password">
      {done ? (
        <div className="flex flex-col gap-5">
          <FormAlert tone="success">
            Your password has been changed, and you&rsquo;ve been signed out on every device. Sign in with your new
            password.
          </FormAlert>
          <Button className="h-12 text-base" render={<Link href="/login" />}>
            Sign in
          </Button>
        </div>
      ) : !token ? (
        <FormAlert tone="error">
          This link is incomplete. Open the link from your email again, or{" "}
          <Link href="/forgot-password" className="font-medium underline">
            request a new one
          </Link>
          .
        </FormAlert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              autoFocus
              className="h-11"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              className="h-11"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && (
            <FormAlert tone="error">
              {error}
              {/expired|invalid/i.test(error) && (
                <>
                  {" "}
                  <Link href="/forgot-password" className="font-medium underline">
                    Request a new link
                  </Link>
                </>
              )}
            </FormAlert>
          )}

          <Button type="submit" className="mt-2 h-12 text-base" disabled={reset.isPending}>
            {reset.isPending ? "Saving…" : "Save new password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
