import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Authenticator code or recovery code, once two-factor auth is on.
  totp: z.string().trim().min(6).max(20).optional(),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  restaurantName: z.string().min(1),
  branchName: z.string().min(1).default("Main Branch"),
  ownerName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const pinLoginSchema = z.object({
  userId: z.string(),
  pin: z.string().min(4).max(8),
});
export type PinLoginDto = z.infer<typeof pinLoginSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  name: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  permissions: z.array(z.string()),
  // false only for a self-signup whose verification link hasn't been clicked yet.
  emailVerified: z.boolean().optional(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(8).max(128),
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(20).max(200),
});
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(6).max(20) });
export const twoFactorDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(6).max(20),
});
