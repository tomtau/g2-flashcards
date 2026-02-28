import type { Deck, FlashCard } from './models';
import { generateId } from './models';
import { createEmptyCard, State } from 'ts-fsrs';

const STORAGE_KEY = 'g2-flashcards-decks';
const REVIEW_PREFS_KEY = 'g2-flashcards-review-prefs';

export interface CardCounts {
  new: number;
  learning: number;
  review: number;
}

export interface DueCardCounts {
  newDue: number;
  learningDue: number;
  reviewDue: number;
}

export function loadDecks(): Deck[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const decks: Deck[] = JSON.parse(raw);
    for (const deck of decks) {
      for (const card of deck.cards) {
        card.fsrs.due = new Date(card.fsrs.due);
        if (card.fsrs.last_review) {
          card.fsrs.last_review = new Date(card.fsrs.last_review);
        }
      }
    }
    return decks;
  } catch {
    return [];
  }
}

export function saveDecks(decks: Deck[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

export function createDeck(name: string): Deck {
  return {
    id: generateId(),
    name,
    cards: [],
    createdAt: new Date().toISOString(),
  };
}

export function createFlashCard(front: string, back: string): FlashCard {
  return {
    id: generateId(),
    front,
    back,
    fsrs: createEmptyCard(),
  };
}

export function getCardCounts(deck: Deck): CardCounts {
  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  for (const card of deck.cards) {
    switch (card.fsrs.state) {
      case State.New:
        newCount++;
        break;
      case State.Learning:
      case State.Relearning:
        learningCount++;
        break;
      case State.Review:
        reviewCount++;
        break;
    }
  }
  return { new: newCount, learning: learningCount, review: reviewCount };
}

export function getDueCardCounts(deck: Deck): DueCardCounts {
  const now = new Date();
  let newDue = 0;
  let learningDue = 0;
  let reviewDue = 0;
  for (const card of deck.cards) {
    if (new Date(card.fsrs.due) > now) continue;
    switch (card.fsrs.state) {
      case State.New:
        newDue++;
        break;
      case State.Learning:
      case State.Relearning:
        learningDue++;
        break;
      case State.Review:
        reviewDue++;
        break;
    }
  }
  return { newDue, learningDue, reviewDue };
}

export function getDueCards(deck: Deck, limit: number, newCardLimit?: number): FlashCard[] {
  const now = new Date();
  const due = deck.cards.filter((c) => new Date(c.fsrs.due) <= now);

  const reviewAndLearning = due
    .filter((c) => c.fsrs.state !== State.New)
    .sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());

  const newCards = due
    .filter((c) => c.fsrs.state === State.New)
    .sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());

  if (newCardLimit === undefined) {
    // Legacy behavior: sort all by due date
    const all = [...due].sort(
      (a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime(),
    );
    return all.slice(0, limit);
  }

  // Take review/learning cards first (up to limit), then fill with new cards
  const result: FlashCard[] = reviewAndLearning.slice(0, limit);
  const remaining = limit - result.length;
  if (remaining > 0) {
    const cappedNew = Math.min(remaining, newCardLimit);
    result.push(...newCards.slice(0, cappedNew));
  }
  return result;
}

export interface ReviewPrefs {
  reviewCount: number;
  newCardLimit: number;
}

export function loadReviewPrefs(deckId: string): ReviewPrefs | null {
  const raw = localStorage.getItem(REVIEW_PREFS_KEY);
  if (!raw) return null;
  try {
    const prefs: Record<string, ReviewPrefs> = JSON.parse(raw);
    return prefs[deckId] ?? null;
  } catch {
    return null;
  }
}

export function saveReviewPrefs(deckId: string, prefs: ReviewPrefs): void {
  let all: Record<string, ReviewPrefs> = {};
  const raw = localStorage.getItem(REVIEW_PREFS_KEY);
  if (raw) {
    try {
      all = JSON.parse(raw);
    } catch {
      // ignore corrupt data
    }
  }
  all[deckId] = prefs;
  localStorage.setItem(REVIEW_PREFS_KEY, JSON.stringify(all));
}

// ─── Backup / Restore ───────────────────────────────────────

export interface AppState {
  version: 1;
  exportedAt: string;
  decks: Deck[];
  reviewPrefs: Record<string, ReviewPrefs>;
}

export function exportAppState(): string {
  const decks = loadDecks();
  let reviewPrefs: Record<string, ReviewPrefs> = {};
  const raw = localStorage.getItem(REVIEW_PREFS_KEY);
  if (raw) {
    try {
      reviewPrefs = JSON.parse(raw);
    } catch {
      // ignore corrupt data
    }
  }
  const state: AppState = {
    version: 1,
    exportedAt: new Date().toISOString(),
    decks,
    reviewPrefs,
  };
  return JSON.stringify(state, null, 2);
}

export function importAppState(json: string): { success: boolean; error?: string; deckCount?: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { success: false, error: 'Invalid JSON file.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { success: false, error: 'Invalid backup format.' };
  }

  const data = parsed as Record<string, unknown>;

  if (data.version !== 1) {
    return { success: false, error: 'Unsupported backup version.' };
  }

  if (!Array.isArray(data.decks)) {
    return { success: false, error: 'Backup file is missing deck data.' };
  }

  // Validate deck structure
  for (const deck of data.decks) {
    if (typeof deck !== 'object' || deck === null) {
      return { success: false, error: 'Invalid deck entry in backup.' };
    }
    const d = deck as Record<string, unknown>;
    if (typeof d.id !== 'string' || typeof d.name !== 'string' || !Array.isArray(d.cards)) {
      return { success: false, error: 'Invalid deck structure in backup.' };
    }
  }

  // Restore decks
  const decks = data.decks as Deck[];
  for (const deck of decks) {
    for (const card of deck.cards) {
      const due = new Date(card.fsrs.due);
      card.fsrs.due = isNaN(due.getTime()) ? new Date() : due;
      if (card.fsrs.last_review) {
        const lr = new Date(card.fsrs.last_review);
        card.fsrs.last_review = isNaN(lr.getTime()) ? undefined : lr;
      }
    }
  }
  saveDecks(decks);

  // Restore review prefs
  if (data.reviewPrefs && typeof data.reviewPrefs === 'object' && !Array.isArray(data.reviewPrefs)) {
    localStorage.setItem(REVIEW_PREFS_KEY, JSON.stringify(data.reviewPrefs));
  }

  return { success: true, deckCount: decks.length };
}
