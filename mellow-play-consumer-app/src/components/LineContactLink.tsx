import React from 'react';

/**
 * "@mellowplay", as something you can actually tap.
 *
 * The handle was written as plain text in half a dozen places — the booking
 * detail, the OTP screens, registration — every one of them telling a customer
 * to go and find the account themselves. The URL lives here alone so those
 * mentions become one tap, and so it is one edit if the account ever moves.
 *
 * The URL is never shown. `lin.ee/vC0dDzn` says nothing to a reader, while
 * "@mellowplay" is the thing they would search for anyway.
 */
export const LINE_OA_HANDLE = '@mellowplay';
export const LINE_OA_URL = 'https://lin.ee/vC0dDzn';

const LineContactLink: React.FC<{ className?: string; label?: string }> = ({ className, label }) => (
  <a
    href={LINE_OA_URL}
    target="_blank"
    rel="noopener noreferrer"
    // stopPropagation because these sit inside cards and modals that have their
    // own click handlers — tapping the handle must open LINE, not the card.
    onClick={e => e.stopPropagation()}
    className={className ?? 'font-black text-mellow-purple underline underline-offset-2 active:opacity-70'}
  >
    {label ?? LINE_OA_HANDLE}
  </a>
);

export default LineContactLink;
