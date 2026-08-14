/**
 * Put the reader back at the top of the page.
 *
 * Which element actually scrolls depends on the breakpoint: AppShell's content
 * frame scrolls internally from md: up (md:overflow-y-auto) while below that
 * the window scrolls. Resetting only one of them works on half the devices, so
 * this resets the window and walks up from `from` clearing every scrolled
 * ancestor it finds.
 *
 * Called when a step of the booking wizard changes and when a news article is
 * replaced by another — both cases where the content under the reader is
 * swapped wholesale and the old scroll position means nothing.
 */
export const scrollToTop = (from?: HTMLElement | null): void => {
  window.scrollTo({ top: 0, behavior: 'auto' });
  let node: HTMLElement | null = from?.parentElement ?? null;
  while (node) {
    if (node.scrollTop > 0) node.scrollTop = 0;
    node = node.parentElement;
  }
};
