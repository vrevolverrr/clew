import type { NoteSelection } from '@/context/NoteContext';
import type { Viewport } from '@/shared/Viewport';
import type { ChatAttachment } from '@/context/ChatAttachment';

/**
 * What one message carries, built once when the student sends it and only read after that. Each part comes from
 * the layer that owns it: the message and attachments from the input, the note and selection from the note open in the editor.
 */
export interface ChatContext {
  readonly message: string;
  readonly attachments: readonly ChatAttachment[];
  /** The document open in the editor, if the turn carries it. Its text is not sent; the agent reads the file by its path. */
  readonly note?: { readonly path: string; readonly viewport?: Viewport };
  readonly selection?: NoteSelection;
}
