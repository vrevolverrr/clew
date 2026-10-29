import { CaptionStack } from '@/renderer/figure/CaptionStack';
import type { MountedComponent, RenderContext } from '../OpenUIRenderer';
import { Playback } from '@/renderer/figure/Playback';
import { figureKey } from './validation';

export interface FigureDrawing {
  readonly captions: readonly string[];
  show(index: number, animate: boolean): void;
  destroy?(): void;
}

/** Builds the drawing once per content change. An invalid figure throws, and the renderer shows the error in its place. */
export function stepFigure(ctx: RenderContext, name: string, build: (surface: HTMLElement, props: Record<string, unknown>) => FigureDrawing): MountedComponent {
  const el = document.createElement('div');
  el.className = `clew-step-figure clew-${name.toLowerCase()}`;
  const scroll = el.appendChild(document.createElement('div'));
  scroll.className = 'clew-step-scroll';
  const surface = scroll.appendChild(document.createElement('div'));
  surface.className = 'clew-step-surface';
  const captions = new CaptionStack((target, text) => ctx.renderMarkdown(target, text));
  el.append(captions.el);
  let props: Record<string, unknown> | undefined;
  let key: string | undefined;
  let drawing: FigureDrawing | undefined;
  let current = 0;
  const show = (index: number, forward: boolean) => {
    if (!drawing) return;
    const animate = forward && index === current + 1;
    current = index;
    drawing.show(current, animate);
    captions.show(drawing.captions[current]);
    playback.update(drawing.captions.length - 1, current, { offset: 1 });
  };
  const playback = new Playback(show);
  el.append(playback.el);
  const clear = () => {
    playback.stop();
    drawing?.destroy?.();
    drawing = undefined;
    surface.replaceChildren();
  };
  return {
    el,
    update: next => {
      if (next === props) return;
      props = next;
      const nextKey = figureKey(next);
      if (key === nextKey) return;
      clear();
      key = undefined;
      drawing = build(surface, next);
      key = nextKey;
      captions.set(drawing.captions);
      show(0, false);
    },
    destroy: clear,
  };
}
