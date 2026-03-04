import assert from 'node:assert/strict';
import test from 'node:test';

import { createProfileDal, mergeProfilePatch, type AthleteProfileRecord } from '../../src/server/dal/profile';
import { createProfileGetHandler, createProfilePutHandler } from '../../src/app/api/profile/route';

function createProfile() {
  return {
    userId: 'user_1',
    goal: 'strength',
    weeklySessionTarget: 4,
    sessionDuration: '45_to_75m',
    equipmentCategories: ['dumbbells'],
    limitationsDeclared: true,
    limitations: [{ zone: 'knee', severity: 'moderate', temporality: 'chronic' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AthleteProfileRecord;
}

test('account isolation and merge semantics', async () => {
  const profile = createProfile();

  const merged = mergeProfilePatch(
    {
      goal: profile.goal,
      weeklySessionTarget: profile.weeklySessionTarget,
      sessionDuration: profile.sessionDuration,
      equipmentCategories: [...profile.equipmentCategories],
      limitationsDeclared: profile.limitationsDeclared,
      limitations: [...profile.limitations],
    },
    { weeklySessionTarget: 5 },
  );

  assert.equal(merged.weeklySessionTarget, 5);
  assert.deepEqual(merged.equipmentCategories, ['dumbbells']);
  assert.equal(merged.limitationsDeclared, true);
});

test('profile route rejects unauthorized access', async () => {
  const get = createProfileGetHandler({
    resolveSession: async () => null,
    getProfile: async () => null,
    upsertProfile: async () => null,
    patchProfile: async () => null,
  });

  const response = await get();
  assert.equal(response.status, 401);
});

test('profile route enforces first-pass payload for onboarding save', async () => {
  const put = createProfilePutHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getProfile: async () => null,
    upsertProfile: async () => null,
    patchProfile: async () => null,
  });

  const response = await put(
    new Request('http://localhost/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'onboarding', goal: 'strength' }),
    }),
  );

  assert.equal(response.status, 400);
});

test('profile route keeps untouched sections on edit patch', async () => {
  let persisted = createProfile();

  const dal = createProfileDal({
    athleteProfile: {
      findUnique: async () => persisted,
      upsert: async () => persisted,
      update: async ({ data }) => {
        persisted = { ...persisted, ...data, updatedAt: new Date() };
        return persisted;
      },
    },
  });

  const put = createProfilePutHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getProfile: async () => persisted,
    upsertProfile: async (userId, input) => dal.upsertProfile(userId, input as never),
    patchProfile: async (userId, input) => dal.patchProfile(userId, input as never),
  });

  const response = await put(
    new Request('http://localhost/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'edit', weeklySessionTarget: 5 }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(persisted.weeklySessionTarget, 5);
  assert.deepEqual(persisted.equipmentCategories, ['dumbbells']);
  assert.equal(persisted.limitationsDeclared, true);
});

test('first-pass save', async () => {
  const profile = createProfile();

  const put = createProfilePutHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getProfile: async () => null,
    upsertProfile: async () => profile,
    patchProfile: async () => profile,
  });

  const response = await put(
    new Request('http://localhost/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'onboarding',
        goal: 'strength',
        weeklySessionTarget: 4,
        sessionDuration: '45_to_75m',
        equipmentCategories: ['dumbbells'],
        limitationsDeclared: false,
        limitations: [],
      }),
    }),
  );

  assert.equal(response.status, 200);
});
