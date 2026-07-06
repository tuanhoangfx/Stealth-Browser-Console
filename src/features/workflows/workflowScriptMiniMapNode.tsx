import { memo, type ReactElement } from "react";
import type { MouseEvent as ReactMouseEvent, CSSProperties } from "react";

type WorkflowMiniMapNodeProps = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  className?: string;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  borderRadius?: number;
  style?: CSSProperties;
  shapeRendering?: string;
  onClick?: (event: ReactMouseEvent<Element>, nodeId: string) => void;
};

/** Compact circular dots inside the rectangular mini-map viewport. */
export const WorkflowScriptMiniMapNode = memo(function WorkflowScriptMiniMapNode({
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
