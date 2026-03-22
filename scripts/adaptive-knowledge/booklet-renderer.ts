import type { StudyCard, ThematicSynthesis } from './contracts';

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function formatGeneratedDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

function bibliographyIdentifier(card: StudyCard): string {
  return card.doi ?? card.recordId;
}

export function renderBookletMarkdown(input: {
  thematicSyntheses: ThematicSynthesis[];
  studyCards: StudyCard[];
  generatedAt: string;
  snapshotId: string;
}): string {
  const sortedSyntheses = [...input.thematicSyntheses].sort((left, right) => {
    const leftLabel = left.topicLabel?.trim() || left.topicKey;
    const rightLabel = right.topicLabel?.trim() || right.topicKey;
    return leftLabel.localeCompare(rightLabel, 'fr');
  });
  const cardsByRecordId = new Map(input.studyCards.map((card) => [card.recordId, card]));
  const bibliographyCards = [...input.studyCards].sort((left, right) => {
    if (right.year !== left.year) {
      return right.year - left.year;
    }
    return left.title.localeCompare(right.title, 'fr');
  });

  const lines: string[] = [
    '# Bibliothèque Scientifique — Coach Musculation IA',
    `## Généré le ${formatGeneratedDate(input.generatedAt)} — ${input.studyCards.length} études analysées`,
    '',
  ];

  sortedSyntheses.forEach((synthesis, index) => {
    const heading = synthesis.topicLabel?.trim() || synthesis.topicKey;
    lines.push(`### ${index + 1}. ${heading}`);
    lines.push('#### Synthèse');
    lines.push(synthesis.summaryFr);
    lines.push('');
    lines.push('#### Principes');

    synthesis.principlesFr.forEach((principle, principleIndex) => {
      lines.push(`- **Principe ${principleIndex + 1} : ${principle.title}** — ${principle.statement}`);
      lines.push(
        `  - Conditions d'application : ${principle.conditions.length > 0 ? principle.conditions.join(' ; ') : 'Aucune condition précisée'}`,
      );
      lines.push(`  - Niveau d'évidence : ${principle.evidenceLevel}`);
      lines.push(`  - Garde-fou : ${principle.guardrail}`);
    });

    const sourceCardIds = [...new Set(synthesis.principlesFr.flatMap((principle) => principle.sourceCardIds))];
    const topicCards = sourceCardIds
      .map((recordId) => cardsByRecordId.get(recordId))
      .filter((card): card is StudyCard => Boolean(card));

    if (topicCards.length > 0) {
      lines.push('');
      lines.push('#### Études de référence');
      lines.push('| Étude | Type | Population | Résultat principal | Takeaway |');
      lines.push('|-------|------|------------|-------------------|----------|');
      topicCards.forEach((card) => {
        lines.push(
          `| ${escapeMarkdownTableCell(`${card.langueFr.titreFr} (${card.year})`)} | ${escapeMarkdownTableCell(card.studyType)} | ${escapeMarkdownTableCell(card.population.description)} | ${escapeMarkdownTableCell(card.results.primary)} | ${escapeMarkdownTableCell(card.practicalTakeaways[0] ?? '')} |`,
        );
      });
    }

    lines.push('');
  });

  lines.push('### Bibliographie complète');
  bibliographyCards.forEach((card) => {
    lines.push(`- ${bibliographyIdentifier(card)} — ${card.title} (${card.year}), ${card.journal}`);
  });

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}
