import type { App } from 'obsidian';
import { Component, finishRenderMath, Notice, renderMath, setIcon } from 'obsidian';

import type { AgentSession } from '@/agents/types';
import { PROVIDERS } from '@/agents/providers';
import { Composer } from '@/chat/obsidian/Composer';
import { openQuote } from '@/chat/obsidian/openQuote';
import { ReplyView, type ReplyFeedback } from '@/chat/view/ReplyView';
import type { MarkdownTarget } from '@/chat/view/TextBlock';
import { appendMessageText } from '@/chat/view/appendMessageText';
import type { ChatContext } from '@/context/ChatContext';
import { type NoteQuote, quoteOf } from '@/context/NoteContext';
import type { Chat, ChatEvents } from '@/chat/Chat';
import type { ChatTurn, Rating } from '@/chat/ChatRecord';
import { usesStoredFile } from '@/chat/ChatRecord';
import type { TurnView } from '@/chat/runTurn';
import { type ChatAttachment, isMention, mentionPaths, type StoredAttachment } from '@/context/ChatAttachment';
import type { VaultAttachments } from '@/attachments/obsidian/VaultAttachments';
import type { VaultFileIndex } from '@/attachments/obsidian/VaultFileIndex';
import { ApprovalCard } from '@/chat/view/ApprovalCard';
import { type AfterRender, MarkdownContentRenderer } from '@/renderer/markdown/obsidian/MarkdownContentRenderer';
import { renderMermaidDiagrams } from '@/renderer/mermaid/obsidian/mermaidDiagrams';
import type { HighlightTour, TourEvent } from '@/tour/HighlightTour';
import type { WalkthroughHost } from '@/tour/view/Walkthrough';
import { messageOf } from '@/shared/messageOf';

const PIN_MS = 1500;
// The quote clamps to a few lines, so a long selection needs no more text in the page than this.
const QUOTE_PREVIEW_LENGTH = 400;
const MENTION_LIMIT = 8;

export interface ChatHost {
  readonly files: VaultFileIndex;
  readonly images: VaultAttachments;
  /** Walks the student through the agent's highlights; a new message ends the walk and takes its marks away. */
  readonly tour: HighlightTour;
  active(): boolean;
  changed(): void;
}

/** One chat in one tab. Its id is the tab's state, so Obsidian restores each tab to its own chat. */
export class ChatPane extends Component {
  private messagesEl!: HTMLElement;
  private composer!: Composer;
  private approvals!: ApprovalCard;
  private markdown!: MarkdownContentRenderer;
  /** What replies draw through: Markdown, plus Mermaid diagrams where a reply asks for them. */
  private replyMarkdown!: MarkdownTarget;
  private closed = false;
  private closing: Promise<void> | null = null;
  private task: Promise<void> | null = null;
  private displayed = false;
  unread = false;
  private unpin: (() => void) | null = null;
  private sourcePath = '';
  /** The walkthroughs in the pane, told which stop is on screen; emptied when the pane's turns are. */
  private readonly walkers = new Set<(event: TourEvent) => void>();
  private readonly replies = new Set<ReplyView>();
  private stopTour: (() => void) | null = null;
  readonly chat: Chat;
  private readonly walkthrough: WalkthroughHost = {
    pick: (steps, index) => this.host.tour.playFrom(steps, index),
    watch: (listener) => void this.walkers.add(listener),
  };
  constructor(
    readonly app: App,
    readonly contentEl: HTMLElement,
    private readonly host: ChatHost,
    createChat: (events: ChatEvents) => Chat,
  ) {
    super();
    this.chat = createChat({
      changed: () => {
        if (this.closed) return;
        this.composer.updateLabels();
        this.refreshTab();
      },
      switched: () => {
        if (this.closed) return;
        this.composer.closeMenus();
        if (this.chat.record.turns.length) this.addNotice(`Switched to ${PROVIDERS[this.chat.agent].name}. It does not see the earlier messages.`);
        this.composer.meter.clear();
        this.composer.refresh();
      },
      lost: () => this.addNotice('The agent no longer has this conversation, so it starts without the earlier messages.'),
      notice: (text) => this.addNotice(text),
      warn: (text) => new Notice(text),
    });
  }

  onload(): void {
    const root = this.contentEl;
    root.empty();
    this.stopTour = this.host.tour.subscribe((event) => {
      if (this.host.active()) this.walkers.forEach((listener) => listener(event));
    });
    this.messagesEl = root.createDiv({ cls: 'clew-messages' });
    const markdown = new MarkdownContentRenderer(this.app, this, () => this.sourcePath);
    const diagrams: AfterRender = (el, isCurrent, scope) => renderMermaidDiagrams(this.app, el, isCurrent, scope);
    this.markdown = markdown;
    this.replyMarkdown = {
      render: (el, text, options) => markdown.render(el, text, options?.diagrams ? diagrams : undefined),
      release: (container) => markdown.release(container),
    };
    this.registerDomEvent(this.messagesEl, 'click', (event) => this.openInternalLink(event));
    this.approvals = new ApprovalCard(root, () => this.refreshTab());
    const composerArea = root.createDiv({ cls: 'clew-chat-composer-area' });
    this.composer = new Composer(this, composerArea, {
      mentions: (query) => this.host.files.find(query, MENTION_LIMIT),
      send: () => this.send(),
      stop: () => this.chat.stop(),
      saveImage: (file) => this.host.images.save(this.chat.record.id, file, file.name || 'image'),
      imageUrl: (image) => this.host.images.url(image),
      savePaste: (text) => this.host.images.savePaste(this.chat.record.id, text),
      discardStored: (attachment) => this.discardStored(attachment),
    }, this.chat);
    for (const [index, turn] of this.chat.record.turns.entries()) this.replayTurn(turn, index);
    this.chat.open();
  }

  get waitingForApproval(): boolean { return this.approvals.size > 0; }

  activate(active: boolean): void {
    this.contentEl.hidden = !active;
    this.composer.close();
    if (active) {
      this.unread = false;
      this.composer.document.activate();
      if (!this.displayed) { this.displayed = true; this.pinToEnd(); }
    } else this.unpin?.();
  }

  focus(): void {
    this.composer.focus();
  }

  private start(task: Promise<void>): Promise<void> {
    return this.task = task.catch((error: unknown) => {
      this.addNotice(`Could not show this message: ${messageOf(error)}`);
      this.refreshTab();
    });
  }

  /**
   * Keeps the transcript at its end while a restored chat finishes drawing (Markdown and diagrams grow it after the
   * replay), until the student scrolls or a moment passes.
   */
  private pinToEnd(): void {
    this.unpin?.();
    const observer = new ResizeObserver(() => (this.messagesEl.scrollTop = this.messagesEl.scrollHeight));
    for (const turn of Array.from(this.messagesEl.children)) observer.observe(turn);
    const timer = window.setTimeout(() => this.unpin?.(), PIN_MS);
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const stop = (): void => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const name of events) this.messagesEl.removeEventListener(name, stop);
      this.unpin = null;
    };
    for (const name of events) this.messagesEl.addEventListener(name, stop, { passive: true });
    this.unpin = stop;
  }

  private refreshTab(): void {
    if (!this.closed) this.host.changed();
  }

  private addNotice(text: string): void {
    this.messagesEl.createDiv({ cls: 'clew-reply-status clew-notice', text });
  }

  close(): Promise<void> {
    return this.closing ??= this.dispose();
  }

  private async dispose(): Promise<void> {
    this.closed = true;
    const closing = this.chat.close();
    this.stopTour?.();
    this.walkers.clear();
    this.unpin?.();
    this.composer.dispose();
    await this.task;
    await closing;
    for (const reply of this.replies) reply.destroy();
    this.replies.clear();
    this.markdown.dispose();
  }

  /** Sends `message` as the student's next message, for a visual that writes one (a quiz answer). False while a reply is still being written. */
  private ask(message: string): boolean {
    if (this.chat.busy || this.closed) return false;
    const { note } = this.composer.document.read();
    this.start(this.run({ message, attachments: [], ...(note ? { note } : {}) }));
    return true;
  }

  private send(): void {
    if ((!this.composer.message && !this.composer.hasAttachments) || this.chat.busy || this.closed) return;
    const message = this.composer.message;
    this.start(this.run({ message, attachments: this.composer.take(), ...this.composer.document.read() }));
  }

  /** Runs one turn on `context`, drawn as it streams. */
  private run(context: ChatContext): Promise<void> {
    const { document } = this.composer;
    this.sourcePath = document.path;
    const { selection } = context;
    return this.displayTurn(context, (view) => this.chat.send(context, view), () => { if (selection) document.sent(selection); });
  }

  /** Keeps live replies and scripted demos on the same display lifecycle. */
  private async displayTurn(context: ChatContext, send: (view: TurnView) => Promise<void>, sent = (): void => undefined): Promise<void> {
    const { turnEl, replyEl, reply } = this.addTurn(context.message, quoteOf(context.selection), context.attachments);
    this.messagesEl.scrollTo({ top: turnEl.offsetTop, behavior: 'smooth' });
    const view = this.turnView(replyEl, reply, this.chat.record.turns.length, sent);
    this.composer.setStreaming(true);
    if (this.host.active()) this.host.tour.reset();
    try {
      await send(view);
    } finally {
      this.composer.setStreaming(false);
      this.unread = !this.host.active();
      this.refreshTab();
    }
  }

  /** What a running turn draws on: the reply being written, the tour, the context meter. */
  private turnView(replyEl: HTMLElement, reply: ReplyView, index: number, sent: () => void): TurnView {
    return {
      sent,
      appendText: (delta) => reply.appendText(delta),
      tool: (part) => reply.tool(part),
      thinking: () => reply.thinking(),
      usage: (used, window) => this.composer.meter.set(used, window),
      approve: (request, signal) => this.approvals.ask(request, signal),
      ask: (questions, signal) => this.approvals.askQuestions(questions, signal),
      act: (step) => {
        reply.highlight(step);
        if (this.host.active()) this.host.tour.add(step);
      },
      finish: (turn) => {
        reply.finish(turn.at, this.feedback(index));
        this.showStatus(replyEl, turn);
      },
    };
  }

  /**
   * Runs a turn on a session the caller made, as if the student had sent `message` with `notePath` open, and saves it.
   * A way to show what a reply looks like without an agent.
   */
  playTurn(message: string, session: AgentSession, notePath: string): Promise<void> {
    if (this.closed || this.chat.busy) return Promise.resolve();
    const context: ChatContext = { message, attachments: [], note: { path: notePath } };
    return this.start(this.displayTurn(context, (view) => this.chat.play(context, session, view)));
  }

  /** Deletes the file of an image taken off a message, unless an earlier message of the chat shows it too. */
  private discardStored(stored: StoredAttachment): void {
    if (usesStoredFile(this.chat.record.turns, stored.path)) return;
    void this.host.images.remove(stored.path).catch((error: unknown) => {
      new Notice(`Could not remove this attachment: ${messageOf(error)}`);
    });
  }

  private addTurn(message: string, quote?: NoteQuote, attachments: readonly ChatAttachment[] = []): { turnEl: HTMLElement; replyEl: HTMLElement; reply: ReplyView } {
    const turnEl = this.messagesEl.createDiv({ cls: 'clew-turn' });
    const chipped = attachments.filter((attachment) => !isMention(attachment));
    if (chipped.length) {
      const attachedEl = turnEl.createDiv({ cls: 'clew-user-attachments' });
      for (const attachment of chipped) {
        if (attachment.kind === 'image') {
          attachedEl.createEl('img', { attr: { src: this.host.images.url(attachment), alt: attachment.name } });
          continue;
        }
        const fileEl = attachedEl.createDiv({ cls: 'clew-context-chip', ...(attachment.kind === 'file' ? { attr: { title: attachment.path } } : {}) });
        setIcon(fileEl.createSpan({ cls: 'clew-context-icon' }), 'file-text');
        fileEl.createSpan({ cls: 'clew-context-label', text: attachment.name });
      }
    }
    if (quote) {
      const quoteEl = turnEl.createDiv({ cls: 'clew-user-quote', text: quote.text.slice(0, QUOTE_PREVIEW_LENGTH), attr: { 'aria-label': quote.source === 'chat' ? 'Quoted chat text' : `Open ${quote.path}` } });
      if (quote.source !== 'chat') quoteEl.addEventListener('click', () => {
        openQuote(this.app, quote).catch((error: unknown) => new Notice(`Could not open ${quote.path}: ${messageOf(error)}`));
      });
    }
    if (message) {
      const bubble = turnEl.createDiv({ cls: 'clew-user-message' });
      appendMessageText(bubble, message, { skill: this.chat.skillSyntax, mentions: mentionPaths(attachments), math: (source) => renderMath(source, false) });
      // Lets Obsidian finish the maths styles.
      if (bubble.querySelector('.math, mjx-container')) finishRenderMath().catch(() => undefined);
    }
    const replyEl = turnEl.createDiv({ cls: 'clew-reply markdown-rendered' });
    const reply = new ReplyView(replyEl, this.replyMarkdown, this.walkthrough, (message) => this.ask(message));
    this.replies.add(reply);
    return { turnEl, replyEl, reply };
  }

  /** Draws a stored turn as it was drawn live. */
  private replayTurn(turn: ChatTurn, index: number): void {
    const { replyEl, reply } = this.addTurn(turn.message, turn.quote, turn.attachments);
    for (const part of turn.parts) {
      if (part.type === 'text') reply.appendText(part.text);
      else if (part.type === 'highlight') reply.highlight(part.step);
      else reply.tool(part);
    }
    reply.finish(turn.at, this.feedback(index, turn.rating));
    this.showStatus(replyEl, turn);
  }

  /** The thumb pair for turn `index` of this chat: it starts at `rating` and saves each change to the chat's file. */
  private feedback(index: number, rating?: Rating): ReplyFeedback {
    return { rating, rate: (next) => void this.chat.rate(index, next) };
  }

  private showStatus(replyEl: HTMLElement, turn: ChatTurn): void {
    if (turn.status === 'interrupted') replyEl.createDiv({ cls: 'clew-reply-status', text: 'Stopped.' });
    if (turn.status === 'failed') replyEl.createDiv({ cls: 'clew-reply-error', text: turn.error ?? 'The agent failed.' });
  }

  private openInternalLink(event: MouseEvent): void {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a.internal-link');
    if (!link) return;
    event.preventDefault();
    void this.app.workspace.openLinkText(link.dataset.href ?? link.getAttribute('href') ?? '', this.sourcePath);
  }
}

