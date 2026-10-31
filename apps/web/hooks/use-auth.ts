"use client";

import {
  permissionSatisfied,
  type ForgotPasswordDto,
  type LoginDto,
  type RegisterDto,
  type ResetPasswordDto,
  type SessionUser,
} from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<{ user: SessionUser }>("/auth/me"),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: LoginDto) => api.post<{ user: SessionUser }>("/auth/login", dto),
    onSuccess: (data) => {
      // Anything cached before this login belongs to nobody (or to the previous
      // user): drop it so branches and the rest load fresh for this account.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
      queryClient.setQueryData(["auth", "me"], data);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RegisterDto) => api.post<{ user: SessionUser }>("/auth/register", dto),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth", "me"], data);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (dto: ForgotPasswordDto) => api.post<{ ok: true }>("/auth/forgot-password", dto),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (dto: ResetPasswordDto) => api.post<{ ok: true }>("/auth/reset-password", dto),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.post<{ ok: true }>("/auth/verify-email", { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>("/auth/resend-verification"),
  });
}

export function hasPermission(user: SessionUser | undefined, permission: string): boolean {
  return user ? permissionSatisfied(user.permissions, permission) : false;
}
