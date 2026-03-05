'use client';

import { useState } from 'react';

type PendingAdaptiveRecommendation = {
  id: string;
  actionType: 'deload' | 'substitution';
  reasons: string[];
  expiresAt: string;
};

export function AdaptiveConfirmationBanner({
  recommendation,
}: {
  recommendation: PendingAdaptiveRecommendation;
}) {
  const [pending, setPending] = useState(false);
  const [resolved, setResolved] = useState<'accepted' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reason = recommendation.reasons[0] ?? 'Un ajustement prudent est propose pour la prochaine seance.';
  const impact =
    recommendation.actionType === 'deload'
      ? 'Impact: reduction temporaire de charge/repetitions pour recuperation.'
      : 'Impact: substitution ciblee pour reduire la contrainte sur la zone sensible.';

  const expiryLabel = new Date(recommendation.expiresAt).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  async function submitDecision(decision: 'accept' | 'reject') {
    setPending(true);
    setError(null);

    try {
      const endpoint =
        decision === 'accept'
          ? `/api/program/adaptation/${recommendation.id}/confirm`
          : `/api/program/adaptation/${recommendation.id}/reject`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          decision === 'accept'
            ? { decision: 'accept' }
            : {
              decision: 'reject',
              reason: 'Utilisateur a rejete la recommandation a fort impact depuis le dashboard',
            },
        ),
      });

      if (!response.ok) {
        setError('Impossible d enregistrer votre decision. Veuillez reessayer.');
        return;
      }

      setResolved(decision === 'accept' ? 'accepted' : 'rejected');
    } catch {
      setError('Impossible d enregistrer votre decision. Veuillez reessayer.');
    } finally {
      setPending(false);
    }
  }

  if (resolved === 'accepted') {
    return (
      <section aria-label="adaptive-confirmation-banner">
        <h2>Ajustement confirme</h2>
        <p>La recommandation a ete appliquee pour la prochaine seance.</p>
      </section>
    );
  }

  if (resolved === 'rejected') {
    return (
      <section aria-label="adaptive-confirmation-banner">
        <h2>Ajustement refuse</h2>
        <p>Un maintien conservateur a ete applique pour la prochaine seance.</p>
      </section>
    );
  }

  return (
    <section aria-label="adaptive-confirmation-banner">
      <h2>Decision requise: ajustement a fort impact</h2>
      <p>{reason}</p>
      <p>{impact}</p>
      <p>Validite: prochaine seance uniquement (expiration {expiryLabel}).</p>
      {error ? <p>{error}</p> : null}
      <div>
        <button type="button" disabled={pending} onClick={() => submitDecision('accept')}>
          {pending ? 'Traitement...' : 'Accepter'}
        </button>
        <button type="button" disabled={pending} onClick={() => submitDecision('reject')}>
          {pending ? 'Traitement...' : 'Refuser'}
        </button>
      </div>
    </section>
  );
}
