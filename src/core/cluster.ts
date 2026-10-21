// Similar skills, grouped: spec/analysis.md § Clusters. Which skills are similar is pluggable, a
// Clusterer; byWords, the default, is a heuristic on the words of the name and description.
import { compare, sortSkills, type Skill } from './model.ts';

/** Skills sharing a word, named after it; at least two. */
export type Cluster = { name: string; skills: Skill[] };

/** The clusters, by size then name, and the skills `alone`, in no cluster, by name. */
export type Clustering = { clusters: Cluster[]; alone: Skill[] };

/**
 * Decides which skills are similar. A model MAY be asked, so the answer MAY be a promise. Cluster
 * names MUST be unique and MUST NOT be `on their own`: the page tells the cards' clusters by name.
 */
export type Clusterer = (skills: Skill[]) => Clustering | Promise<Clustering>;

/** Words that say nothing about what a skill is for; `use` and `skill` open most descriptions. */
const STOP_WORDS = new Set(
  `and the but not for from with without into onto over under out off about are was were been being does did done
   have has had having its this that these those they them their there here then than when whenever where which who
   whom what how why all any each every some more most other such only also too very just can could should would
   will shall may might must you your our one way ways use used uses using skill skills before after during while via
   per etc`.split(/\s+/),
);

/**
 * The word without its plural or verb ending, so `commits`, `committing` and `commit` are one word.
 * At least three letters stay; `es` goes after `x`, `z`, `ch`, `sh` or `ss`, else `s`; a doubled
 * consonant before `ing` or `ed` folds, except `l`, `s` and `z`; `ies` is `y`.
 */
function stem(word: string): string {
  const rules: [RegExp, string][] = [
    [/^(.{3,})ies$/, '$1y'], // repositories → repository
    [/^(.+ss)(?:es)?$/, '$1'], // classes, class → class
    [/^(.{2,}(?:[xz]|[cs]h))es$/, '$1'], // patches, boxes → patch, box; releases → release, by the last rule
    [/^(.{2,}?)([^aeioulsz])\2(?:ing|ed)$/, '$1$2'], // committing, tagged → commit, tag; spelling → spell
    [/^(.{3,})(?:ing|ed|s)$/, '$1'], // testing, tested, tests → test
  ];
  for (const [pattern, replacement] of rules) if (pattern.test(word)) return word.replace(pattern, replacement);
  return word;
}

/** Whether `a` is the shorter form, or the first alphabetically of two as short. */
const shorter = (a: string, b: string) => a.length < b.length || (a.length === b.length && a < b);

/** Each telling word of the name and description, by stem, with its shortest form. */
function words(skill: Skill): Map<string, string> {
  const forms = new Map<string, string>();
  for (const word of `${skill.name} ${skill.description}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    const known = forms.get(stem(word));
    if (!known || shorter(word, known)) forms.set(stem(word), word);
  }
  return forms;
}

/**
 * Again and again, the word most of the skills left share, at least two, makes a cluster, named
 * after its shortest form; ties go to the first word alphabetically.
 */
export const byWords: Clusterer = (skills) => {
  const sorted = sortSkills(skills);
  const forms = sorted.map(words);
  const left = new Set(sorted.keys());
  const clusters: Cluster[] = [];
  for (;;) {
    const shared = new Map<string, { members: number[]; name: string }>();
    for (const index of left) {
      for (const [word, form] of forms[index]) {
        const entry = shared.get(word) ?? { members: [], name: form };
        entry.members.push(index);
        if (shorter(form, entry.name)) entry.name = form;
        shared.set(word, entry);
      }
    }
    const [best] = [...shared]
      .filter(([, { members }]) => members.length > 1)
      .sort(([a, x], [b, y]) => y.members.length - x.members.length || compare(a, b));
    if (!best) break;
    const [, { members, name }] = best;
    clusters.push({ name, skills: members.map((index) => sorted[index]) });
    for (const index of members) left.delete(index);
  }
  clusters.sort((a, b) => b.skills.length - a.skills.length || compare(a.name, b.name));
  return { clusters, alone: [...left].map((index) => sorted[index]) };
};
