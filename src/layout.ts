import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";

export interface Point {
  x: number;
  y: number;
}

/** 布局只关心节点的尺寸和是否为最终目标，卡片内容由各端自行渲染。 */
export interface TaskGraphLayoutNode {
  ref: string;
  type: "task" | "summary";
  width: number;
  height: number;
}

export interface TaskGraphLayoutEdge {
  ref: string;
  source: string;
  target: string;
}

/** ELK 计算出的正交走线，并记下布局时两端节点的位置，用来判断走线是否仍然有效。 */
export interface TaskEdgeRoute {
  points: Point[];
  source: Point;
  target: Point;
}

export interface TaskGraphLayout {
  positions: Map<string, Point>;
  routes: Map<string, TaskEdgeRoute>;
}

const elk = new ELK();

// 科技树式布局：任务放在最早可开工的一列，前置链尽量拉直，汇入同一节点的依赖合并成一股。
export const taskGraphLayoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": "44",
  "elk.spacing.edgeNode": "24",
  "elk.spacing.edgeEdge": "14",
  "elk.layered.spacing.nodeNodeBetweenLayers": "108",
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "14",
  "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.layered.nodePlacement.favorStraightEdges": "true",
  "elk.layered.mergeEdges": "true",
  // 以输入顺序作为同列排序的依据，配合 layoutNodeOrder 让同一张图总是得到同一个布局。
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.thoroughness": "30",
  "elk.padding": "[top=36,left=36,bottom=36,right=36]",
};

/** 计算节点左上角坐标与每条连线的走线；最终目标固定在最后一列。 */
export async function computeTaskGraphLayout(
  nodes: readonly TaskGraphLayoutNode[],
  edges: readonly TaskGraphLayoutEdge[],
): Promise<TaskGraphLayout> {
  const orderedNodes = layoutNodeOrder(nodes, edges);
  const rank = new Map(orderedNodes.map((node, index) => [node.ref, index]));
  const orderedEdges = [...edges].sort((a, b) =>
    (rank.get(a.source) ?? 0) - (rank.get(b.source) ?? 0) || (rank.get(a.target) ?? 0) - (rank.get(b.target) ?? 0));
  const graph: ElkNode = {
    id: "task-graph",
    layoutOptions: taskGraphLayoutOptions,
    children: orderedNodes.map((node) => ({
      id: node.ref,
      width: node.width,
      height: node.height,
      ...(node.type === "summary" ? { layoutOptions: { "elk.layered.layering.layerConstraint": "LAST" } } : {}),
    })),
    edges: orderedEdges.map((edge) => ({ id: edge.ref, sources: [edge.source], targets: [edge.target] })),
  };
  const layout = await elk.layout(graph);
  const positions = new Map((layout.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
  const routes = new Map<string, TaskEdgeRoute>();
  for (const edge of layout.edges ?? []) {
    const section = edge.sections?.[0];
    const source = positions.get(edge.sources[0] ?? "");
    const target = positions.get(edge.targets[0] ?? "");
    if (!section || !source || !target) continue;
    routes.set(edge.id, { points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint], source, target });
  }
  return { positions, routes };
}

/**
 * 交给 ELK 的输入顺序只由图结构决定：按依赖的拓扑序，同级按 ref 排序。
 * 这样同一张图无论整理多少次都得到同一个布局；环上的节点排在最后，由 ELK 自行断环。
 */
export function layoutNodeOrder<N extends { ref: string }>(nodes: readonly N[], edges: readonly TaskGraphLayoutEdge[]): N[] {
  const byRef = (a: N, b: N) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
  const incoming = new Map(nodes.map((node) => [node.ref, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!incoming.has(edge.source) || !incoming.has(edge.target)) continue;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const byNodeRef = new Map(nodes.map((node) => [node.ref, node]));
  const ready = nodes.filter((node) => incoming.get(node.ref) === 0).sort(byRef);
  const ordered: N[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    ordered.push(node);
    for (const target of outgoing.get(node.ref) ?? []) {
      const remaining = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, remaining);
      if (remaining === 0) ready.push(byNodeRef.get(target)!);
    }
    ready.sort(byRef);
  }
  const visited = new Set(ordered.map((node) => node.ref));
  return [...ordered, ...nodes.filter((node) => !visited.has(node.ref)).sort(byRef)];
}

/** 正交折线在拐点处用二次曲线倒圆角，半径不超过相邻线段的一半。 */
export function roundedOrthogonalPath(points: readonly Point[], radius = 8): string {
  const [first, ...rest] = points;
  if (!first) return "";
  let path = `M${first.x},${first.y}`;
  rest.forEach((point, index) => {
    const previous = points[index];
    const next = rest[index + 1];
    if (!previous || !next) {
      path += ` L${point.x},${point.y}`;
      return;
    }
    const r = Math.min(radius, Math.hypot(point.x - previous.x, point.y - previous.y) / 2, Math.hypot(next.x - point.x, next.y - point.y) / 2);
    const enter = { x: point.x + Math.sign(previous.x - point.x) * r, y: point.y + Math.sign(previous.y - point.y) * r };
    const exit = { x: point.x + Math.sign(next.x - point.x) * r, y: point.y + Math.sign(next.y - point.y) * r };
    path += ` L${enter.x},${enter.y} Q${point.x},${point.y} ${exit.x},${exit.y}`;
  });
  return path;
}
