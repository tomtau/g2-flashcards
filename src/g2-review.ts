import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  OsEventTypeList,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import type { FlashCard } from './models';
import { reviewCard, Rating, type Grade } from './scheduler';

export type ReviewCompleteCallback = (updatedCards: FlashCard[]) => void;

const RATING_LABELS = ['Again', 'Hard', 'Good', 'Easy'];
const RATING_VALUES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}

function buildTextPage(content: string): RebuildPageContainer {
  return new RebuildPageContainer({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 4,
        containerID: 1,
        containerName: 'main',
        content: truncate(content, 950),
        isEventCapture: 1,
      }),
    ],
  });
}

function buildRatingPage(backContent: string): RebuildPageContainer {
  return new RebuildPageContainer({
    containerTotalNum: 2,
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 108,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 4,
        containerID: 1,
        containerName: 'answer',
        content: truncate(backContent, 400),
        isEventCapture: 0,
      }),
    ],
    listObject: [
      new ListContainerProperty({
        xPosition: 0,
        yPosition: 108,
        width: 576,
        height: 180,
        borderWidth: 1,
        borderColor: 13,
        borderRdaius: 4,
        paddingLength: 0,
        containerID: 2,
        containerName: 'rating',
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: 4,
          itemWidth: 0,
          isItemSelectBorderEn: 1,
          itemName: RATING_LABELS,
        }),
      }),
    ],
  });
}

function buildDonePage(total: number): RebuildPageContainer {
  return buildTextPage(`Review complete!\n\n${total} card(s) reviewed.\n\nClick to exit.`);
}

export async function startG2Review(
  cards: FlashCard[],
  onComplete: ReviewCompleteCallback,
): Promise<void> {
  if (cards.length === 0) return;

  const bridge: EvenAppBridge = await waitForEvenAppBridge();
  const updatedCards: FlashCard[] = [];
  let cardIndex = 0;
  let showingFront = true;
  let processing = false;

  const showFront = async () => {
    const card = cards[cardIndex];
    const header = `[${cardIndex + 1}/${cards.length}]\n\n`;
    await bridge.rebuildPageContainer(buildTextPage(header + card.front));
    showingFront = true;
  };

  const showBack = async () => {
    const card = cards[cardIndex];
    await bridge.rebuildPageContainer(buildRatingPage(card.back));
    showingFront = false;
  };

  const handleRating = async (grade: Grade) => {
    const updated = reviewCard(cards[cardIndex], grade);
    updatedCards.push(updated);
    cardIndex++;
    if (cardIndex < cards.length) {
      await showFront();
    } else {
      await bridge.rebuildPageContainer(buildDonePage(updatedCards.length));
    }
  };

  const startPage = new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 4,
        containerID: 1,
        containerName: 'main',
        content: `[1/${cards.length}]\n\n${truncate(cards[0].front, 900)}`,
        isEventCapture: 1,
      }),
    ],
  });

  await bridge.createStartUpPageContainer(startPage);
  showingFront = true;

  const unsubscribe = bridge.onEvenHubEvent(async (event: EvenHubEvent) => {
    if (processing) return;

    const isClick = (et: number | undefined) =>
      et === OsEventTypeList.CLICK_EVENT || et === undefined;

    if (cardIndex >= cards.length) {
      const textClick = event.textEvent && isClick(event.textEvent.eventType);
      const sysClick = event.sysEvent && isClick(event.sysEvent.eventType);
      if (textClick || sysClick) {
        processing = true;
        unsubscribe();
        await bridge.shutDownPageContainer(0);
        onComplete(updatedCards);
      }
      return;
    }

    if (showingFront) {
      const textClick = event.textEvent && isClick(event.textEvent.eventType);
      const sysClick = event.sysEvent && isClick(event.sysEvent.eventType);
      if (textClick || sysClick) {
        processing = true;
        try {
          await showBack();
        } finally {
          processing = false;
        }
      }
    } else {
      if (event.listEvent && isClick(event.listEvent.eventType)) {
        processing = true;
        try {
          const idx = event.listEvent.currentSelectItemIndex ?? 0;
          if (idx >= 0 && idx < RATING_VALUES.length) {
            await handleRating(RATING_VALUES[idx]);
          }
        } finally {
          processing = false;
        }
      }
    }
  });
}
