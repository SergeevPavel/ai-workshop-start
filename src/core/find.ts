/** A SKILL.md found in a repository, and the name its directory gives it. */
export type SkillFile = { path: string; name: string };

/** Where agents keep a repository's own skills. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', '.agent/skills'];

/**
 * Every file named exactly SKILL.md in a directory under a skill root, at any depth,
 * sorted by path, named after its directory.
 */
export function findSkills(paths: string[]): SkillFile[] {
  const roots = SKILL_ROOTS.map((root) => root.replaceAll('.', '\\.')).join('|');
  const skill = new RegExp(`(^|/)(${roots})/.+/SKILL\\.md$`);
  return paths
    .filter((path) => skill.test(path))
    .sort()
    .map((path) => ({ path, name: path.split('/').at(-2)! }));
}
