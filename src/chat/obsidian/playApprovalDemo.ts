import type { AgentEvent, AgentSession, ToolApprovalRequest } from '@/agents/types';
import type { DemoChat } from '@/chat/obsidian/playHighlightDemo';

const REQUESTS: readonly ToolApprovalRequest[] = [
  {
    description: 'this command',
    decisionReason: 'Allow curl to access Google outside the sandbox to test network connectivity?',
    input: { item: { kind: 'command', command: 'curl --max-time 20 -I https://www.google.com', cwd: '/example/vault' } },
    fields: [{ kind: 'command', value: 'curl --max-time 20 -I https://www.google.com' }, { kind: 'cwd', value: '/example/vault' }],
    changes: [],
  },
  {
    description: 'these file changes',
    decisionReason: 'Clarify quicksort\'s complexity.',
    input: { item: { type: 'fileChange', changes: [{
      path: 'Notes/Sorting algorithms.md', kind: { type: 'update' },
      diff: '@@ -1 +1 @@\n-Quicksort always runs in O(n log n) time and uses extra space for each partition.\n+Quicksort averages O(n log n) time, can take O(n²), and partitions in place.\n',
    }] } },
    fields: [],
    changes: [{
      path: 'Notes/Sorting algorithms.md', kind: 'update',
      blocks: [{
        label: 'Line 1',
        before: 'Quicksort always runs in O(n log n) time and uses extra space for each partition.\n',
        after: 'Quicksort averages O(n log n) time, can take O(n²), and partitions in place.\n',
      }],
    }],
  },
  {
    description: 'this additional access',
    decisionReason: 'Allow network access for the rest of this turn to look up a reference.',
    input: { permissions: { network: { enabled: true } } },
    fields: [{ kind: 'permissions', value: JSON.stringify({ network: { enabled: true } }, null, 2) }],
    changes: [],
  },
];

/** Exercises the real approval flow with scripted requests; answers never execute the sample actions. */
export async function playApprovalDemo(openChat: () => Promise<DemoChat | null>): Promise<void> {
  const chat = await openChat();
  if (!chat) return;
  const session: AgentSession = {
    id: 'approval-demo',
    async *send(_text, signal = new AbortController().signal): AsyncGenerator<AgentEvent> {
      yield { type: 'text', delta: 'This is an approval demo. Sample actions do not run commands or change files. Choose Deny or Allow once on each card, or press Stop to end the demo.\n\n' };
      for (const [index, request] of REQUESTS.entries()) {
        if (signal.aborted) break;
        yield { type: 'text', delta: `Sample ${index + 1} of ${REQUESTS.length}: ${request.description}.\n\n` };
        if (signal.aborted) break;
        let answer!: (approved: boolean) => void;
        const decision = new Promise<boolean>((resolve) => { answer = resolve; });
        const cancel = (): void => answer(false);
        signal.addEventListener('abort', cancel, { once: true });
        try {
          yield { type: 'approval', request, signal, answer };
          const approved = await decision;
          if (signal.aborted) break;
          yield { type: 'text', delta: `${approved ? 'Allowed once' : 'Denied'} (demo only).\n\n` };
        } finally {
          signal.removeEventListener('abort', cancel);
        }
      }
      if (!signal.aborted) yield { type: 'text', delta: 'Demo complete. Run Play approval demo again to try another choice or theme.' };
      yield { type: 'done', status: signal.aborted ? 'interrupted' : 'completed' };
    },
    skills: async () => [],
    setModel: async () => undefined,
    close: async () => undefined,
  };
  await chat.playTurn('Preview approval prompts.', session, '');
}
