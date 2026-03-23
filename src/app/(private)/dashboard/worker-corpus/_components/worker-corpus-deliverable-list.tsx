import type { ReactNode } from 'react';

import styles from './worker-corpus-dashboard.module.css';

type WorkerCorpusDeliverableListProps<T> = {
  title: string;
  emptyMessage: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
};

export function WorkerCorpusDeliverableList<T>({
  title,
  emptyMessage,
  items,
  renderItem,
}: WorkerCorpusDeliverableListProps<T>) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h3 className={styles.panelTitle}>{title}</h3>
        </div>
        <span className={styles.badge}>{items.length}</span>
      </div>
      <div className={styles.contentStack}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>{emptyMessage}</div>
        ) : (
          items.map((item, index) => (
            <div key={index} className={styles.stageItem}>
              {renderItem(item, index)}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
