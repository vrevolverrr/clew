import { type MarkdownTarget, TextBlock } from '@/chat/view/TextBlock';
import { ToolGroup } from '@/chat/view/ToolGroup';
import { formatWhen } from '@/chat/view/chatList';
import type { Rating, ToolPart, TourStep } from '@/chat/ChatRecord';
import { Walkthrough, type WalkthroughHost } from '@/tour/view/Walkthrough';
import { canAnimate, createCopyButton, createIconButton } from '@/shared/view/iconButtons';

/** The thumb a reply starts with, and what to do when the student gives or takes back one. */
export interface ReplyFeedback {
  rating?: Rating;
  rate: (rating: Rating | undefined) => void;
}

/**
 * One assistant reply, in the order the agent produced it: text, then a group for each run of tool calls,
 * then more text. Text after a tool call starts a new block, so a preamble never runs into the answer. A stop the
 * agent pointed at joins the run of stops in front of it, or starts one.
 * While the agent works without writing, an empty group at the end stands in as a working line.
 */
export class ReplyView {
  private readonly blocks: (TextBlock | ToolGroup | Walkthrough)[] = [];
  /** Every stop of the reply, across its runs. */
  private readonly steps: TourStep[] = [];
  private copyable = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly markdown: MarkdownTarget,
    private readonly walkthrough: WalkthroughHost,
    /** Sends a message a visual wrote for the student, such as a quiz answer. False when the chat cannot take one now. */
    private readonly ask?: (message: string) => boolean,
  ) {
    this.follow();
  }

  appendText(delta: string): void {
    let block = this.blocks.at(-1);
    if (!(block instanceof TextBlock)) {
      // Whitespace between two tool calls must not split their group.
      if (delta.trim() === '') return;
      if (block instanceof ToolGroup && block.isEmpty()) {
        // A pause long enough to notice stays as "Thought for 3s", unless a "Used …" line already sits above it.
        const previous = this.blocks.at(-2);
        if (block.seconds() >= 1 && !(previous instanceof ToolGroup)) block.finish();
        else this.discard(block);
      }
      block = new TextBlock(this.el.createDiv({ cls: 'clew-reply-text' }), this.markdown, this.ask);
      this.blocks.push(block);
    }
    block.append(delta);
  }

  highlight(step: TourStep): void {
    const last = this.blocks.at(-1);
    if (last instanceof ToolGroup && last.isEmpty()) this.discard(last);
    this.steps.push(step);
    let run = this.blocks.at(-1);
    if (!(run instanceof Walkthrough)) {
      run = new Walkthrough(this.el.createDiv({ cls: 'clew-walkthrough' }), this.steps, this.walkthrough);
      this.blocks.push(run);
    }
    run.add();
  }

  thinking(): void {
    if (this.blocks.at(-1) instanceof TextBlock) this.follow();
  }

  tool(event: ToolPart): void {
    let group = this.blocks.find((block): block is ToolGroup => block instanceof ToolGroup && block.has(event.id));
    if (!group) {
      const [previous, last] = this.blocks.slice(-2);
      // A call right after a run of calls joins that run, so the working line between them goes.
      if (last instanceof ToolGroup && last.isEmpty() && previous instanceof ToolGroup) this.discard(last);
      const block = this.blocks.at(-1);
      group = block instanceof ToolGroup ? block : this.follow();
    }
    group.set(event);
    // Every call in the run has ended, so the agent is working on its next step.
    if (group === this.blocks.at(-1) && !group.isRunning()) this.follow();
  }

  /** `at` is when the turn ended; it shows beside the copy button, with a thumb pair when `feedback` is given. */
  finish(at?: number, feedback?: ReplyFeedback): void {
    const last = this.blocks.at(-1);
    if (last instanceof ToolGroup && last.isEmpty()) this.discard(last);
    for (const block of this.blocks) if (!(block instanceof Walkthrough)) block.finish();
    if (this.copyable || !this.text()) return;
    this.copyable = true;
    const footer = this.el.createDiv({ cls: 'clew-reply-footer' });
    if (at !== undefined) footer.createSpan({ cls: 'clew-reply-time', text: formatWhen(at, Date.now()) });
    createCopyButton(footer, 'Copy response', () => this.text(), 'clew-reply-copy');
    if (feedback) drawRatingButtons(footer, feedback.rating, feedback.rate);
  }

  private text(): string {
    return this.blocks.flatMap((block) => (block instanceof TextBlock ? [block.text.trim()] : [])).join('\n\n');
  }

  destroy(): void {
    for (const block of this.blocks) {
      if (block instanceof TextBlock) block.destroy();
      else if (block instanceof ToolGroup) block.remove();
    }
    this.blocks.length = 0;
  }

  private follow(): ToolGroup {
    const group = new ToolGroup(this.el.createDiv({ cls: 'clew-tools' }));
    this.blocks.push(group);
    return group;
  }

  private discard(group: ToolGroup): void {
    group.remove();
    this.blocks.splice(this.blocks.indexOf(group), 1);
  }
}

/** A thumbs-up and a thumbs-down. Pressing the lit one takes the thumb back. `onRate` gets the new rating, or undefined when it is taken back. */
function drawRatingButtons(parent: HTMLElement, rating: Rating | undefined, onRate: (rating: Rating | undefined) => void): void {
  const buttons = [
    ['up', createIconButton(parent, 'thumbs-up', 'Good response', 'clew-reply-rate is-up')],
    ['down', createIconButton(parent, 'thumbs-down', 'Poor response', 'clew-reply-rate is-down')],
  ] as const;
  let current = rating;
  const show = (): void => {
    for (const [name, button] of buttons) {
      const on = name === current;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    }
  };
  for (const [name, button] of buttons) {
    button.addEventListener('click', () => {
      current = current === name ? undefined : name;
      show();
      if (canAnimate(button)) {
        button.animate([
          { transform: 'scale(0.82)' },
          { transform: 'scale(1.16)', offset: 0.55 },
          { transform: 'scale(1)' },
        ], { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      }
      onRate(current);
    });
  }
  show();
}
