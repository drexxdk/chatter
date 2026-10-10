// Messages by the same person with nothing in between (no message of somebody else, nothing that happened) are shown
// as one group. `authorOf` says who a message is by; an item with no author (an event, a placeholder) is on its own.
export function runs<T>(
  items: T[],
  authorOf: (item: T) => string | undefined,
): T[][] {
  const result: T[][] = [];
  let lastAuthor: string | undefined;

  for (const item of items) {
    const author = authorOf(item);
    const previous = result.at(-1);

    if (author !== undefined && author === lastAuthor && previous) {
      previous.push(item);
    } else {
      result.push([item]);
    }

    lastAuthor = author;
  }

  return result;
}
