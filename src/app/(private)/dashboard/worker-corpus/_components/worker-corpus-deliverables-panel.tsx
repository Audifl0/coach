import type { WorkerCorpusDeliverablesResponse } from '@/lib/program/contracts';

import styles from './worker-corpus-dashboard.module.css';
import { WorkerCorpusDeliverableList } from './worker-corpus-deliverable-list';

type Props = {
  deliverables: WorkerCorpusDeliverablesResponse;
};

export function WorkerCorpusDeliverablesPanel({ deliverables }: Props) {
  return (
    <section className={styles.deliverablesGrid}>
      <article className={`${styles.panel} ${styles.panelSpanTwo}`}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>Livrables produits</h2>
            <p className={styles.panelText}>Doctrine publiée, questions prêtes, extractions utiles et artefacts disponibles.</p>
          </div>
          <span className={styles.badge}>{deliverables.emptyReason === 'none' ? 'actif' : deliverables.emptyReason}</span>
        </div>
        <div className={styles.artifactStats}>
          <div className={styles.kv}><span className={styles.label}>Doctrine</span><strong>{deliverables.doctrine.length}</strong></div>
          <div className={styles.kv}><span className={styles.label}>Questions</span><strong>{deliverables.questions.length}</strong></div>
          <div className={styles.kv}><span className={styles.label}>Études</span><strong>{deliverables.studyExtractions.length}</strong></div>
          <div className={styles.kv}><span className={styles.label}>Artefacts</span><strong>{Object.values(deliverables.artifacts).filter((item) => item.available).length}</strong></div>
        </div>
      </article>

      <WorkerCorpusDeliverableList
        title="Doctrine publiée"
        emptyMessage="Aucune doctrine publiée sur le snapshot actif."
        items={deliverables.doctrine}
        renderItem={(item) => (
          <>
            <div className={styles.stageHead}>
              <strong>{item.statementFr}</strong>
              <span className={styles.badge}>{item.confidenceLevel}</span>
            </div>
            <div className={styles.panelText}>{item.conditionsFr}</div>
            <div className={styles.panelText}>{item.limitsFr}</div>
          </>
        )}
      />

      <WorkerCorpusDeliverableList
        title="Questions notables"
        emptyMessage="Aucune question notable prête à afficher."
        items={deliverables.questions}
        renderItem={(item) => (
          <>
            <div className={styles.stageHead}>
              <strong>{item.label}</strong>
              <span className={styles.badge}>{item.publicationStatus}</span>
            </div>
            <div className={styles.panelText}>{item.summaryFr ?? 'Synthèse non disponible.'}</div>
            <div className={styles.chips}>
              <span className={styles.chip}>{item.coverageStatus}</span>
              <span className={styles.chip}>études {item.linkedStudyCount}</span>
              <span className={styles.chip}>contradictions {item.contradictionCount}</span>
            </div>
          </>
        )}
      />

      <WorkerCorpusDeliverableList
        title="Études exploitables"
        emptyMessage="Aucune extraction d’étude exploitable pour le snapshot actif."
        items={deliverables.studyExtractions}
        renderItem={(item) => (
          <>
            <div className={styles.stageHead}>
              <strong>{item.title ?? item.recordId}</strong>
              <span className={styles.badge}>{item.topicKey ?? 'sans tag'}</span>
            </div>
            <div className={styles.panelText}>{item.takeaway ?? 'Aucun signal principal résumé.'}</div>
            <div className={styles.chips}>
              <span className={styles.chip}>{item.intervention ?? 'intervention n/a'}</span>
              <span className={styles.chip}>{item.population ?? 'population n/a'}</span>
            </div>
          </>
        )}
      />

      <article className={`${styles.panel} ${styles.panelSpanTwo}`}>
        <div className={styles.panelHeader}>
          <div>
            <h3 className={styles.panelTitle}>Artefacts</h3>
            <p className={styles.panelText}>Disponibilité immédiate des sorties concrètes du worker.</p>
          </div>
        </div>
        <div className={styles.chips}>
          <span className={styles.chip}>booklet {deliverables.artifacts.booklet.available ? 'oui' : 'non'}</span>
          <span className={styles.chip}>knowledge bible {deliverables.artifacts.knowledgeBible.available ? 'oui' : 'non'}</span>
          <span className={styles.chip}>validated synthesis {deliverables.artifacts.validatedSynthesis.available ? 'oui' : 'non'}</span>
          <span className={styles.chip}>run report {deliverables.artifacts.runReport.available ? 'oui' : 'non'}</span>
          <span className={styles.chip}>snapshot {deliverables.artifacts.snapshot.available ? 'oui' : 'non'}</span>
        </div>
      </article>
    </section>
  );
}
