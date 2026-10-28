import { jsx as _jsx } from "react/jsx-runtime";
import { BaseEdge, getSmoothStepPath, useInternalNode } from "@xyflow/react";
import { roundedOrthogonalPath } from "./layout.js";
/** 两端节点仍在布局位置时沿 ELK 走线绘制；节点被拖动后走线失效，退回 smoothstep，直到再次整理布局。 */
export function TaskGraphRoutedEdge({ id, source, target, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd, style, interactionWidth, }) {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);
    const route = data?.route;
    const routed = route
        && samePosition(sourceNode?.internals.positionAbsolute, route.source)
        && samePosition(targetNode?.internals.positionAbsolute, route.target);
    const path = routed
        ? roundedOrthogonalPath(route.points)
        : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0];
    return _jsx(BaseEdge, { id: id, path: path, markerEnd: markerEnd, style: style, interactionWidth: interactionWidth });
}
function samePosition(current, expected) {
    return current !== undefined && Math.abs(current.x - expected.x) < 0.5 && Math.abs(current.y - expected.y) < 0.5;
}
//# sourceMappingURL=routed-edge.js.map