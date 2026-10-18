/**
 * P33: a published game never contains a secret. These patterns find key-shaped strings (API keys and tokens of
 * the services a game or the editor might touch) so tests, exports and Share can refuse them.
 */
export const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{16,}/g },
  { name: 'OpenAI API key', re: /sk-(?:proj-)?[A-Za-z0-9]{20,}/g },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Slack token', re: /xox[abpr]-[A-Za-z0-9-]{10,}/g },
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

export type SecretHit = { name: string; where: string; sample: string };

/** key-shaped strings in a text (the sample is masked: never repeat a secret in a message or a log) */
export function findSecrets(text: string, where = ''): SecretHit[] {
  const out: SecretHit[] = [];
  for (const p of SECRET_PATTERNS)
    for (const m of text.matchAll(p.re)) out.push({ name: p.name, where, sample: `${m[0].slice(0, 6)}…` });
  return out;
}

/** key-shaped strings anywhere in a set of files (path → content) */
export function scanFiles(files: Iterable<[string, unknown]>): SecretHit[] {
  const out: SecretHit[] = [];
  for (const [path, v] of files) out.push(...findSecrets(typeof v === 'string' ? v : JSON.stringify(v), path));
  return out;
}
