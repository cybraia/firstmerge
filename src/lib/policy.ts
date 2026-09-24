const AI_TERMS = /\bAI\b|\b(LLMs?|Copilot|ChatGPT|Claude|generative|large language model)\b/;
// A line must also read like a rule for contributors...
const POLICY_TERMS = /contribut|pull request|\bPRs?\b|submit|disclos|polic|allow|prohibit|\bban|reject|accept|not permitted/i;
// ...and not like an instruction file addressed to a coding agent.
const AGENT_INSTRUCTIONS = /guidance to|instructions? for|for AI (coding )?(agents?|assistants?)|when working with code/i;

const clean = (line: string) => line.replace(/[#>*_`]/g, "").trim();

/**
 * Returns the first passage of a CONTRIBUTING file that reads like a rule about AI-assisted
 * contributions. Only pass CONTRIBUTING files: AGENTS.md and CLAUDE.md are written for agents,
 * not for people opening PRs.
 *
 * A bare heading ("## AI-assisted contributions") says nothing, so the line under it is appended.
 */
export function findAiPolicy(texts: (string | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    const at = lines.findIndex(
      (l) => AI_TERMS.test(l) && POLICY_TERMS.test(l) && !AGENT_INSTRUCTIONS.test(l) && l.trim().length > 15,
    );
    if (at === -1) continue;
    let snippet = clean(lines[at]);
    if (/^\s*#/.test(lines[at])) {
      const next = lines.slice(at + 1).find((l) => l.trim() && !/^\s*#/.test(l));
      if (next) snippet = `${snippet}: ${clean(next)}`;
    }
    return snippet.slice(0, 240);
  }
  return null;
}
