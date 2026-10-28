import type { AgentTool } from '@/agents/types';
import { library } from '@/renderer/openui/library';
import { describeEntry, PACK_LIST, PACK_NAMES, PACKS, type PackName } from '@/renderer/openui/packs';

const isPack = (name: string): name is PackName => (PACK_NAMES as readonly string[]).includes(name);

function describePack(name: PackName): string {
  const spec = library.toSpec();
  const pack = PACKS[name];
  return [
    `The ${name} pack: ${pack.summary}.`,
    'Components:',
    ...pack.components.map((component) => describeEntry(spec.components[component]!)),
    ...(pack.functions.length ? ['Functions, written @Name(args) inside a value:', ...pack.functions.map((fn) => describeEntry(spec.functions![fn]!))] : []),
    ...('example' in pack ? [`Pass arguments in signature order${'argumentNote' in pack ? `: ${pack.argumentNote}` : ''}. A working figure, to copy the form of and not its topic:`, pack.example] : []),
  ].join('\n');
}

export const loadPackTool: AgentTool = {
  name: 'load_pack',
  description: `Get the syntax of a pack of visual components before writing them in an openui-lang fence. Packs: ${PACK_LIST}.`,
  argument: { name: 'name', values: PACK_NAMES },
  run: (name) => (isPack(name) ? describePack(name) : `No pack named ${name}. Packs: ${PACK_NAMES.join(', ')}.`),
  title: (name) => `Loaded the ${name} visuals`,
};
