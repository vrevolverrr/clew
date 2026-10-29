import { div, svg } from '@/renderer/figure/dom';
import type { FigureNode, GraphEdge, GraphNode, Tag } from '@/renderer/figure/FigureData';
import { formatFigure } from '@/renderer/figure/formatFigure';
import { position, status } from '@/renderer/figure/geometry';
import { layoutNetwork, type NetworkLayout } from '@/renderer/figure/network/layoutNetwork';

type Graph = Extract<FigureNode, { type: 'Graph' }>;

export type Markdown = (el: HTMLElement, text: string | number) => void;

let markerId = 0;

const nodeText = (node: GraphNode): string => [formatFigure(node.label), node.sub === undefined ? '' : formatFigure(node.sub)].filter(Boolean).join('\n');

/** Each edge's key across steps: its id, or its ends and how many edges with the same ends come before it. */
function edgeKeys(edges: readonly GraphEdge[]): string[] {
  const seen = new Map<string, number>();
  return edges.map((edge) => {
    if (edge.id) return edge.id;
    const ends = `${edge.from}>${edge.to}`;
    const count = seen.get(ends) ?? 0;
    seen.set(ends, count + 1);
    return `${ends}#${count}`;
  });
}

/** One layout for a Graph over every step it is in: the union of its nodes and edges, first seen first, so nothing moves. */
export function layoutGraph(uses: readonly Graph[]): NetworkLayout {
  const nodes = new Set<string>();
  const edges = new Map<string, { id: string; from: string; to: string }>();
  const nodeLabels: string[] = [];
  const edgeLabels: string[] = [];
  for (const graph of uses) {
    for (const node of graph.nodes) {
      nodes.add(node.id);
      // Room for the ▶ an active node shows.
      nodeLabels.push(`▶ ${nodeText(node)}`);
    }
    edgeKeys(graph.edges).forEach((key, i) => {
      const edge = graph.edges[i];
      if (!edges.has(key)) edges.set(key, { id: key, from: edge.from, to: edge.to });
      if (edge.label !== undefined) edgeLabels.push(formatFigure(edge.label));
    });
  }
  return layoutNetwork({ nodes: [...nodes].map((id) => ({ id })), edges: [...edges.values()], nodeLabels, edgeLabels });
}

/** Draws one step of a Graph at the places `layout` gives; nodes and edges absent from this step are hidden. */
export function drawGraph(parent: HTMLElement, graph: Graph, layout: NetworkLayout, tagOf: (id: string) => Tag | undefined, markdown: Markdown): void {
  const surface = parent.appendChild(div('clew-figure-graph'));
  if (graph.id) surface.dataset.figureId = graph.id;
  surface.style.width = `${layout.width}px`;
  surface.style.height = `${layout.height}px`;
  const drawing = svg('svg', { width: layout.width, height: layout.height, 'aria-hidden': 'true', class: 'clew-network-edges' }, surface);
  const marker = `clew-figure-graph-arrow-${(markerId += 1)}`;
  const head = svg('marker', { id: marker, viewBox: '0 0 10 10', refX: 9, refY: 5, markerUnits: 'userSpaceOnUse', markerWidth: 12, markerHeight: 12, orient: 'auto-start-reverse' }, svg('defs', {}, drawing));
  svg('path', { d: 'M0 0L10 5L0 10z', fill: 'context-stroke' }, head);

  const present = new Map(edgeKeys(graph.edges).map((key, i) => [key, graph.edges[i]]));
  for (const geometry of layout.edges) {
    const edge = present.get(geometry.id);
    if (!edge) continue;
    const tag = edge.id ? tagOf(edge.id) : undefined;
    const path = svg('path', { d: geometry.path, fill: 'none', class: 'clew-network-edge' }, drawing);
    if (edge.id) path.dataset.figureId = edge.id;
    if (tag) path.dataset.tag = tag;
    if (edge.directed) path.setAttribute('marker-end', `url(#${marker})`);
    if (edge.label === undefined) continue;
    const label = surface.appendChild(div('clew-network-edge-label'));
    if (tag) label.dataset.tag = tag;
    position(label, geometry.label);
    label.style.width = `${geometry.label.width}px`;
    label.style.height = `${geometry.label.height}px`;
    markdown(label.appendChild(createSpan()), `${status(tag ?? '')}${formatFigure(edge.label)}`);
  }

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const [id, box] of layout.nodes) {
    const node = nodes.get(id);
    if (!node) continue;
    const tag = tagOf(id);
    const el = surface.appendChild(div('clew-network-node'));
    el.dataset.figureId = id;
    if (tag) el.dataset.tag = tag;
    position(el, box);
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
    markdown(el.appendChild(div('clew-network-node-label')), `${status(tag ?? '')}${formatFigure(node.label)}`);
    if (node.sub !== undefined) markdown(el.appendChild(div('clew-network-node-sub')), node.sub);
  }
}
