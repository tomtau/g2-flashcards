import type { Card as FSRSCard } from 'ts-fsrs';

export interface FlashCard {
  id: string;
  front: string;
  back: string;
  fsrs: FSRSCard;
}

export interface Deck {
  id: string;
  name: string;
  cards: FlashCard[];
  createdAt: string;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
