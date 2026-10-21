/** A scanned repository. The hierarchy is organization → repository → skill. */
export type Repository = {
  /** `owner/name`, for example `JetBrains/kotlin`; a local directory's name. */
  id: string;
  organization: string;
  name: string;
  /** `https://github.com/<owner>/<repo>`, or a local directory's file:// URL. */
  url: string;
  /** The scanned commit; empty for a local directory. */
  commit: string;
};

/** One skill. Its link is derived, by `skillLink`. */
export type Skill = {
  /** `repo:path`, for example `JetBrains/kotlin:.claude/skills/x/SKILL.md`. */
  id: string;
  repository: string;
  path: string;
  name: string;
  description: string;
  /** The scanned commit, the one the link pins; empty for a local directory. */
  commit: string;
  /** Other paths with identical SKILL.md content. */
  copies: string[];
};

/**
 * The SKILL.md file, from where its repository is: on GitHub at the scanned commit,
 * `https://github.com/<owner>/<repo>/blob/<commit>/<path>`; in a local directory, the file itself.
 */
export function skillLink(repository: Repository, skill: Skill): string {
  const path = skill.path.split('/').map(encodeURIComponent).join('/');
  return skill.commit ? `${repository.url}/blob/${skill.commit}/${path}` : `${repository.url}/${path}`;
}

/** By code point: the same order everywhere, whatever the locale. */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** By name, then by path. */
export function sortSkills(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => compare(a.name, b.name) || compare(a.path, b.path));
}

/** `1 skill`, `2 skills`: a count with its noun. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The description's first sentence, on one line: what the lists show. */
export function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
