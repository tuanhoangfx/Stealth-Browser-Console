import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Handle,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeTypes,
  MarkerType,
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
  useStore,
} from "@xyflow/react";

import {
  ArrowDown,
  Camera,
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

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

import type { ScriptStep, ScriptStepKind } from "../../types";

import {
  layoutWorkflowScriptNodes,
  WORKFLOW_FLOW_NODE_MEASURED,
  type WorkflowLayoutMode,
} from "./workflowScriptDagreLayout";

import { WorkflowScriptBoardFooter } from "./WorkflowScriptBoardFooter";
import { WorkflowScriptStepEdge } from "./WorkflowScriptStepEdge";
import { WORKFLOW_CANVAS_FIT_VIEW, WORKFLOW_CANVAS_MIN_ZOOM } from "./workflowCanvasFit";
import type { ScriptFlowNodeData } from "./workflowScriptFlowTypes";
import { scriptFlowCategory } from "./workflowScriptStepVisual";
import { workflowScriptSmoothStepPathOptions } from "./workflowScriptSmoothStep";

const SCRIPT_FLOW_NODE_TYPE = "workflowScriptStep" as const;

const WORKFLOW_SCRIPT_EDGE_TYPE = "workflowScriptStepEdge" as const;

export type WorkflowScriptFlowProps = {
  /** Stable workflow id — relayout canvas when this changes (no remount). */
  workflowId: string;

  steps: ScriptStep[];

  selectedStepId: string;

  onSelectStep: (id: string) => void;

  onReorderBySortedIds: (ids: string[]) => void;
};

function scriptFlowSubtitle(step: ScriptStep): string {
  const sel = String(step.selector || "").trim();

  const val = String(step.value || "").trim();

  if (sel && val) return `${sel} · ${val}`;

  if (sel) return sel;

  if (val) return val;

  return `${step.timeoutMs ?? 0}ms`;
}

const WORKFLOW_LAYOUT_MODE: WorkflowLayoutMode = "curve_spaced";

function scheduleWorkflowCanvasFit(fitViewFn: ReturnType<typeof useReactFlow>["fitView"]): void {
  const run = () => void fitViewFn(WORKFLOW_CANVAS_FIT_VIEW);
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
  window.setTimeout(run, 48);
}

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
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: NodeProps<Node<ScriptFlowNodeData, typeof SCRIPT_FLOW_NODE_TYPE>>) {
  const cat = scriptFlowCategory(data.step.kind);

  const Icon = STEP_ICONS[data.step.kind] ?? CircleDot;

  return (
    <>
      <Handle
        type="target"
        position={targetPosition}
        className="workflow-script-handle workflow-script-handle--tgt"
      />

      <div
        className={`workflow-script-node workflow-script-node--${cat}${selected ? " is-selected" : ""}${data.step.enabled ? "" : " is-disabled"}`}
      >
        <div className="workflow-script-node__orb">
          <Icon size={12} aria-hidden strokeWidth={1.95} />
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
        position={sourcePosition}
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

    measured: {
      width: WORKFLOW_FLOW_NODE_MEASURED.width,
      height: WORKFLOW_FLOW_NODE_MEASURED.height,
    },

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
  workflowId,
  steps,

  selectedStepId,

  onSelectStep,

  onReorderBySortedIds,
}: WorkflowScriptFlowProps): ReactElement {
  const reactFlow = useReactFlow();
  const { fitView, getNodes } = reactFlow;
  const updateNodeInternals = (
    reactFlow as unknown as { updateNodeInternals?: (nodeId: string) => void }
  ).updateNodeInternals;
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;
  const flowMountedRef = useRef(true);

  useEffect(() => {
    flowMountedRef.current = true;
    return () => {
      flowMountedRef.current = false;
    };
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<
    Node<ScriptFlowNodeData>
  >([]);

  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const layoutMode = WORKFLOW_LAYOUT_MODE;

  const structuralKey = steps.map((s) => s.id).join("|");

  const lastRelayoutSig = useRef<string>("");
  const fitFrameRef = useRef<number | null>(null);

  const flowWidth = useStore((state) => state.width);
  const flowHeight = useStore((state) => state.height);

  useEffect(() => {
    if (!nodes.length || flowWidth <= 0 || flowHeight <= 0) return;
    if (fitFrameRef.current != null) cancelAnimationFrame(fitFrameRef.current);
    fitFrameRef.current = requestAnimationFrame(() => {
      fitFrameRef.current = null;
      scheduleWorkflowCanvasFit(fitViewRef.current);
    });
  }, [nodes.length, workflowId, layoutMode, flowWidth, flowHeight]);

  useEffect(() => {
    return () => {
      if (fitFrameRef.current != null) cancelAnimationFrame(fitFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const nextEdges = buildEdges(steps, layoutMode);
    setEdges((prev) => (edgesSignature(prev) === edgesSignature(nextEdges) ? prev : nextEdges));

    const relayoutSig = `${workflowId}|${structuralKey}|${layoutMode}`;
    const shouldRelayoutPositions = lastRelayoutSig.current !== relayoutSig;

    if (shouldRelayoutPositions) {
      lastRelayoutSig.current = relayoutSig;
      const skeleton = buildSkeletonNodes(steps, selectedStepId);
      const layouted = layoutWorkflowScriptNodes(skeleton, nextEdges, layoutMode);
      setNodes(layouted);
      if (fitFrameRef.current != null) cancelAnimationFrame(fitFrameRef.current);
      fitFrameRef.current = requestAnimationFrame(() => {
        fitFrameRef.current = null;
        scheduleWorkflowCanvasFit(fitViewRef.current);
      });
      return;
    }

    setNodes((prev) => {
      if (prev.length !== steps.length) {
        const skeleton = buildSkeletonNodes(steps, selectedStepId);
        return layoutWorkflowScriptNodes(skeleton, nextEdges, layoutMode);
      }
      const merged = mergeNodeStepData(prev, steps, selectedStepId);
      if (!merged) {
        const skeleton = buildSkeletonNodes(steps, selectedStepId);
        return layoutWorkflowScriptNodes(skeleton, nextEdges, layoutMode);
      }
      if (nodesVisualSignature(prev) === nodesVisualSignature(merged)) return prev;
      return merged;
    });
  }, [workflowId, steps, structuralKey, selectedStepId, layoutMode]);

  useLayoutEffect(() => {
    if (!nodes.length || typeof updateNodeInternals !== "function") return;
    if (flowWidth <= 0 || flowHeight <= 0) return;
    const frame = requestAnimationFrame(() => {
      if (!flowMountedRef.current) return;
      for (const node of nodes) {
        updateNodeInternals(node.id);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [nodes, structuralKey, updateNodeInternals, flowWidth, flowHeight]);

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
        maxZoom: WORKFLOW_CANVAS_FIT_VIEW.maxZoom,
      }}
      defaultEdgeOptions={
        {
          type: WORKFLOW_SCRIPT_EDGE_TYPE,
          pathOptions: workflowScriptSmoothStepPathOptions(layoutMode),
          className: "workflow-script-edge",
          interactionWidth: 26,
          style: {
            strokeWidth: 1.65,
            stroke: "rgba(167, 139, 250, 0.78)",
            strokeLinecap: "round",
            strokeLinejoin: "round",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: "rgb(196, 181, 253)",
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

      <Panel position="top-right" className="workflow-script-flow-panel-toolbar">
        <div className="workflow-script-layout-picker workflow-script-layout-picker--locked">
          <LayoutGrid size={14} className="workflow-script-layout-picker-icon" aria-hidden />
          <span className="workflow-script-layout-picker-label">Layout</span>
          <span className="workflow-script-layout-trigger-value">Spaced flow · V5</span>
        </div>
      </Panel>
    </ReactFlow>
  );
}

export function WorkflowScriptFlow(
  props: WorkflowScriptFlowProps,
): ReactElement {
  const [canvasHintOpen, setCanvasHintOpen] = useState(false);

  return (
    <div className="workflow-script-flow-shell workflow-script-flow-shell--with-footer">
      <ReactFlowProvider>
        <div className="workflow-script-flow-canvas">
          <WorkflowScriptFlowInner {...props} />
        </div>
        <WorkflowScriptBoardFooter
          layoutMode={WORKFLOW_LAYOUT_MODE}
          hintOpen={canvasHintOpen}
          onToggleHint={() => setCanvasHintOpen((value) => !value)}
        />
      </ReactFlowProvider>
    </div>
  );
}
