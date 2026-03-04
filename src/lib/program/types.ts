export const movementPatternValues = [
  'squat',
  'hinge',
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'core',
] as const;

export const equipmentTagValues = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'bench',
  'machines',
  'bands',
] as const;

export const sessionStateValues = ['planned', 'started', 'completed', 'skipped'] as const;

export type MovementPattern = (typeof movementPatternValues)[number];
export type EquipmentTag = (typeof equipmentTagValues)[number];
export type SessionState = (typeof sessionStateValues)[number];

export type LimitationSeverity = 'none' | 'mild' | 'moderate' | 'severe';

export type LimitationConstraint = {
  zone: string;
  severity: LimitationSeverity;
};

export type ExerciseCatalogEntry = {
  key: string;
  displayName: string;
  movementPattern: MovementPattern;
  equipmentTags: EquipmentTag[];
  blockedLimitations: string[];
  compatibleSubstitutionKeys: string[];
};
