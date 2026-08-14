/**
 * Whether a stored description is plain text rather than CRM rich text.
 *
 * Descriptions come from two eras: typed into a plain textarea before the rich
 * editor existed (line breaks are real newline characters) and typed into the
 * TipTap editor since (line breaks are <p> and <br> tags). Both are rendered
 * through the same block.
 *
 * The distinction matters because `whitespace-pre-wrap` is what keeps the old
 * ones readable and what BREAKS the new ones: the newlines between `</p>` and
 * `<p>` in serialised HTML are insignificant markup, and preserving them adds a
 * blank line the author never typed. So it is applied only to the old ones.
 */
export const isPlainText = (value?: string | null): boolean =>
  !!value && !/<[a-z][\s\S]*>/i.test(value);
