'use client';

import { useRouter } from 'next/navigation';

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

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <main>
      <h1>Onboarding</h1>
      <p>Complete your training profile before accessing your dashboard.</p>
      <ProfileForm
        mode="onboarding"
        initialValue={defaultProfile}
        onSuccess={() => {
          router.replace('/dashboard');
          router.refresh();
        }}
      />
    </main>
  );
}
