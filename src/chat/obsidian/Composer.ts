import type { App, Component } from 'obsidian';
import { Notice, setIcon } from 'obsidian';

import type { AgentId, SkillOption, SkillSyntax } from '@/agents/types';
import { ContextChips } from '@/chat/view/ContextChips';
import { type ContextMeter, contextMeter } from '@/chat/view/ContextMeter';
import type { ModelPickerHost } from '@/chat/view/ModelPicker';
import { type PermissionMenuHost, pickerBar } from '@/chat/view/ModelPicker';
import { filterSkills, SkillMenu } from '@/chat/view/SkillMenu';
import { appendMessageText } from '@/chat/view/appendMessageText';
import { skillTrigger } from '@/context/skillSyntax';
import { OpenDocument } from '@/context/obsidian/OpenDocument';
import { attachmentKey, type ChatAttachment, type ChatImage, type ChatPaste, isMention, isStored, mentionPaths, type StoredAttachment } from '@/context/ChatAttachment';
import { PASTE_FILE_MIN_CHARS } from '@/attachments/attachmentStorage';
import { mentionToken, mentionTokens, mentionTrigger } from '@/attachments/mentionSyntax';
import type { MentionFile } from '@/attachments/obsidian/VaultFileIndex';
import { type Dropped, dragCarriesFiles, imageFiles, readDrop } from '@/attachments/obsidian/droppedFiles';
import { AttachmentChips } from '@/attachments/view/AttachmentChips';
import type { ChipExit } from '@/shared/view/Chip';
import { messageOf } from '@/shared/messageOf';

const MAX_INPUT_HEIGHT = 192;

export interface ComposerHost {
  /** The vault files that match what was typed after `@`. */
  mentions(query: string): MentionFile[];
  /** Sends the message in the input. */
  send(): void;
  /** Stops the running turn. */
  stop(): void;
  saveImage(file: File): Promise<ChatImage>;
  savePaste(text: string): Promise<ChatPaste>;
  /** Where the chat shows a stored image from. */
  imageUrl(image: ChatImage): string;
  /** The image or paste was taken off the message before it was sent. */
  discardStored(attachment: StoredAttachment): void;
}

/** The chat's input box: the text field, its skill and file menus, the model and effort pickers, and Send. */
export class Composer {
  /** What the next turn carries from the open document. */
  readonly document: OpenDocument;
  readonly meter: ContextMeter;
  private readonly el: HTMLElement;
  private readonly inputEl: HTMLTextAreaElement;
  private readonly mirrorEl: HTMLElement;
  private readonly sendEl: HTMLButtonElement;
  private readonly pickers: ReturnType<typeof pickerBar>;
  private readonly chips: AttachmentChips;
  private attachments: ChatAttachment[] = [];
  /** Images being stored, which a send must wait for. */
  private storing = 0;
  private skillMenu: SkillMenu | null = null;
  private mentionMenu: SkillMenu<MentionFile> | null = null;
  /** The CLI's skills, read when a skill name starts being typed and kept until the menu closes. */
  private skillsRead: Promise<SkillOption[]> | null = null;
  private streaming = false;
  private disposed = false;

  constructor(
    owner: Component & { app: App; contentEl: HTMLElement },
    parent: HTMLElement,
    private readonly host: ComposerHost,
    private readonly chat: ModelPickerHost & PermissionMenuHost & { readonly skillSyntax: SkillSyntax; skills(): Promise<SkillOption[]> },
  ) {
    const composer = (this.el = parent.createDiv({ cls: 'clew-composer' }));
    // The chips come first: the document reports its state as soon as it starts following the editor.
    const contextChips = new ContextChips(composer, {
      toggleNote: () => this.document.toggleNote(),
      removeSelection: () => this.document.removeSelection(),
    });
    this.document = new OpenDocument(owner, (state, sent, animate) => contextChips.set(state, sent ? 'sent' : 'dropped', animate));
    this.chips = new AttachmentChips(contextChips.tray, (key) => this.removeChip(key));
    // The textarea's own text is transparent; the mirror behind it draws the same text with skill names and picked files colored.
    const inputWrap = composer.createDiv({ cls: 'clew-input-wrap' });
    this.mirrorEl = inputWrap.createDiv({ cls: 'clew-input-mirror', attr: { 'aria-hidden': 'true' } });
    this.inputEl = inputWrap.createEl('textarea', { cls: 'clew-input', attr: { rows: '1', placeholder: 'Ask about this note' } });
    owner.registerDomEvent(this.inputEl, 'scroll', () => (this.mirrorEl.scrollTop = this.inputEl.scrollTop));
    owner.registerDomEvent(this.inputEl, 'input', () => {
      this.refresh();
      void this.updateSkillMenu();
      this.updateMentionMenu();
    });
    owner.registerDomEvent(this.inputEl, 'blur', () => this.closeMenus());
    owner.registerDomEvent(this.inputEl, 'keydown', (event) => {
      const menu = [this.skillMenu, this.mentionMenu].find((candidate) => candidate?.isOpen);
      if (menu && this.menuKey(menu, event)) return;
      if (event.key === 'Escape' && this.streaming) {
        event.preventDefault();
        host.stop();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!this.storing) host.send();
      }
    });
    // Pasted text wins over an image beside it, as when copying from a web page.
    owner.registerDomEvent(this.inputEl, 'paste', (event) => {
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text.length > PASTE_FILE_MIN_CHARS) {
        event.preventDefault();
        void this.attachPaste(text);
        return;
      }
      const files = imageFiles(event.clipboardData?.files);
      if (!files.length || text) return;
      event.preventDefault();
      void this.attach({ images: files, attachments: [] });
    });
    owner.registerDomEvent(composer, 'dragover', (event) => {
      if (!dragCarriesFiles(owner.app, event.dataTransfer)) return;
      event.preventDefault();
      composer.addClass('is-dragging');
    });
    owner.registerDomEvent(composer, 'dragleave', (event) => {
      if (!composer.contains(event.relatedTarget as Node | null)) composer.removeClass('is-dragging');
    });
    owner.registerDomEvent(composer, 'drop', (event) => {
      composer.removeClass('is-dragging');
      if (!dragCarriesFiles(owner.app, event.dataTransfer)) return;
      event.preventDefault();
      // Obsidian also listens for drops higher up and would import the file into the vault.
      event.stopPropagation();
      void readDrop(owner.app, event.dataTransfer).then((dropped) => this.attach(dropped));
    });

    const bar = composer.createDiv({ cls: 'clew-composer-bar' });
    this.pickers = pickerBar(bar, composer, chat);
    this.meter = contextMeter(bar);

    bar.createDiv({ cls: 'clew-composer-spacer' });
    this.sendEl = bar.createEl('button', { cls: 'clew-send' });
    owner.registerDomEvent(this.sendEl, 'click', () => (this.streaming ? host.stop() : host.send()));
    this.setStreaming(false);
  }

  /** What the student typed, without the spaces around it. */
  get message(): string {
    return this.inputEl.value.trim();
  }

  private clear(): void {
    this.inputEl.value = '';
    this.refresh();
  }

  /** Whether the message carries an image or a file as a chip, which is enough to send without text. */
  get hasAttachments(): boolean {
    return this.attachments.some((attachment) => !isMention(attachment));
  }

  /**
   * What the message carries besides its text, which then leaves the input; a sent message takes its text too.
   * A picked file goes only if the text still names it. The image files stay.
   */
  take(exit: ChipExit = 'sent'): ChatAttachment[] {
    const text = this.inputEl.value;
    const taken = this.attachments.filter((attachment) => !isMention(attachment) || mentionTokens(text, [attachment.token]).length > 0);
    this.attachments = [];
    this.renderChips(exit);
    if (exit === 'sent') this.clear();
    return taken;
  }

  /** Takes everything off the input and has the stored files deleted, for a chat the input is leaving. */
  private discardAttachments(): void {
    for (const attachment of this.take('dropped')) if (isStored(attachment)) this.host.discardStored(attachment);
  }

  focus(): void {
    this.inputEl.focus();
  }

  /** Stop stays available during a turn; Send needs text. */
  setStreaming(streaming: boolean): void {
    this.streaming = streaming;
    this.sendEl.empty();
    setIcon(this.sendEl, streaming ? 'square' : 'arrow-up');
    this.sendEl.setAttr('aria-label', streaming ? 'Stop' : 'Send');
    this.sendEl.toggleClass('is-streaming', streaming);
    this.updateSend();
  }

  /** Fits the input to its text, redraws the mirror behind it, and enables Send to match. */
  refresh(): void {
    this.inputEl.style.height = 'auto';
    this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    this.mirrorEl.empty();
    // A zero-width character gives a trailing newline its line, as in the textarea.
    appendMessageText(this.mirrorEl, this.inputEl.value, { skill: this.chat.skillSyntax, mentions: mentionPaths(this.attachments), typing: this.typingMention() });
    this.mirrorEl.appendText('​');
    this.mirrorEl.scrollTop = this.inputEl.scrollTop;
    this.updateSend();
  }

  updateLabels(): void {
    this.pickers.update();
  }

  closeMenus(): void {
    this.closeSkillMenu();
    this.mentionMenu?.hide();
  }

  close(): void {
    this.closeMenus();
    this.pickers.close();
  }

  dispose(): void {
    this.disposed = true;
    this.discardAttachments();
    this.close();
  }

  private closeSkillMenu(): void {
    this.skillMenu?.hide();
    this.skillsRead = null;
  }

  private updateSend(): void {
    const empty = !this.inputEl.value.trim() && !this.hasAttachments;
    this.sendEl.disabled = !this.streaming && (empty || this.storing > 0);
  }

  private async attach({ images: files, attachments }: Dropped): Promise<void> {
    for (const attachment of attachments) this.add(attachment);
    this.storing += files.length;
    this.renderChips();
    const stored = await Promise.all(files.map((file) => this.host.saveImage(file).catch((error: unknown) => {
      new Notice(`Could not attach ${file.name}: ${messageOf(error)}`);
      return null;
    })));
    for (const image of stored) if (image) this.add(image);
    this.storing -= files.length;
    this.renderChips();
  }

  /** Stores a paste that is too long for the input and attaches it; if that fails the text goes into the input instead. */
  private async attachPaste(text: string): Promise<void> {
    const { selectionStart, selectionEnd } = this.inputEl;
    this.storing++;
    this.updateSend();
    try {
      this.add(await this.host.savePaste(text));
    } catch (error) {
      new Notice(`Could not attach the pasted text: ${messageOf(error)}`);
      this.inputEl.setRangeText(text, selectionStart, selectionEnd, 'end');
      this.inputEl.dispatchEvent(new Event('input'));
    } finally {
      this.storing--;
      this.renderChips();
    }
  }

  /** Adds an attachment unless the message has it already. */
  private add(attachment: ChatAttachment): void {
    if (this.disposed) {
      if (isStored(attachment)) this.host.discardStored(attachment);
      return;
    }
    if (!this.attachments.some((other) => attachmentKey(other) === attachmentKey(attachment))) this.attachments.push(attachment);
  }

  private removeChip(key: string): void {
    const removed = this.attachments.find((attachment) => attachmentKey(attachment) === key);
    this.attachments = this.attachments.filter((attachment) => attachment !== removed);
    if (removed && isStored(removed)) this.host.discardStored(removed);
    this.renderChips();
  }

  private renderChips(exit?: ChipExit): void {
    this.chips.set(
      this.attachments.filter((attachment) => !isMention(attachment)).map((attachment) => ({
        key: attachmentKey(attachment),
        name: attachment.name,
        ...(attachment.kind === 'image' ? { src: this.host.imageUrl(attachment) } : attachment.kind === 'file' ? { title: attachment.path } : {}),
      })),
      exit,
    );
    this.updateSend();
  }

  /** Handles the keys the open menu owns; false leaves the key to the input. */
  private menuKey(menu: Pick<SkillMenu, 'move' | 'pickActive' | 'hide'>, event: KeyboardEvent): boolean {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        menu.move(event.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Enter':
      case 'Tab':
        if (event.isComposing) return false;
        menu.pickActive();
        break;
      case 'Escape':
        menu.hide();
        break;
      default:
        return false;
    }
    event.preventDefault();
    return true;
  }

  /** Lists the CLI's skills while a skill name is typed at the cursor. */
  private async updateSkillMenu(): Promise<void> {
    const agent: AgentId = this.chat.agent;
    const syntax = this.chat.skillSyntax;
    if (!skillTrigger(this.inputEl.value, this.inputEl.selectionStart, syntax)) {
      this.closeSkillMenu();
      return;
    }
    // Read fresh on each open: skills and commands change while the session runs.
    this.skillsRead ??= this.chat.skills();
    const skills = await this.skillsRead;
    // The input may have changed while the list loaded.
    const trigger = skillTrigger(this.inputEl.value, this.inputEl.selectionStart, syntax);
    if (!trigger || this.chat.agent !== agent) {
      this.closeSkillMenu();
      return;
    }
    this.skillMenu ??= new SkillMenu(this.el, (skill) => this.pickSkill(skill));
    this.skillMenu.show(filterSkills(skills, trigger.query), trigger.query, syntax.prefix);
  }

  private pickSkill(skill: SkillOption): void {
    const syntax = this.chat.skillSyntax;
    const cursor = this.inputEl.selectionStart;
    const trigger = skillTrigger(this.inputEl.value, cursor, syntax);
    if (!trigger) return;
    this.inputEl.setRangeText(`${syntax.prefix}${skill.name} `, trigger.start, cursor, 'end');
    this.inputEl.dispatchEvent(new Event('input'));
  }

  private updateMentionMenu(): void {
    const trigger = mentionTrigger(this.inputEl.value, this.inputEl.selectionStart);
    if (!trigger) {
      this.mentionMenu?.hide();
      return;
    }
    this.mentionMenu ??= new SkillMenu(this.el, (file) => this.pickMention(file), 'Files');
    this.mentionMenu.show(this.host.mentions(trigger.query), trigger.query, '@');
  }

  /** The `@name` at the cursor, through the end of the word, so the whole name is colored while it is edited. */
  private typingMention(): { start: number; end: number } | undefined {
    const { value, selectionStart } = this.inputEl;
    const trigger = mentionTrigger(value, selectionStart);
    if (!trigger) return undefined;
    return { start: trigger.start, end: selectionStart + /^[^\s@]*/.exec(value.slice(selectionStart))![0].length };
  }

  /** Replaces the `@name` being typed with the file's token, which the mirror then draws as a pill. */
  private pickMention(file: MentionFile): void {
    const cursor = this.inputEl.selectionStart;
    const trigger = mentionTrigger(this.inputEl.value, cursor);
    if (!trigger) return;
    const mentions = this.attachments.filter(isMention);
    let token = mentions.find(({ path }) => path === file.fullPath)?.token;
    if (token === undefined) {
      token = mentionToken(file.name, new Set(mentions.map((mention) => mention.token)));
      // A file already dropped on the message is named by its token from now on.
      this.attachments = this.attachments.filter((attachment) => attachment.kind !== 'file' || attachment.path !== file.fullPath);
      this.attachments.push({ kind: 'file', path: file.fullPath, name: file.name, token });
      this.renderChips();
    }
    this.inputEl.setRangeText(`@${token} `, trigger.start, cursor, 'end');
    this.inputEl.dispatchEvent(new Event('input'));
  }
}
