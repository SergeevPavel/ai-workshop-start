// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { count, firstSentence, skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, scanOrganization, type OrganizationSource, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan: a repository, or an organization. */
  open(input: string): Promise<Source | OrganizationSource>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository, or an organization, and print it
  help                            show this help`;

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

/** A repository as `printRepository`; an organization: its heading, then each repository after a blank line. */
async function scanCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | directory>');
  const source = await context.open(args[0]);
  let warnings: string[];
  if ('organization' in source) {
    const result = await scanOrganization(source);
    const skills = result.repositories.reduce((sum, { skills }) => sum + skills.length, 0);
    context.print(`${result.organization} · ${count(skills, 'skill')} in ${count(result.repositories.length, 'repository', 'repositories')}`);
    for (const { repository, skills } of result.repositories) {
      context.print('');
      printRepository(repository, skills, context);
    }
    warnings = result.warnings;
  } else {
    const result = await scan(source);
    printRepository(result.repository, result.skills, context);
    warnings = result.warnings;
  }
  for (const warning of warnings) context.error(`warning: ${warning}`);
}

/** `<owner>/<repo> · N skills`, then each skill's name, first sentence and link. */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  print(`${repository.id} · ${count(skills.length, 'skill')}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
  }
}
