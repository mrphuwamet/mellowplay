// {{key}} substitution — unknown keys are left as-is rather than blanked
// out, so a typo'd placeholder is obvious in the sent message instead of
// silently disappearing.
export function renderSmsTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value != null ? value : match;
  });
}
