import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
