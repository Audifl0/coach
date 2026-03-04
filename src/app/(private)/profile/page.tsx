'use client';

import { useEffect, useState } from 'react';

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

        const body = (await response.json()) as { profile?: ProfileInput };
        if (mounted && body.profile) {
          setProfile(body.profile);
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
  }, []);

  return (
    <main>
      <h1>Edit profile</h1>
      {loading ? <p>Loading profile...</p> : null}
      <ProfileForm key={JSON.stringify(profile)} mode="edit" initialValue={profile} />
    </main>
  );
}
