import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeTypes,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  type NodeTypes,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";

import {
  ArrowDown,
  Camera,
  ChevronDown,
  CircleDot,
  Clock3,
  GitBranch,
  Globe2,
  LayoutGrid,
  MousePointerClick,
  Timer,
  Type,
  Zap,
} from "lucide-react";

import { createPortal } from "react-dom";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";

import type { ScriptStep, ScriptStepKind } from "../../types";

import {
  layoutWorkflowScriptNodes,
  persistWorkflowLayoutMode,
  readStoredWorkflowLayoutMode,
  type WorkflowLayoutMode,
} from "./workflowScriptDagreLayout";

import { WorkflowScriptMiniMapEdges } from "./WorkflowScriptMiniMapEdges";
import { WorkflowScriptStepEdge } from "./WorkflowScriptStepEdge";
import { workflowScriptSmoothStepPathOptions } from "./workflowScriptSmoothStep";

const SCRIPT_FLOW_NODE_TYPE = "workflowScriptStep" as const;

const WORKFLOW_SCRIPT_EDGE_TYPE = "workflowScriptStepEdge" as const;

export type WorkflowScriptFlowProps = {
  steps: ScriptStep[];

  selectedStepId: string;

  onSelectStep: (id: string) => void;

  onReorderBySortedIds: (ids: string[]) => void;
};

type ScriptFlowNodeData = {
  step: ScriptStep;
};

function scriptFlowSubtitle(step: ScriptStep): string {
  const sel = String(step.selector || "").trim();

  const val = String(step.value || "").trim();

  if (sel && val) return `${sel} · ${val}`;

  if (sel) return sel;

  if (val) return val;

  return `${step.timeoutMs ?? 0}ms`;
}

const SCRIPT_KIND_CATEGORY: Record<
  ScriptStepKind,
  "page" | "interact" | "capture" | "logic"
> = {
  navigate: "page",
  wait: "page",
  click: "interact",
  type: "interact",
  scroll: "interact",
  delay: "interact",
  screenshot: "capture",
  condition: "logic",
  action: "logic",
};

function scriptFlowCategory(
  kind: ScriptStepKind,
): "page" | "interact" | "capture" | "logic" {
  return SCRIPT_KIND_CATEGORY[kind];
}

const CATEGORY_MINIMAP_COLOR: Record<
  "page" | "interact" | "capture" | "logic",
  string
> = {
  page: "rgb(56, 217, 255)",
  interact: "rgb(251, 114, 255)",
  capture: "rgb(252, 211, 77)",
  logic: "rgb(52, 239, 187)",
};

const WORKFLOW_LAYOUT_OPTIONS: {
  value: WorkflowLayoutMode;
  label: string;
}[] = [
  { value: "serpentine", label: "Serpentine grid (compact)" },
  { value: "zigzag_lr", label: "Zigzag row (L → R)" },
  { value: "linear_lr", label: "Single horizontal row" },
];

/** Default viewport: centered graph at one zoom step above minimum (xyflow ×1.2). */
const WORKFLOW_CANVAS_MIN_ZOOM = 0.45;
const WORKFLOW_CANVAS_ZOOM_STEP = 1.2;
const WORKFLOW_CANVAS_DEFAULT_ZOOM =
  Math.min(2, WORKFLOW_CANVAS_MIN_ZOOM * WORKFLOW_CANVAS_ZOOM_STEP);

const WORKFLOW_CANVAS_FIT_VIEW = {
  padding: 0.22,
  minZoom: WORKFLOW_CANVAS_DEFAULT_ZOOM,
  maxZoom: WORKFLOW_CANVAS_DEFAULT_ZOOM,
  duration: 260,
} as const;

type WorkflowMiniMapNodeProps = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  className?: string;
  /** @remarks Named `color` to match @xyflow/react MiniMap default node API */
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  borderRadius?: number;
  style?: CSSProperties;
  shapeRendering?: string;

  onClick?: (event: ReactMouseEvent<Element>, nodeId: string) => void;
};

/** Compact circular dots inside the rectangular mini-map viewport. */
const WorkflowScriptMiniMapNode = memo(function WorkflowScriptMiniMapNode({
  id,
  x,
  y,
  width,
  height,
  style,
  color,
  strokeColor,
  strokeWidth,
  className,
  selected,
  onClick,
  shapeRendering,
}: WorkflowMiniMapNodeProps): ReactElement {
  const fill =
    color || (style?.backgroundColor as string) || (style?.background as string);

  const cx = x + width / 2;
  const cy = y + height / 2;
  const radius = Math.max(2.5, Math.min(width, height) * 0.17);

  return (
    <circle
      className={[`react-flow__minimap-node`, selected ? "selected" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      cx={cx}
      cy={cy}
      r={radius}
      style={{
        fill,
        stroke: strokeColor,
        strokeWidth,
      }}
      shapeRendering={shapeRendering}
      onClick={onClick ? (event) => onClick(event, id) : undefined}
    />
  );
});

const STEP_ICONS: Partial<Record<ScriptStepKind, typeof Globe2>> = {
  navigate: Globe2,
  wait: Clock3,
  click: MousePointerClick,
  type: Type,
  delay: Timer,
  scroll: ArrowDown,
  screenshot: Camera,
  condition: GitBranch,
  action: Zap,
};

const WorkflowScriptFlowNode = memo(function WorkflowScriptFlowNode({
  data,
  selected,
}: NodeProps<Node<ScriptFlowNodeData, typeof SCRIPT_FLOW_NODE_TYPE>>) {
  const cat = scriptFlowCategory(data.step.kind);

  const Icon = STEP_ICONS[data.step.kind] ?? CircleDot;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="workflow-script-handle workflow-script-handle--tgt"
      />

      <div
        className={`workflow-script-node workflow-script-node--${cat}${selected ? " is-selected" : ""}${data.step.enabled ? "" : " is-disabled"}`}
      >
        <div className="workflow-script-node__orb">
          <Icon size={22} aria-hidden strokeWidth={1.95} />
        </div>

        <div className="workflow-script-node__status-row" role="status" aria-live="polite">
          <span
            title={
              data.step.enabled
                ? "Enabled — runs when the workflow executes."
                : "Disabled — skipped when the workflow executes."
            }
            className={`workflow-script-node__status-chip${data.step.enabled ? "" : " workflow-script-node__status-chip--off"}`}
          >
            <span className="workflow-script-node__status-dot" aria-hidden />
            {data.step.enabled ? "Active" : "Skipped"}
          </span>
        </div>

        <div className="workflow-script-node__labels">
          <div className="workflow-script-node__title">{data.step.name}</div>

          <div className="workflow-script-node__sub">
            {scriptFlowSubtitle(data.step)}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="workflow-script-handle workflow-script-handle--src"
      />
    </>
  );
});

const nodeTypes = {
  [SCRIPT_FLOW_NODE_TYPE]: WorkflowScriptFlowNode,
} satisfies NodeTypes;

const edgeTypes = {
  [WORKFLOW_SCRIPT_EDGE_TYPE]: WorkflowScriptStepEdge,
} satisfies EdgeTypes;

function buildSkeletonNodes(
  steps: ScriptStep[],
  selectedStepId: string,
): Node<ScriptFlowNodeData>[] {
  return steps.map((step) => ({
    id: step.id,

    type: SCRIPT_FLOW_NODE_TYPE,

    position: { x: 0, y: 0 },

    data: { step },

    draggable: true,

    selected: step.id === selectedStepId,
  }));
}

function mergeNodeStepData(
  prev: Node<ScriptFlowNodeData>[],

  steps: ScriptStep[],

  selectedStepId: string,
): Node<ScriptFlowNodeData>[] | null {
  if (prev.length !== steps.length) return null;

  const out: Node<ScriptFlowNodeData>[] = [];

  for (const step of steps) {
    const old = prev.find((p) => p.id === step.id);

    if (!old) return null;

    out.push({
      ...old,

      data: { step },

      selected: step.id === selectedStepId,
    });
  }

  return out;
}

function edgesSignature(edges: Edge[]): string {
  return edges.map((edge) => edge.id).join("|");
}

function nodesVisualSignature(nodes: Node<ScriptFlowNodeData>[]): string {
  return nodes
    .map((node) => `${node.id}:${node.selected ? 1 : 0}:${node.position.x},${node.position.y}`)
    .join("|");
}

function buildEdges(steps: ScriptStep[], layoutMode: WorkflowLayoutMode): Edge[] {
  const pathOptions = workflowScriptSmoothStepPathOptions(layoutMode);

  const list: Edge[] = [];

  for (let i = 0; i < steps.length - 1; i += 1) {
    list.push({
      id: `${steps[i].id}->${steps[i + 1].id}`,
      source: steps[i].id,
      target: steps[i + 1].id,
      type: WORKFLOW_SCRIPT_EDGE_TYPE,
      pathOptions,
    } as Edge);
  }

  return list;
}

function WorkflowScriptFlowInner({
  steps,

  selectedStepId,

  onSelectStep,

  onReorderBySortedIds,
}: WorkflowScriptFlowProps): ReactElement {
  const { fitView, getNodes } = useReactFlow();
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;

  const [nodes, setNodes, onNodesChange] = useNodesState<
    Node<ScriptFlowNodeData>
  >([]);

  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [layoutMode, setLayoutMode] = useState<WorkflowLayoutMode>(
    () => readStoredWorkflowLayoutMode(),
  );

  const layoutTriggerRef = useRef<HTMLButtonElement>(null);

  const layoutMenuRef = useRef<HTMLDivElement>(null);

  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);

  const [layoutMenuCoords, setLayoutMenuCoords] = useState<{
    top: number;

    left: number;

    width: number;
  } | null>(null);

  const structuralKey = steps.map((s) => s.id).join("|");

  const lastRelayoutSig = useRef<string>("");

  useEffect(() => {
    const nextEdges = buildEdges(steps, layoutMode);
    setEdges((prev) => (edgesSignature(prev) === edgesSignature(nextEdges) ? prev : nextEdges));

    const relayoutSig = `${structuralKey}|${layoutMode}`;
    const shouldRelayoutPositions = lastRelayoutSig.current !== relayoutSig;

    if (shouldRelayoutPositions) {
      lastRelayoutSig.current = relayoutSig;
      const skeleton = buildSkeletonNodes(steps, selectedStepId);
      const layouted = layoutWorkflowScriptNodes(skeleton, nextEdges, layoutMode);
      setNodes(layouted);
      requestAnimationFrame(() => {
        void fitViewRef.current(WORKFLOW_CANVAS_FIT_VIEW);
      });
      return;
    }

    setNodes((prev) => {
      if (prev.length !== steps.length) return prev;
      const merged = mergeNodeStepData(prev, steps, selectedStepId);
      if (!merged) return prev;
      if (nodesVisualSignature(prev) === nodesVisualSignature(merged)) return prev;
      return merged;
    });
  }, [steps, structuralKey, selectedStepId, layoutMode]);

  useLayoutEffect(() => {
    if (!layoutMenuOpen) {
      setLayoutMenuCoords(null);

      return;
    }

    function place(): void {
      const el = layoutTriggerRef.current;

      if (!el) return;

      const rect = el.getBoundingClientRect();

      setLayoutMenuCoords({
        top: rect.bottom + 4,

        left: rect.left,

        width: Math.max(rect.width, 216),
      });
    }

    place();

    window.addEventListener("resize", place);

    return () => window.removeEventListener("resize", place);
  }, [layoutMenuOpen]);

  useEffect(() => {
    if (!layoutMenuOpen) return;

    function onPointerDown(ev: DocumentEventMap["mousedown"]): void {
      const target = ev.target;

      if (!(target instanceof Element)) return;

      if (layoutTriggerRef.current?.contains(target)) return;

      if (layoutMenuRef.current?.contains(target)) return;

      setLayoutMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown, true);

    return () => document.removeEventListener("mousedown", onPointerDown, true);
  }, [layoutMenuOpen]);

  useEffect(() => {
    if (!layoutMenuOpen) return;

    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setLayoutMenuOpen(false);
    }

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [layoutMenuOpen]);

  const onNodeDragStop = useCallback(() => {
    const orderedIds = [...getNodes()]

      .sort((a, b) => {
        const dx = Math.round(a.position.x) - Math.round(b.position.x);

        if (dx !== 0) return dx;

        return String(a.id).localeCompare(String(b.id));
      })

      .map((n) => n.id);

    const currentIds = steps.map((s) => s.id);

    if (orderedIds.length !== currentIds.length) return;

    if (orderedIds.every((id, i) => id === currentIds[i])) return;

    const expect = new Set(currentIds);

    for (const id of orderedIds) {
      if (!expect.has(id)) return;
    }

    onReorderBySortedIds(orderedIds);
  }, [getNodes, onReorderBySortedIds, steps]);

  return (
    <ReactFlow
      className="workflow-script-flow rf-theme"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onSelectStep(node.id)}
      onNodeDragStop={onNodeDragStop}
      fitViewOptions={{
        padding: WORKFLOW_CANVAS_FIT_VIEW.padding,
        minZoom: WORKFLOW_CANVAS_FIT_VIEW.minZoom,
        maxZoom: WORKFLOW_CANVAS_FIT_VIEW.maxZoom,
      }}
      defaultEdgeOptions={
        {
          type: WORKFLOW_SCRIPT_EDGE_TYPE,
          pathOptions: workflowScriptSmoothStepPathOptions(layoutMode),
          className: "workflow-script-edge",
          interactionWidth: 26,
          style: {
            strokeWidth: 2.15,
            stroke: "rgba(148, 210, 255, 0.88)",
            strokeLinecap: "round",
            strokeLinejoin: "round",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: "rgb(157, 230, 253)",
          },
        } as DefaultEdgeOptions
      }
      nodesConnectable={false}
      elementsSelectable={true}
      selectNodesOnDrag={false}
      nodeDragThreshold={5}
      panOnDrag={true}
      zoomOnPinch={true}
      zoomOnDoubleClick={false}
      minZoom={WORKFLOW_CANVAS_MIN_ZOOM}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      elevateNodesOnSelect
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={2} />

      <Panel
        position="top-right"
        className="workflow-script-flow-panel-toolbar"
      >
        <div className="workflow-script-layout-picker">
          <LayoutGrid
            size={14}
            className="workflow-script-layout-picker-icon"
            aria-hidden
          />
          <div className="workflow-script-layout-picker-field">
            <span className="workflow-script-layout-picker-label" id="workflow-layout-label">
              Layout
            </span>
            <button
              ref={layoutTriggerRef}
              type="button"
              className="workflow-script-layout-trigger"
              aria-labelledby="workflow-layout-label"
              aria-expanded={layoutMenuOpen}
              aria-haspopup="listbox"
              title="Choose workflow step placement · rectangular cards with circular actions on canvas."
              onClick={() => setLayoutMenuOpen((open) => !open)}
            >
              <span className="workflow-script-layout-trigger-value">
                {WORKFLOW_LAYOUT_OPTIONS.find((o) => o.value === layoutMode)?.label ??
                  layoutMode}
              </span>

              <ChevronDown size={14} aria-hidden />
            </button>
          </div>
        </div>
      </Panel>

      {layoutMenuOpen && layoutMenuCoords
        ? createPortal(
            <div
              ref={layoutMenuRef}
              role="listbox"
              aria-label="Workflow layout mode"
              className="workflow-script-layout-menu"
              style={{
                position: "fixed",

                top: layoutMenuCoords.top,

                left: layoutMenuCoords.left,

                width: layoutMenuCoords.width,

                zIndex: 300_000,
              }}
            >
              {WORKFLOW_LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={layoutMode === opt.value}
                  className={`workflow-script-layout-menu__opt${layoutMode === opt.value ? " is-active" : ""}`}
                  onClick={() => {
                    setLayoutMode(opt.value);

                    persistWorkflowLayoutMode(opt.value);

                    setLayoutMenuOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      <WorkflowScriptMiniMapEdges layoutMode={layoutMode} />

      <MiniMap
        className="workflow-script-minimap"
        position="bottom-right"
        style={{ width: 100, height: 58 }}
        pannable
        zoomable
        nodeStrokeWidth={1.2}
        offsetScale={3}
        maskColor="rgba(15, 23, 42, 0.45)"
        maskStrokeColor="rgba(148, 163, 184, 0.5)"
        maskStrokeWidth={1}
        ariaLabel="Workflow mini-map overview"
        nodeComponent={WorkflowScriptMiniMapNode}
        nodeColor={(n) =>
          CATEGORY_MINIMAP_COLOR[
            scriptFlowCategory((n.data as ScriptFlowNodeData).step.kind)
          ]
        }
        nodeStrokeColor="rgba(15, 23, 42, 0.45)"
      />

      <Controls
        showInteractive={false}
        position="bottom-right"
        className="workflow-script-controls-panel"
      />
    </ReactFlow>
  );
}

export function WorkflowScriptFlow(
  props: WorkflowScriptFlowProps,
): ReactElement {
  return (
    <div className="workflow-script-flow-shell">
      <ReactFlowProvider>
        <WorkflowScriptFlowInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
