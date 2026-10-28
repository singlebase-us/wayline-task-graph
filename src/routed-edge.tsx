import { BaseEdge, getSmoothStepPath, useInternalNode, type Edge, type EdgeProps } from "@xyflow/react";
import { roundedOrthogonalPath, type Point, type TaskEdgeRoute } from "./layout.js";

export type RoutedEdgeData = { route?: TaskEdgeRoute };

/** 两端节点仍在布局位置时沿 ELK 走线绘制；节点被拖动后走线失效，退回 smoothstep，直到再次整理布局。 */
export function TaskGraphRoutedEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps<Edge<RoutedEdgeData>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const route = data?.route;
  const routed = route
    && samePosition(sourceNode?.internals.positionAbsolute, route.source)
    && samePosition(targetNode?.internals.positionAbsolute, route.target);
  const path = routed
    ? roundedOrthogonalPath(route.points)
    : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0];
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />;
}

function samePosition(current: Point | undefined, expected: Point): boolean {
  return current !== undefined && Math.abs(current.x - expected.x) < 0.5 && Math.abs(current.y - expected.y) < 0.5;
}
