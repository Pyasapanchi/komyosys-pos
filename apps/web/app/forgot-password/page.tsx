"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordDto } from "@nodedr-restaurant/types";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthShell, FormAlert, errorText } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForgotPassword } from "@/hooks/use-auth";

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordDto>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = (dto: ForgotPasswordDto) => {
    setError(null);
    forgot.mutate(dto, {
      onSuccess: () => setSentTo(dto.email),
      onError: (err) => setError(errorText(err)),
    });
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a link to choose a new one">
      {sentTo ? (
        <FormAlert tone="success">
          If <strong>{sentTo}</strong> has an account, a reset link is on its way. It works once and expires in 30
          minutes. Check your spam folder if it doesn&rsquo;t arrive in a few minutes.
        </FormAlert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className="h-11"
              placeholder="you@restaurant.com"
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          {error && <FormAlert tone="error">{error}</FormAlert>}

          <Button type="submit" className="mt-2 h-12 text-base" disabled={forgot.isPending}>
            {forgot.isPending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
