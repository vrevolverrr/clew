import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { strictComponent } from '../OpenUIRenderer';
import { svg } from '@/renderer/figure/dom';
import { position, status } from '@/renderer/figure/geometry';
import { Step } from '../steps/operations';
import { stepFigure, type FigureDrawing } from '../steps/StepFigure';
import { layoutNetwork, type NetworkInput } from '@/renderer/figure/network/layoutNetwork';
import { replayNetwork, type NetworkReplay } from './replayNetwork';

let markerId = 0;

const NETWORK_DOCUMENT = "Network(nodes, edges, steps) shows a fixed graph with its own Back, Next, scrubber and Play. Do not add a Player or step variable. Nodes are {id, label?, hidden?}; edges are {id, from, to, label?, directed?}. IDs match [A-Za-z_][A-Za-z0-9_]*, are case-sensitive, and are unique across nodes and edges. Labels are plain text; unlabeled nodes display their ID and unlabeled edges display no text. directed defaults to false. Every endpoint names a declared node.\n\nEdges have explicit IDs. Use those IDs in operations, never endpoint shorthand such as \"A-B\". Opposite edges, parallel edges and self-loops are allowed and independently addressable. Write tree edges from parent to child in intended sibling order. The renderer places all nodes once, including hidden nodes, and keeps positions fixed during playback. A single rooted tree uses a tree layout; other graphs use a deterministic graph layout.\n\nStep(caption, changes) supplies one visible snapshot; changes is a list of operations. Replay steps 0 through k in order to get snapshot k. Only each step's final state is shown.\n\n- Tag(targets, tag?) sets or clears node or edge tags. targets is one ID or a list. Tags are active, done, dim; omitted tag clears to plain.\n- Label(target, text) changes a node or edge label.\n- Show(ids) and Hide(ids) change node visibility; ids is one node ID or a list. Hiding preserves labels and tags, and hides incident edges. Showing restores them. Show on a visible node and Hide on a hidden node are no-ops. An edge is visible exactly while both endpoints are visible. Edges cannot be shown or hidden independently; use dim for an inactive edge.\n\nUnknown IDs, unsupported tags and edge IDs passed to Show/Hide are errors. Topology stays fixed: declare future nodes hidden and reveal them later. Labels, tags and visibility persist until changed. Nodes default to visible and plain; edges default to plain.";

export function networkInput(replay: NetworkReplay): NetworkInput {
  return {
    nodes: replay.snapshots[0].nodes,
    edges: replay.snapshots[0].edges,
    nodeLabels: replay.snapshots.flatMap(s => s.nodes.map(n => n.label)),
    edgeLabels: replay.snapshots.flatMap(s => s.edges.map(e => e.label)),
  };
}

function drawNetwork(surface: HTMLElement, replay: NetworkReplay): FigureDrawing {
  const layout = layoutNetwork(networkInput(replay));
  surface.style.width = `${layout.width}px`;
  surface.style.height = `${layout.height}px`;
  const drawing = svg('svg', { width: layout.width, height: layout.height, 'aria-hidden': 'true' }, surface);
  drawing.classList.add('clew-network-edges');
  const defs = svg('defs', {}, drawing);
  const marker = `clew-network-arrow-${++markerId}`;
  const arrow = svg('marker', { id: marker, viewBox: '0 0 10 10', refX: 9, refY: 5, markerUnits: 'userSpaceOnUse', markerWidth: 12, markerHeight: 12, orient: 'auto-start-reverse' }, defs);
  svg('path', { d: 'M0 0L10 5L0 10z', fill: 'context-stroke' }, arrow);
  const directed = new Set(replay.snapshots[0].edges.filter(e => e.directed).map(e => e.id));
  const edges = new Map(layout.edges.map(edge => {
    const path = svg('path', { d: edge.path, fill: 'none' }, drawing);
    path.classList.add('clew-network-edge');
    path.dataset.edge = edge.id;
    if (directed.has(edge.id)) path.setAttribute('marker-end', `url(#${marker})`);
    const label = surface.appendChild(document.createElement('div'));
    label.className = 'clew-network-edge-label';
    label.dataset.edgeLabel = edge.id;
    position(label, edge.label);
    label.style.width = `${edge.label.width}px`;
    label.style.height = `${edge.label.height}px`;
    return [edge.id, { path, label }];
  }));
  const nodes = new Map([...layout.nodes].map(([id, p]) => {
    const node = surface.appendChild(document.createElement('div'));
    node.className = 'clew-network-node';
    node.dataset.node = id;
    position(node, p);
    node.style.width = `${p.width}px`;
    node.style.height = `${p.height}px`;
    return [id, node];
  }));
  return {
    captions: replay.snapshots.map(s => s.caption),
    show: index => {
      const state = replay.snapshots[index];
      const visible = new Set(state.nodes.filter(n => !n.hidden).map(n => n.id));
      for (const n of state.nodes) {
        const node = nodes.get(n.id)!;
        node.hidden = n.hidden;
        node.dataset.tag = n.tag;
        node.textContent = status(n.tag) + n.label;
        node.setAttribute('aria-label', `${n.label}, ${n.tag}`);
      }
      for (const e of state.edges) {
        const { path, label } = edges.get(e.id)!;
        const hidden = !visible.has(e.from) || !visible.has(e.to);
        path.style.display = hidden ? 'none' : '';
        path.dataset.tag = e.tag;
        path.setAttribute('aria-label', `${e.from} ${e.directed ? 'to' : 'and'} ${e.to}, ${e.label}, ${e.tag}`);
        label.hidden = hidden || !(e.label || status(e.tag));
        label.replaceChildren(Object.assign(document.createElement('span'), { textContent: status(e.tag) + e.label }));
        label.dataset.tag = e.tag;
      }
    },
  };
}

export const Network = defineComponent({
  name: 'Network', description: NETWORK_DOCUMENT,
  props: z.object({
    nodes: z.array(z.object({ id: z.string(), label: z.string().optional(), hidden: z.boolean().optional() })),
    edges: z.array(z.object({ id: z.string(), from: z.string(), to: z.string(), label: z.string().optional(), directed: z.boolean().optional() })),
    steps: z.array(Step.ref),
  }),
  component: strictComponent((ctx) => stepFigure(ctx, 'Network', (surface, props) => drawNetwork(surface, replayNetwork(props)))),
});
