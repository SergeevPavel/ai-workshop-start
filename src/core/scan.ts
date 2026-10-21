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

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths);
  // The files are read at the same time: on GitHub, each one is a request.
  const contents = await Promise.all(files.map((file) => source.read(file.path)));
  const warnings = [...source.warnings];
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
      id: `${source.repository.id}:${file.path}`,
      repository: source.repository.id,
      path: file.path,
      name: parsed.name ?? file.name,
      description: parsed.description,
      commit: source.repository.commit,
      copies: [],
    });
  });
  return { repository: source.repository, skills: sortSkills([...skills.values()]), warnings };
}
