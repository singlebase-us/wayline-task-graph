import { type Edge, type EdgeProps } from "@xyflow/react";
import { type TaskEdgeRoute } from "./layout.js";
export type RoutedEdgeData = {
    route?: TaskEdgeRoute;
};
/** 两端节点仍在布局位置时沿 ELK 走线绘制；节点被拖动后走线失效，退回 smoothstep，直到再次整理布局。 */
export declare function TaskGraphRoutedEdge({ id, source, target, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd, style, interactionWidth, }: EdgeProps<Edge<RoutedEdgeData>>): import("react").JSX.Element;
//# sourceMappingURL=routed-edge.d.ts.map