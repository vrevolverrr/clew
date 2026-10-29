import type { Point, Size } from '@/renderer/figure/geometry';
import { fittedSize } from '@/renderer/figure/geometry';

interface NodeGeometry extends Point, Size {}
interface EdgeGeometry {
  readonly id: string;
  readonly path: string;
  readonly label: Point & Size;
}
/** Room around the drawing for a thick active border. */
const MARGIN = 4;

export interface NetworkLayout extends Size {
  readonly kind: 'tree' | 'graph';
  readonly nodes: ReadonlyMap<string, NodeGeometry>;
  readonly edges: readonly EdgeGeometry[];
}

export interface NetworkInput {
  readonly nodes: readonly { readonly id: string }[];
  readonly edges: readonly { readonly id: string; readonly from: string; readonly to: string }[];
  /** Every node label and every edge label shown in any step, which size the boxes. */
  readonly nodeLabels: readonly string[];
  readonly edgeLabels: readonly string[];
}

export function layoutNetwork({ nodes, edges, nodeLabels, edgeLabels }: NetworkInput): NetworkLayout {
  const nodeSize = fittedSize(nodeLabels, 40, 192);
  const edgeSize = fittedSize(edgeLabels, 20, 160);
  const children = new Map(nodes.map(n => [n.id, [] as string[]]));
  const parents = new Map<string, number>();
  const pairs = new Map<string, typeof edges[number][]>();
  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
  for (const edge of edges) {
    children.get(edge.from)!.push(edge.to);
    parents.set(edge.to, (parents.get(edge.to) ?? 0) + 1);
    const a = nodeIndex.get(edge.from)!;
    const b = nodeIndex.get(edge.to)!;
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    pairs.set(key, [...(pairs.get(key) ?? []), edge]);
  }
  const roots = nodes.filter(n => !parents.has(n.id));
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    return children.get(id)!.every(visit);
  };
  const tree = nodes.length > 0 && roots.length === 1 && edges.length === nodes.length - 1 && nodes.every(n => (parents.get(n.id) ?? 0) <= 1) && [...pairs.values()].every(p => p.length === 1) && visit(roots[0].id) && seen.size === nodes.length;
  let points: Point[];
  if (tree) {
    const positions = new Map<string, Point>();
    let leaf = 0;
    const place = (id: string, depth: number): number => {
      const xs = children.get(id)!.map(child => place(child, depth + 1));
      const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : leaf++;
      positions.set(id, { x, y: depth });
      return x;
    };
    place(roots[0].id, 0);
    points = nodes.map(n => positions.get(n.id)!);
  } else points = force(nodes.length, edges.map(e => [nodeIndex.get(e.from)!, nodeIndex.get(e.to)!]));

  // Room between neighbours for one edge label and a little air, so a small graph fits beside its table.
  const spacingX = nodeSize.width + edgeSize.width + 12;
  const spacingY = nodeSize.height + edgeSize.height + 12;
  // A graph scales uniformly until every pair is a full gap apart on at least one axis.
  let scale = 0;
  if (!tree) for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) scale = Math.max(scale, Math.min(spacingX / Math.max(0.001, Math.abs(points[a].x - points[b].x)), spacingY / Math.max(0.001, Math.abs(points[a].y - points[b].y))));
  const geometry = new Map(nodes.map((n, i) => [n.id, { x: points[i].x * (tree ? spacingX : scale), y: points[i].y * (tree ? spacingY : scale), ...nodeSize }]));
  // Keep Bezier control points and label boxes inside the reserved surface as well.
  const bounds: Point[] = [...geometry.values()].flatMap(p => [{ x: p.x - p.width / 2, y: p.y - p.height / 2 }, { x: p.x + p.width / 2, y: p.y + p.height / 2 }]);
  const routes: { id: string; points: Point[]; loop: boolean; label: Point & Size }[] = [];
  for (const group of pairs.values()) group.forEach((edge, index) => {
    const a = geometry.get(edge.from)!;
    const b = geometry.get(edge.to)!;
    const loop = edge.from === edge.to;
    let path: Point[];
    let center: Point;
    if (loop) {
      const height = a.height / 2 + 64 + index * (edgeSize.height + 32);
      path = [{ x: a.x - a.width / 3, y: a.y - a.height / 2 }, { x: a.x - a.width, y: a.y - height * 1.6 }, { x: a.x + a.width, y: a.y - height * 1.6 }, { x: a.x + a.width / 3, y: a.y - a.height / 2 }];
      center = { x: a.x, y: (path[0].y + 6 * path[1].y + path[3].y) / 8 };
    } else {
      // One canonical normal for both directions keeps opposite lanes distinct.
      const sign = nodeIndex.get(edge.from)! < nodeIndex.get(edge.to)! ? 1 : -1;
      const dx = (b.x - a.x) * sign;
      const dy = (b.y - a.y) * sign;
      const distance = Math.hypot(dx, dy) || 1;
      const offset = (index - (group.length - 1) / 2) * (edgeSize.height + 36);
      const control = { x: (a.x + b.x) / 2 - dy / distance * offset * 2, y: (a.y + b.y) / 2 + dx / distance * offset * 2 };
      const start = boundary(a, control);
      const end = boundary(b, control);
      path = [start, control, end];
      center = { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 };
    }
    const label = { x: center.x - edgeSize.width / 2, y: center.y - edgeSize.height / 2, ...edgeSize };
    bounds.push(...path, { x: label.x, y: label.y }, { x: label.x + label.width, y: label.y + label.height });
    routes.push({ id: edge.id, points: path, loop, label });
  });
  const minX = Math.min(0, ...bounds.map(p => p.x)) - MARGIN;
  const minY = Math.min(0, ...bounds.map(p => p.y)) - MARGIN;
  const maxX = Math.max(0, ...bounds.map(p => p.x)) + MARGIN;
  const maxY = Math.max(0, ...bounds.map(p => p.y)) + MARGIN;
  const shifted = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  return {
    kind: tree ? 'tree' : 'graph', width: maxX - minX, height: maxY - minY,
    nodes: new Map([...geometry].map(([id, p]) => [id, { ...p, x: p.x - minX - p.width / 2, y: p.y - minY - p.height / 2 }])),
    edges: routes.map(route => {
      const p = route.points.map(shifted);
      return { id: route.id, path: `M${p[0].x},${p[0].y} ${route.loop ? 'C' : 'Q'}${p.slice(1).map(v => `${v.x},${v.y}`).join(' ')}`, label: { ...route.label, ...shifted(route.label) } };
    }),
  };
}

function boundary(box: NodeGeometry, toward: Point): Point {
  const dx = toward.x - box.x;
  const dy = toward.y - box.y;
  const scale = 1 / Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2), 0.001);
  return { x: box.x + dx * scale, y: box.y + dy * scale };
}

/** Fixed iteration budget and declaration-order seeds; never rerun while stepping. */
function force(count: number, edges: readonly number[][]): Point[] {
  if (!count) return [];
  const radius = Math.max(1, Math.sqrt(count));
  const p = Array.from({ length: count }, (_, i) => ({ x: Math.cos(i * 2.399963229728653) * Math.sqrt(i + 1), y: Math.sin(i * 2.399963229728653) * Math.sqrt(i + 1) }));
  for (let iteration = 0; iteration < 120; iteration++) {
    const delta = p.map(v => ({ x: -v.x * 0.04, y: -v.y * 0.04 }));
    for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
      const dx = p[a].x - p[b].x;
      const dy = p[a].y - p[b].y;
      const d2 = Math.max(0.01, dx * dx + dy * dy);
      const f = 0.18 / d2;
      delta[a].x += dx * f; delta[a].y += dy * f;
      delta[b].x -= dx * f; delta[b].y -= dy * f;
    }
    for (const [a, b] of edges) if (a !== b) {
      const dx = (p[b].x - p[a].x) * 0.02;
      const dy = (p[b].y - p[a].y) * 0.02;
      delta[a].x += dx; delta[a].y += dy;
      delta[b].x -= dx; delta[b].y -= dy;
    }
    p.forEach((v, i) => {
      v.x = Math.max(-radius * 2, Math.min(radius * 2, v.x + Math.max(-0.2, Math.min(0.2, delta[i].x))));
      v.y = Math.max(-radius * 2, Math.min(radius * 2, v.y + Math.max(-0.2, Math.min(0.2, delta[i].y))));
    });
  }
  return p;
}
