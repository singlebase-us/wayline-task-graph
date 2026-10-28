import { type Edge, type EdgeProps } from "@xyflow/react";
import { type TaskEdgeRoute } from "./layout.js";
export type RoutedEdgeData = {
    route?: TaskEdgeRoute;
};
/**
 * 两端节点仍在布局位置时沿 ELK 走线绘制；节点被拖动后按与自动布局一致的规则改道（见 adaptEdgeRoute），
 * 只有端点在动的连线会重新计算，其余连线保持不动；无路可走（如节点互相重叠）时退回 smoothstep。
 */
export declare function TaskGraphRoutedEdge({ id, source, target, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd, style, interactionWidth, }: EdgeProps<Edge<RoutedEdgeData>>): import("react").JSX.Element;
//# sourceMappingURL=routed-edge.d.ts.map