/**
 * AUTH TYPES
 *
 * Types for authentication.
 */

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  company_name: z.string().min(1),
});

export type LoginDTO = z.infer<typeof loginSchema>;
export type SignupDTO = z.infer<typeof signupSchema>;

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    full_name: string | null;
  };
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
}

export interface SessionResponse {
  user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  valid: boolean;
}
