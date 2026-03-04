'use client';

import { useEffect, useState } from 'react';
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
  const [profile, setProfile] = useState<ProfileInput>(defaultProfile);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const response = await fetch('/api/profile');
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as { profile?: ProfileInput; complete?: boolean };
        if (!mounted) {
          return;
        }

        if (body.profile) {
          setProfile(body.profile);
        }

        if (body.complete) {
          router.replace('/dashboard');
          router.refresh();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <main>
      <h1>Onboarding</h1>
      <p>Complete your training profile before accessing your dashboard.</p>
      {loading ? <p>Loading profile...</p> : null}
      <ProfileForm
        key={JSON.stringify(profile)}
        mode="onboarding"
        initialValue={profile}
        onSuccess={() => {
          router.replace('/dashboard');
          router.refresh();
        }}
      />
    </main>
  );
}
