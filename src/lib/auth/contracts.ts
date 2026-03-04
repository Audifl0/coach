import { z } from 'zod';

export const signupInputSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const loginInputSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const sessionContextSchema = z.object({
  userId: z.string().trim().min(1, 'Authenticated userId is required'),
});

export type SignupInput = z.infer<typeof signupInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type SessionContext = z.infer<typeof sessionContextSchema>;

export function validateSignupInput(input: unknown): SignupInput {
  return signupInputSchema.parse(input);
}

export function validateLoginInput(input: unknown): LoginInput {
  return loginInputSchema.parse(input);
}
