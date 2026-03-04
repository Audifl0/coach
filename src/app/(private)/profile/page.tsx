'use client';

import { ProfileForm } from '@/components/profile/profile-form';
import type { ProfileInput } from '@/lib/profile/contracts';

const defaultProfile: ProfileInput = {
  goal: 'hypertrophy',
  weeklySessionTarget: 3,
  sessionDuration: '45_to_75m',
  equipmentCategories: ['bodyweight'],
  limitationsDeclared: false,
  limitations: [],
};

export default function ProfilePage() {
  return (
    <main>
      <h1>Edit profile</h1>
      <ProfileForm mode="edit" initialValue={defaultProfile} />
    </main>
  );
}
