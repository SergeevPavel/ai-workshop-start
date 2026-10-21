// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { byWords, type Clusterer } from './core/cluster.ts';
import { AtlasError } from './core/errors.ts';
import { count, firstSentence, skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Groups similar skills for `--cluster`; the core's word heuristic by default. */
  cluster?: Clusterer;
};

const usage = `Usage: skill-atlas <command>

  scan [--cluster] <GitHub URL | directory>   find every SKILL.md in a repository and print it; --cluster groups similar skills
  help                                        show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

/** `<owner>/<repo> · N skills`, then the skills: in clusters with `--cluster`, each after a blank line. */
async function scanCommand(args: string[], context: Context) {
  const inputs = args.filter((arg) => arg !== '--cluster');
  if (inputs.length !== 1) throw new AtlasError('Usage: skill-atlas scan [--cluster] <GitHub URL | directory>');
  const result = await scan(await context.open(inputs[0]));
  context.print(`${result.repository.id} · ${count(result.skills.length, 'skill')}`);
  if (!args.includes('--cluster')) printSkills(result.repository, result.skills, context);
  else {
    const { clusters, alone } = await (context.cluster ?? byWords)(result.skills);
    for (const { name, skills } of alone.length > 0 ? [...clusters, { name: 'on their own', skills: alone }] : clusters) {
      context.print('');
      context.print(`${name} · ${count(skills.length, 'skill')}`);
      printSkills(result.repository, skills, context);
    }
  }
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

/** Each skill's name, first sentence and link, then its copies. */
function printSkills(repository: Repository, skills: Skill[], { print }: Context) {
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
  }
}
