import { BaseEdge, getSmoothStepPath, useInternalNode, useStoreApi, type Edge, type EdgeProps, type InternalNode } from "@xyflow/react";
import { useLayoutEffect } from "react";
import { roundedOrthogonalPath, type Point, type TaskEdgeRoute } from "./layout.js";
import { adaptEdgeRoute, type Rect, type RoutingScene } from "./reroute.js";

export type RoutedEdgeData = { route?: TaskEdgeRoute };

// 每张画布上各连线当前画出的折线，供其他连线改道时并入或避让。
const drawnPaths = new WeakMap<object, Map<string, Point[]>>();

/**
 * 两端节点仍在布局位置时沿 ELK 走线绘制；节点被拖动后按与自动布局一致的规则改道（见 adaptEdgeRoute），
 * 只有端点在动的连线会重新计算，其余连线保持不动；无路可走（如节点互相重叠）时退回 smoothstep。
 */
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
  const store = useStoreApi();
  // 订阅两端节点，端点移动时重新渲染；其他节点与连线只在此时读取一次。
  useInternalNode(source);
  useInternalNode(target);
  const paths = drawnPaths.get(store) ?? new Map<string, Point[]>();
  drawnPaths.set(store, paths);
  const state = store.getState();
  const scene: RoutingScene = {
    nodes: nodeRects(state.nodeLookup.values()),
    edges: state.edges.map((edge) => ({
      ref: edge.id,
      source: edge.source,
      target: edge.target,
      route: (edge.data as RoutedEdgeData | undefined)?.route,
      points: paths.get(edge.id),
    })),
  };
  const points = adaptEdgeRoute(
    { ref: id, source, target, route: data?.route },
    scene,
    { start: { x: sourceX, y: sourceY }, end: { x: targetX, y: targetY } },
  );
  useLayoutEffect(() => {
    if (points) paths.set(id, points);
    else paths.delete(id);
    return () => { paths.delete(id); };
  }, [id, paths, points]);
  const path = points
    ? roundedOrthogonalPath(points)
    : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0];
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />;
}

function nodeRects(nodes: Iterable<InternalNode>): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const node of nodes) {
    if (node.hidden) continue;
    const width = node.measured.width ?? node.width ?? 0;
    const height = node.measured.height ?? node.height ?? 0;
    if (width > 0 && height > 0) rects.set(node.id, { ...node.internals.positionAbsolute, width, height });
  }
  return rects;
}
