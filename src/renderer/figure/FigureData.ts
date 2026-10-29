export const TAGS = ['active', 'done', 'match', 'new', 'dim', 'good', 'bad'] as const;
export type Tag = (typeof TAGS)[number];
export const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
export const LIMITS = {
  steps: 64, elementsPerStep: 4000, elementsPerFigure: 20000, string: 2000, text: 512 * 1024,
  tableRows: 64, tableColumns: 16, anchorsPerStep: 64, seqItems: 128, graphNodes: 128, graphEdges: 512,
  layers: 256, layerPoints: 2000, shapePoints: 256, params: 8, options: 12, quizOptions: 8,
  depth: 32, cloneDepth: 80, source: 64 * 1024, runMs: 2000, replyWaitMs: 2500, workers: 4,
  figuresPerReply: 4, repairError: 500, fnSamples: 161, cloneVisits: 2_000_000, startMs: 5000,
} as const;

/** Every element a figure program can write, with the props it takes; `Figure` itself is unwrapped by the worker. */
export const ELEMENT_PROPS: Readonly<Record<string, readonly string[]>> = {
  Row: ['id', 'gap', 'align'],
  Column: ['id', 'gap', 'align'],
  Panel: ['id', 'title', 'tag'],
  Table: ['id', 'title', 'columns', 'rows', 'rowIds', 'tags'],
  Seq: ['id', 'title', 'items', 'index', 'tags'],
  Node: ['id', 'label', 'sub', 'shape', 'tag'],
  Text: ['id', 'text'],
  Tex: ['id', 'tex'],
  Graph: ['id', 'nodes', 'edges', 'tags'],
  Quiz: ['id', 'question', 'options', 'correct', 'explanation'],
  Arrow: ['from', 'to', 'label', 'tag'],
  Pointer: ['to', 'name', 'tag'],
  Plot: ['id', 'x', 'y', 'xLabel', 'yLabel'],
  Diagram: ['id', 'width', 'height'],
  Shape: ['id', 'pts', 'closed', 'label', 'tag'],
  Circle: ['id', 'at', 'r', 'label', 'tag'],
  Vector: ['id', 'from', 'to', 'label', 'tag'],
  Segment: ['id', 'from', 'to', 'label', 'tag'],
  Points: ['id', 'pts', 'label', 'tag'],
  Label: ['id', 'at', 'text', 'tag'],
  Fn: ['id', 'pts', 'from', 'to', 'label', 'tag'],
  Region: ['id', 'top', 'base', 'from', 'to', 'label', 'tag'],
  Angle: ['id', 'at', 'from', 'to', 'label', 'tag'],
  RightAngle: ['id', 'at', 'from', 'to', 'tag'],
  Tick: ['id', 'on', 'n', 'tag'],
  Dimension: ['id', 'from', 'to', 'label', 'tag'],
};

export type Point = readonly [number, number];
export type Tags = ReadonlyMap<string, Tag>;
/** A table cell, a Seq label or any other shown value: Markdown, or a number the host formats. */
export type Text = string | number;

export type Param =
  | { kind: 'slider'; key: string; label: string; min: number; max: number; step: number; value: number; unit?: string }
  | { kind: 'choice'; key: string; label: string; options: readonly Text[]; value: Text }
  | { kind: 'text'; key: string; label: string; value: string };

export interface FigureData {
  title?: string;
  params: readonly Param[];
  steps: readonly Step[];
}

export interface Step {
  caption: string;
  root: FigureNode;
  /** Every id this step's links and tags can name: elements, rows, cells, items, nodes, edges and TeX anchors. */
  ids: ReadonlySet<string>;
}

export type Gap = 'sm' | 'md' | 'lg';
export type Align = 'start' | 'center' | 'end';

export type FigureNode =
  | { type: 'Row' | 'Column'; id?: string; gap?: Gap; align?: Align; children: readonly FigureNode[] }
  | { type: 'Panel'; id?: string; title?: string; tag?: Tag; children: readonly FigureNode[] }
  | { type: 'Table'; id?: string; title?: string; columns: readonly Text[]; rows: readonly (readonly (Text | null)[])[]; rowIds: readonly string[]; tags: Tags }
  | { type: 'Seq'; id?: string; title?: string; items: readonly { id: string; label: Text }[]; index?: true | readonly Text[]; tags: Tags }
  | { type: 'Node'; id?: string; label: Text; sub?: Text; shape?: 'box' | 'circle'; tag?: Tag }
  | { type: 'Text'; id?: string; text: string }
  | { type: 'Tex'; id?: string; tex: string }
  | { type: 'Graph'; id?: string; nodes: readonly GraphNode[]; edges: readonly GraphEdge[]; tags: Tags }
  | { type: 'Quiz'; id?: string; question: string; options: readonly Text[]; correct: Text; explanation?: string }
  | { type: 'Arrow'; from: string; to: string; label?: Text; tag?: Tag }
  | { type: 'Pointer'; to: string; name: Text; tag?: Tag }
  | { type: 'Plot'; id?: string; x: Point; y?: Point; xLabel?: string; yLabel?: string; children: readonly PlotLayer[] }
  | { type: 'Diagram'; id?: string; width: number; height: number; children: readonly DiagramLayer[] };

export interface GraphNode { id: string; label: Text; sub?: Text }
export interface GraphEdge { id?: string; from: string; to: string; label?: Text; directed?: boolean }

interface Marked { id?: string; label?: Text; tag?: Tag }

export type SharedLayer =
  | ({ type: 'Shape'; pts: readonly Point[]; closed?: boolean } & Marked)
  | ({ type: 'Circle'; at: Point; r: number } & Marked)
  | ({ type: 'Vector' | 'Segment'; from: Point; to: Point } & Marked)
  | ({ type: 'Points'; pts: readonly Point[] } & Marked)
  | { type: 'Label'; id?: string; at: Point; text: Text; tag?: Tag };

export type PlotLayer =
  | SharedLayer
  /** `pts` are the worker's samples of `f`; `y` is null where `f` was not finite. */
  | ({ type: 'Fn'; pts: readonly (readonly [number, number | null])[]; from?: number; to?: number } & Marked)
  | ({ type: 'Region'; top: string | number; base?: string | number; from?: number; to?: number } & Marked);

export type DiagramLayer =
  | SharedLayer
  | ({ type: 'Angle'; at: Point; from: Point; to: Point } & Marked)
  | { type: 'RightAngle'; id?: string; at: Point; from: Point; to: Point; tag?: Tag }
  | { type: 'Tick'; id?: string; on: readonly [Point, Point]; n?: number; tag?: Tag }
  | { type: 'Dimension'; id?: string; from: Point; to: Point; label?: Text; tag?: Tag };
