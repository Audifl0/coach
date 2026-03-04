import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoryQueryString,
  buildHistoryViewState,
  mapSessionDetailToGroupedSets,
} from '../../src/app/(private)/dashboard/_components/session-history-card';

test('history query generation supports 7d/30d/90d and custom ranges deterministically', () => {
  assert.equal(buildHistoryQueryString({ period: '7d' }), 'period=7d');
  assert.equal(buildHistoryQueryString({ period: '30d' }), 'period=30d');
  assert.equal(buildHistoryQueryString({ period: '90d' }), 'period=90d');
  assert.equal(
    buildHistoryQueryString({
      period: 'custom',
      from: '2026-02-01',
      to: '2026-02-14',
    }),
    'period=custom&from=2026-02-01&to=2026-02-14',
  );
});

test('history rows expose date duration exercise count and total load summary labels', () => {
  const view = buildHistoryViewState({
    sessions: [
      {
        id: 'session_1',
        date: '2026-03-03',
        duration: 3900,
        exerciseCount: 4,
        totalLoad: 1450,
      },
    ],
  });

  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.dateLabel, '2026-03-03');
  assert.equal(view.rows[0]?.durationLabel, '65 min');
  assert.equal(view.rows[0]?.exerciseCountLabel, '4 exercices');
  assert.equal(view.rows[0]?.totalLoadLabel, '1450 kg');
});

test('history detail drilldown groups logged sets by exercise in ascending set order', () => {
  const grouped = mapSessionDetailToGroupedSets({
    session: {
      id: 'session_1',
      exercises: [
        {
          id: 'exercise_1',
          displayName: 'Goblet Squat',
          loggedSets: [
            { setIndex: 2, weight: 22.5, reps: 8, rpe: 8 },
            { setIndex: 1, weight: 20, reps: 10, rpe: null },
          ],
        },
      ],
    },
  });

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.displayName, 'Goblet Squat');
  assert.equal(grouped[0]?.sets[0]?.setIndex, 1);
  assert.equal(grouped[0]?.sets[1]?.setIndex, 2);
});

test('history view state keeps empty and error states explicit', () => {
  const empty = buildHistoryViewState({ sessions: [] });
  assert.equal(empty.state, 'empty');
  assert.equal(empty.rows.length, 0);

  const error = buildHistoryViewState({ sessions: null, errorMessage: 'Unable to load program history' });
  assert.equal(error.state, 'error');
  assert.equal(error.errorMessage, 'Unable to load program history');
});
