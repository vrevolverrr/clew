/** A box in CSS px, relative to the visual's top-left corner. */
export interface Rect { x: number; y: number; w: number; h: number }

export interface TextBox extends Rect {
  kind: 'text' | 'math' | 'svg' | 'control';
  text: string;
  /** The nearest ancestor that clips the text, if any. */
  clip?: Rect;
  /** The clipping ancestor scrolls sideways, so text past its edge is reachable. */
  scrolls?: boolean;
  fg: string;
  bg: string;
  px: number;
}

export interface StateGeometry {
  /** `step:n` or `param:i:value`. */
  state: string;
  width: number;
  /** The visual in viewport px, for the screenshot. */
  rect: Rect;
  texts: TextBox[];
  badAttributes: string[];
  error?: string;
  pageScrollsSideways: boolean;
}

export interface VisualInfo {
  kind: 'figure' | 'mermaid';
  steps: number;
  params: { label: string; min: number; max: number; value: number }[];
}
