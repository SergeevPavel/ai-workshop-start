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

/** By name, then by path: the same order everywhere, whatever the locale. */
export function sortSkills(skills: Skill[]): Skill[] {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...skills].sort((a, b) => compare(a.name, b.name) || compare(a.path, b.path));
}

/**
 * Fuzzy text matching: the query's characters appear in order in the skill's name or description,
 * ignoring case and spaces. An empty query matches every skill.
 */
export function matchesSkill(skill: Skill, query: string): boolean {
  const needle = query.replace(/\s+/g, '').toLowerCase();
  const inOrder = (text: string) => {
    let from = 0;
    for (const char of needle) {
      from = text.indexOf(char, from);
      if (from < 0) return false;
      from += char.length;
    }
    return true;
  };
  return inOrder(skill.name.toLowerCase()) || inOrder(skill.description.toLowerCase());
}

/** The description's first sentence, on one line: what the lists show. */
export function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
