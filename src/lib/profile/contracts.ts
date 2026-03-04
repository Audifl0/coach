import { z } from 'zod';

export const profileGoalValues = ['hypertrophy', 'strength', 'recomposition'] as const;
export const sessionDurationValues = ['lt_45m', '45_to_75m', 'gt_75m'] as const;
export const equipmentCategoryValues = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'bench',
  'machines',
  'bands',
] as const;
export const limitationSeverityValues = ['none', 'mild', 'moderate', 'severe'] as const;
export const limitationTemporalityValues = ['temporary', 'chronic'] as const;

const limitationSchema = z.object({
  zone: z.string().trim().min(1, 'Limitation zone is required'),
  severity: z.enum(limitationSeverityValues),
  temporality: z.enum(limitationTemporalityValues),
});

const equipmentCategoriesSchema = z
  .array(z.enum(equipmentCategoryValues))
  .min(1, 'At least one equipment category is required');

const baseProfileSchema = z.object({
  goal: z.enum(profileGoalValues),
  weeklySessionTarget: z.number().int().min(1).max(7),
  sessionDuration: z.enum(sessionDurationValues),
  equipmentCategories: equipmentCategoriesSchema,
  limitationsDeclared: z.boolean(),
  limitations: z.array(limitationSchema),
});

export const profileInputSchema = baseProfileSchema
  .superRefine((value, context) => {
    if (value.limitationsDeclared && value.limitations.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one limitation is required when limitations are declared',
        path: ['limitations'],
      });
    }

    if (!value.limitationsDeclared && value.limitations.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Limitations must be empty when no limitations are declared',
        path: ['limitations'],
      });
    }
  });

export const profilePatchSchema = baseProfileSchema.partial().superRefine((value, context) => {
  if (value.limitationsDeclared === true && (!value.limitations || value.limitations.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Limitations are required when setting limitationsDeclared to true',
      path: ['limitations'],
    });
  }

  if (value.limitationsDeclared === false && value.limitations && value.limitations.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Limitations must be empty when setting limitationsDeclared to false',
      path: ['limitations'],
    });
  }
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;

export function validateProfileInput(input: unknown): ProfileInput {
  return profileInputSchema.parse(input);
}

export function validateProfilePatch(input: unknown): ProfilePatchInput {
  return profilePatchSchema.parse(input);
}
