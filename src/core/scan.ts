import { findSkills } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

/** An organization to scan: every repository that could be opened. */
export type OrganizationSource = {
  /** The owner's login, for example `JetBrains`. */
  organization: string;
  /** `https://github.com/<owner>`. */
  url: string;
  repositories: Source[];
  /** The repositories that could not be opened, `owner/repo: …; skipped`. */
  warnings: string[];
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** The repositories with skills, sorted by id; the warnings are prefixed with `owner/repo: `. */
export type OrganizationScanResult = {
  organization: string;
  repositories: { repository: Repository; skills: Skill[] }[];
  warnings: string[];
};

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const { skills, warnings } = await readSkills(source);
  return { repository: source.repository, skills: sortSkills([...skills.values()]), warnings };
}

/**
 * Every repository as `scan` does. Identical content in several repositories stays in each
 * repository's list: the others are its copies, named by their id, `owner/repo:path`.
 */
export async function scanOrganization(source: OrganizationSource): Promise<OrganizationScanResult> {
  const read = await Promise.all(source.repositories.map(readSkills));
  const byContent = new Map<string, Skill[]>();
  for (const { skills } of read) {
    for (const [text, skill] of skills) byContent.set(text, [...(byContent.get(text) ?? []), skill]);
  }
  for (const same of byContent.values()) {
    for (const skill of same) skill.copies.push(...same.filter((other) => other !== skill).map((other) => other.id));
  }
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const scanned = read.filter(({ skills }) => skills.size > 0).sort((a, b) => compare(a.repository.id, b.repository.id));
  return {
    organization: source.organization,
    repositories: scanned.map(({ repository, skills }) => ({ repository, skills: sortSkills([...skills.values()]) })),
    warnings: [...read.flatMap(({ repository, warnings }) => warnings.map((warning) => `${repository.id}: ${warning}`)), ...source.warnings],
  };
}

/** The repository's skills by their SKILL.md content, and the warnings. */
async function readSkills({ repository, paths, warnings: listed, read }: Source) {
  const files = findSkills(paths, repository.name);
  // The files are read at the same time: on GitHub, each one is a request.
  const contents = await Promise.all(files.map((file) => read(file.path)));
  const warnings = [...listed];
  // Identical content is one skill: the first path, by path order, keeps it; the others are copies.
  const skills = new Map<string, Skill>();
  files.forEach((file, index) => {
    const bytes = contents[index];
    if (!bytes) {
      warnings.push(`${file.path}: listed, but not found at the scanned commit; skipped`);
      return;
    }
    const text = new TextDecoder().decode(bytes);
    const original = skills.get(text);
    if (original) {
      original.copies.push(file.path);
      return;
    }
    const parsed = parseSkill(text);
    if (parsed.warning) warnings.push(`${file.path}: ${parsed.warning}`);
    skills.set(text, {
      id: `${repository.id}:${file.path}`,
      repository: repository.id,
      path: file.path,
      name: parsed.name ?? file.name,
      description: parsed.description,
      commit: repository.commit,
      copies: [],
    });
  });
  return { repository, skills, warnings };
}
