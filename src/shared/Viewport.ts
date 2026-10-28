/** The part of the document on screen. Reading view knows only the top line, so `to` is open-ended there. */
export interface Viewport {
  unit: 'lines' | 'pages';
  from: number;
  to?: number;
}
