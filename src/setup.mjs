// `bioshot setup <agent>`: put the playbook where a coding agent will find it. bioshot has no MCP
// server; an agent runs the command line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'skills', 'bioshot', 'SKILL.md');
export const TARGETS = ['claude', 'cursor', 'codex', 'gemini', 'vscode', 'windsurf', 'cline'];

// The playbook as plain text: the skill without its frontmatter.
export const guide = () => fs.readFileSync(SKILL, 'utf8').replace(/^---\n[\s\S]*?\n---\n+/, '');

// how an agent should call bioshot from the project
export function cliCommand() {
  return ROOT.split(path.sep).includes('node_modules') ? 'npx bioshot' : `node ${/\s/.test(ROOT) ? `"${path.join(ROOT, 'bin', 'bioshot.mjs')}"` : path.join(ROOT, 'bin', 'bioshot.mjs')}`;
}
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file; };
const pointer = () => ['## Films about biology and lab products (bioshot)', '',
  'When asked for a film about biology, a lab method, an assay or a lab product, read `.agents/skills/bioshot/SKILL.md`',
  `first and follow it. Run the command line: \`${cliCommand()} <command>\` (\`${cliCommand()} guide\` prints the playbook).`,
  'bioshot supplies the pictures; storyshot makes the film, so its skill applies too.'].join('\n');
// add (or refresh) our section in a shared instructions file, leaving the rest of the file alone
function upsertBlock(file, body) {
  const block = `<!-- bioshot:start -->\n${body}\n<!-- bioshot:end -->`;
  const re = /<!-- bioshot:start -->[\s\S]*?<!-- bioshot:end -->/;
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  return write(file, re.test(cur) ? cur.replace(re, block) : `${cur}${cur && !cur.endsWith('\n') ? '\n\n' : cur ? '\n' : ''}${block}\n`);
}
function ignoreWork(dir) {
  const gi = path.join(dir, '.gitignore');
  const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (/^\.bioshot\/?$/m.test(cur)) return null;
  fs.writeFileSync(gi, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}# bioshot working state (sync records, review pages)\n.bioshot/\n`);
  return gi;
}

export function setup(target, dir = process.cwd()) {
  const skill = fs.readFileSync(SKILL, 'utf8');
  const shared = () => write(path.join(dir, '.agents', 'skills', 'bioshot', 'SKILL.md'), skill);
  const written = [];
  if (target === 'claude') written.push(write(path.join(dir, '.claude', 'skills', 'bioshot', 'SKILL.md'), skill));
  else if (target === 'cursor') written.push(write(path.join(dir, '.cursor', 'skills', 'bioshot', 'SKILL.md'), skill));
  else if (target === 'codex') written.push(shared(), upsertBlock(path.join(dir, 'AGENTS.md'), pointer()));
  else if (target === 'gemini') written.push(shared(), upsertBlock(path.join(dir, 'GEMINI.md'), pointer()));
  else if (target === 'vscode') written.push(shared(), upsertBlock(path.join(dir, '.github', 'copilot-instructions.md'), pointer()));
  else if (target === 'windsurf') written.push(shared(), write(path.join(dir, '.windsurf', 'rules', 'bioshot.md'), `---\ntrigger: model_decision\ndescription: Making a film about biology, a lab method, an assay or a lab product with bioshot\n---\n\n${pointer()}\n`));
  else if (target === 'cline') written.push(shared(), write(path.join(dir, '.clinerules', 'bioshot.md'), `${pointer()}\n`));
  else throw new Error(`usage: bioshot setup ${TARGETS.join(' | ')}`);
  const gi = ignoreWork(dir);
  if (gi) written.push(`${gi} (added .bioshot/)`);
  return written;
}
