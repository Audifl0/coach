'use client';

import { FormEvent, useState } from 'react';

import {
  equipmentCategoryValues,
  profileGoalValues,
  sessionDurationValues,
  type ProfileInput,
} from '@/lib/profile/contracts';

type ProfileFormMode = 'onboarding' | 'edit';

type ProfileFormProps = {
  mode: ProfileFormMode;
  initialValue: ProfileInput;
  onSuccess?: (profile: ProfileInput) => void;
};

type FormState = {
  pending: boolean;
  error: string | null;
  success: string | null;
};

export function ProfileForm({ mode, initialValue, onSuccess }: ProfileFormProps) {
  const [state, setState] = useState<FormState>({ pending: false, error: null, success: null });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const limitationsDeclared = formData.get('limitationsDeclared') === 'yes';
    const limitationZone = String(formData.get('limitationZone') ?? '').trim();
    const limitationSeverity = String(formData.get('limitationSeverity') ?? 'none');
    const limitationTemporality = String(formData.get('limitationTemporality') ?? 'temporary');

    const payload: ProfileInput & { mode: ProfileFormMode } = {
      mode,
      goal: String(formData.get('goal')) as ProfileInput['goal'],
      weeklySessionTarget: Number(formData.get('weeklySessionTarget')),
      sessionDuration: String(formData.get('sessionDuration')) as ProfileInput['sessionDuration'],
      equipmentCategories: formData
        .getAll('equipmentCategories')
        .map((value) => String(value)) as ProfileInput['equipmentCategories'],
      limitationsDeclared,
      limitations: limitationsDeclared
        ? [
            {
              zone: limitationZone,
              severity: limitationSeverity as ProfileInput['limitations'][number]['severity'],
              temporality: limitationTemporality as ProfileInput['limitations'][number]['temporality'],
            },
          ]
        : [],
    };

    setState({ pending: true, error: null, success: null });

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { error?: string; profile?: ProfileInput };
      if (!response.ok || !body.profile) {
        setState({ pending: false, error: body.error ?? 'Unable to save profile.', success: null });
        return;
      }

      setState({ pending: false, error: null, success: 'Profile saved.' });
      onSuccess?.(body.profile);
    } catch {
      setState({ pending: false, error: 'Network error. Please retry.', success: null });
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset>
        <legend>Goal</legend>
        <select name="goal" defaultValue={initialValue.goal} required={mode === 'onboarding'}>
          {profileGoalValues.map((goal) => (
            <option key={goal} value={goal}>
              {goal}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <legend>Constraints</legend>
        <label htmlFor="weeklySessionTarget">Sessions / week</label>
        <input
          id="weeklySessionTarget"
          name="weeklySessionTarget"
          type="number"
          min={1}
          max={7}
          defaultValue={initialValue.weeklySessionTarget}
          required={mode === 'onboarding'}
        />

        <label htmlFor="sessionDuration">Session duration</label>
        <select
          id="sessionDuration"
          name="sessionDuration"
          defaultValue={initialValue.sessionDuration}
          required={mode === 'onboarding'}
        >
          {sessionDurationValues.map((duration) => (
            <option key={duration} value={duration}>
              {duration}
            </option>
          ))}
        </select>

        <p>Equipment</p>
        {equipmentCategoryValues.map((equipment) => (
          <label key={equipment}>
            <input
              type="checkbox"
              name="equipmentCategories"
              value={equipment}
              defaultChecked={initialValue.equipmentCategories.includes(equipment)}
            />
            {equipment}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Limitations</legend>
        <label>
          <input
            type="radio"
            name="limitationsDeclared"
            value="no"
            defaultChecked={!initialValue.limitationsDeclared}
          />
          No limitation
        </label>
        <label>
          <input
            type="radio"
            name="limitationsDeclared"
            value="yes"
            defaultChecked={initialValue.limitationsDeclared}
          />
          Limitation declared
        </label>

        <label htmlFor="limitationZone">Zone</label>
        <input
          id="limitationZone"
          name="limitationZone"
          type="text"
          defaultValue={initialValue.limitations[0]?.zone ?? ''}
        />

        <label htmlFor="limitationSeverity">Severity</label>
        <select
          id="limitationSeverity"
          name="limitationSeverity"
          defaultValue={initialValue.limitations[0]?.severity ?? 'none'}
        >
          <option value="none">none</option>
          <option value="mild">mild</option>
          <option value="moderate">moderate</option>
          <option value="severe">severe</option>
        </select>

        <label htmlFor="limitationTemporality">Temporality</label>
        <select
          id="limitationTemporality"
          name="limitationTemporality"
          defaultValue={initialValue.limitations[0]?.temporality ?? 'temporary'}
        >
          <option value="temporary">temporary</option>
          <option value="chronic">chronic</option>
        </select>
      </fieldset>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p>{state.success}</p> : null}

      <button type="submit" disabled={state.pending}>
        {state.pending ? 'Saving...' : mode === 'onboarding' ? 'Complete onboarding' : 'Save profile'}
      </button>
    </form>
  );
}
