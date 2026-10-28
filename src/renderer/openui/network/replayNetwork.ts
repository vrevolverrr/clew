import { atStep, boolean, id, list, operation, record, requireThat, step, steps, tag, targets, text, type TagValue } from '../steps/validation';

interface NetworkNode {
  readonly id: string;
  readonly label: string;
  readonly hidden: boolean;
  readonly tag: TagValue;
}
interface NetworkEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly directed: boolean;
  readonly tag: TagValue;
}
interface NetworkSnapshot {
  readonly caption: string;
  readonly nodes: readonly NetworkNode[];
  readonly edges: readonly NetworkEdge[];
}
export interface NetworkReplay {
  readonly snapshots: readonly NetworkSnapshot[];
}

export function replayNetwork(props: Record<string, unknown>): NetworkReplay {
  const nodes = list(props.nodes, 128).map(value => {
    const n = record(value);
    const key = id(n.id);
    return { id: key, label: n.label === undefined ? key : text(n.label), hidden: boolean(n.hidden), tag: 'plain' as const };
  });
  const edges = list(props.edges, 512).map(value => {
    const e = record(value);
    return { id: id(e.id), from: id(e.from), to: id(e.to), label: e.label === undefined ? '' : text(e.label), directed: boolean(e.directed), tag: 'plain' as const };
  });
  const nodeState = new Map<string, NetworkNode>(nodes.map(n => [n.id, n]));
  const edgeState = new Map<string, NetworkEdge>(edges.map(e => [e.id, e]));
  requireThat(new Set([...nodes, ...edges].map(v => v.id)).size === nodes.length + edges.length, 'duplicate graph ID');
  requireThat(edges.every(e => nodeState.has(e.from) && nodeState.has(e.to)), 'unknown edge endpoint');
  let count = 0;
  const snapshots = steps(props.steps).map((value, index) => atStep(index, () => {
    const { caption, changes } = step(value);
    for (const change of list(changes, 4096)) {
      requireThat(++count <= 4096, 'operations exceed 4096');
      const { typeName: kind, props: p } = operation(change, ['Tag', 'Label', 'Show', 'Hide']);
      const keys = kind === 'Label' ? [id(p.target)] : targets(kind === 'Tag' ? p.targets : p.ids);
      // Validate arguments even for an empty target list.
      const patch = kind === 'Label' ? { label: text(p.text) } : kind === 'Tag' ? { tag: tag(p.tag) } : {};
      for (const key of keys) {
        const node = nodeState.get(key);
        const edge = edgeState.get(key);
        requireThat(node || edge, `unknown target ${key}`);
        if (kind === 'Show' || kind === 'Hide') {
          requireThat(node, `visibility requires a node: ${key}`);
          nodeState.set(key, { ...node, hidden: kind === 'Hide' });
        } else if (node) nodeState.set(key, { ...node, ...patch });
        else edgeState.set(key, { ...edge!, ...patch });
      }
    }
    return Object.freeze({ caption,
      nodes: Object.freeze([...nodeState.values()].map(n => Object.freeze(n))),
      edges: Object.freeze([...edgeState.values()].map(e => Object.freeze(e))),
    });
  }));
  return Object.freeze({ snapshots: Object.freeze(snapshots) });
}
