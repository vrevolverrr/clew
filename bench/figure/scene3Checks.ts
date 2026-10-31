// Checks a figure's 3D Plots straight from `scene3`, with no window: finite geometry, ticks and overlays inside the
// frame, and paint order against a depth buffer, over many views and widths. The canvas paints exactly this order.
import type { FigureNode, Plot3Model, View } from '@/renderer/figure/FigureData';
import { meshOf, paintOrder, scene3, textWidth, type Xy } from '@/renderer/figure/plot3/scene3';
import { depthErrors } from '../../tests/depthErrors';
import type { Finding } from './checks';
import { runFigure } from './runProgram';

const VIEWS: View[] = [
  { azimuth: 30, elevation: 25 }, { azimuth: 0, elevation: 25 }, { azimuth: 90, elevation: 25 }, { azimuth: 180, elevation: 25 },
  { azimuth: 270, elevation: 25 }, { azimuth: 30, elevation: 89 }, { azimuth: 30, elevation: 0 }, { azimuth: 30, elevation: -30 },
  { azimuth: 210, elevation: -60 }, { azimuth: 135, elevation: 45 },
];
const WIDTHS = [260, 320, 480, 720, 1200];
/** As `FigureView` sizes a Plot. */
const heightOf = (width: number): number => Math.min(360, (width * 2) / 3);
const COLOURS = { ramp: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]] as const };
const CHAR = 7;
/** Depth-order errors above this share of covered points are reported. */
const DEPTH_LIMIT = 0.005;

export interface Plot3Report { findings: Finding[]; faces: number }

type Plot3 = Extract<FigureNode, { type: 'Plot3' }>;

function plots(root: FigureNode, out: Plot3[] = []): Plot3[] {
  if (root.type === 'Plot3') out.push(root);
  if (root.type === 'Row' || root.type === 'Column' || root.type === 'Panel') root.children.forEach((child) => plots(child, out));
  return out;
}

const finite = (p: Xy): boolean => Number.isFinite(p[0]) && Number.isFinite(p[1]);

function checkScene(model: Plot3Model, name: string, add: (check: string, detail: string) => void): number {
  let faces = 0;
  for (const view of [model.view, ...VIEWS]) {
    for (const width of WIDTHS) {
      const height = heightOf(width);
      const at = `${name} at ${width}px, azimuth ${view.azimuth}, elevation ${view.elevation}`;
      let scene;
      try {
        scene = scene3(model, view, { width, height }, COLOURS);
      } catch (error) {
        add('scene-throws', `${at}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      faces = Math.max(faces, scene.faces.length);
      const points: Xy[] = [
        ...scene.faces.flatMap((face) => face.pts), ...scene.box.flat(), ...scene.axes.flatMap((axis) => [axis.from, axis.to]),
        ...scene.ticks.flatMap((tick) => [tick.at, tick.to, tick.textAt]), ...scene.titles.map((title) => title.at),
      ];
      const bad = points.filter((p) => !finite(p)).length;
      if (bad) add('nan-geometry', `${at}: ${bad} points are not finite`);
      const fills = scene.faces.filter((face) => !/^rgb\(\d+, \d+, \d+\)$/.test(face.fill));
      if (fills.length) add('bad-fill', `${at}: ${fills.length} faces filled "${fills[0].fill}"`);
      for (const text of [...scene.ticks.map((tick) => ({ at: tick.textAt, text: tick.text, anchor: tick.anchor })), ...scene.titles]) {
        const w = textWidth(text.text, CHAR / 0.58);
        const left = text.anchor === 'start' ? text.at[0] : text.anchor === 'end' ? text.at[0] - w : text.at[0] - w / 2;
        if (left < -1 || left + w > width + 1 || text.at[1] - 12 < -1 || text.at[1] > height + 1) {
          add('text-outside', `${at}: "${text.text.slice(0, 40)}" at (${Math.round(left)}, ${Math.round(text.at[1])}) leaves the ${width} × ${height} frame`);
          break;
        }
      }
      const outside = scene.overlays.flatMap((overlay) => ('points' in overlay ? overlay.points : [overlay.at]))
        .filter((p) => !finite(p) || p[0] < 0 || p[0] > width || p[1] < 0 || p[1] > height);
      if (outside.length) add('overlay-outside', `${at}: ${outside.length} overlay points outside the frame, e.g. (${outside[0].map(Math.round).join(', ')})`);
      const ticksPerAxis = new Set(scene.ticks.map((tick) => tick.text)).size;
      if (scene.ticks.length && ticksPerAxis < scene.ticks.length / 3 - 1) add('tick-repeats', `${at}: ${scene.ticks.length} ticks show only ${ticksPerAxis} distinct values`);
    }
    const mesh = meshOf(model, COLOURS);
    if (mesh.faces.length) {
      const share = depthErrors(mesh.faces, paintOrder(mesh, view), view);
      // A flat surface seen edge-on covers no point: nothing to order.
      if (share > DEPTH_LIMIT) add('depth-order', `${name} at azimuth ${view.azimuth}, elevation ${view.elevation}: ${(share * 100).toFixed(2)}% of covered points paint the wrong face on top`);
    }
  }
  const axes = [model.x, model.y, model.z].map(([lo, hi], k) => (Number.isFinite(lo) && Number.isFinite(hi) && lo < hi ? '' : `${'xyz'[k]} = [${lo}, ${hi}]`)).filter(Boolean);
  if (axes.length) add('bad-axis', `${name}: ${axes.join(', ')}`);
  const span = model.z[1] - model.z[0];
  const heights = model.children.flatMap((layer) => (layer.type === 'Fn' && 'zs' in layer ? layer.zs.filter((z): z is number => z !== null) : []));
  if (heights.length && span > 0) {
    const sorted = [...heights].sort((a, b) => a - b);
    const middle = sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)];
    // Flattened means a few heights stretch z: a surface that is flat throughout is not.
    if (middle / span < 0.02 && sorted[sorted.length - 1] - sorted[0] > 10 * middle && sorted[sorted.length - 1] - sorted[0] > 0.5 * span) add('flattened', `${name}: 80% of the surface spans ${((middle / span) * 100).toFixed(2)}% of z = [${model.z.join(', ')}]`);
  }
  return faces;
}

/** Runs the program and checks every 3D Plot in its first and last steps. */
export async function checkPlots3(source: string): Promise<Plot3Report | null> {
  const result = await runFigure(source);
  if ('error' in result) return null;
  const steps = result.figure.steps;
  const found = [...new Set([steps[0], steps[steps.length - 1]])].flatMap((step, s) => plots(step.root).map((plot, i) => ({ plot, name: `${plot.id ?? `plot ${i + 1}`} (step ${s === 0 ? 1 : steps.length})` })));
  if (!found.length) return null;
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add = (check: string, detail: string): void => {
    // One finding per check and plot, so a fault at every view reads once.
    const key = `${check}|${detail.split(' at ')[0]}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ check, detail });
  };
  let faces = 0;
  for (const { plot, name } of found) faces = Math.max(faces, checkScene(plot, name, add));
  return { findings, faces };
}
