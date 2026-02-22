import { fsrs, Rating, type Grade, type RecordLogItem } from 'ts-fsrs';
import type { FlashCard } from './models';

const f = fsrs();

export { Rating };
export type { Grade };

export function reviewCard(card: FlashCard, grade: Grade): FlashCard {
  const record = f.repeat(card.fsrs, new Date());
  const item: RecordLogItem = record[grade];
  return {
    ...card,
    fsrs: item.card,
  };
}

export function getNextReviewLabel(card: FlashCard): string {
  const due = new Date(card.fsrs.due);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) return 'Now';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

export function formatDueDate(card: FlashCard): string {
  const due = new Date(card.fsrs.due);
  const now = new Date();
  const sameYear = due.getFullYear() === now.getFullYear();
  const month = due.toLocaleString('en-US', { month: 'short' });
  const day = due.getDate();
  const time = due.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (sameYear) return `${month} ${day}, ${time}`;
  return `${month} ${day}, ${due.getFullYear()}, ${time}`;
}
