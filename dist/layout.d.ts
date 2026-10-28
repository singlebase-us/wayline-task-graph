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
export declare const taskGraphLayoutOptions: {
    "elk.algorithm": string;
    "elk.direction": string;
    "elk.edgeRouting": string;
    "elk.spacing.nodeNode": string;
    "elk.spacing.edgeNode": string;
    "elk.spacing.edgeEdge": string;
    "elk.layered.spacing.nodeNodeBetweenLayers": string;
    "elk.layered.spacing.edgeNodeBetweenLayers": string;
    "elk.layered.spacing.edgeEdgeBetweenLayers": string;
    "elk.layered.layering.strategy": string;
    "elk.layered.nodePlacement.strategy": string;
    "elk.layered.nodePlacement.bk.fixedAlignment": string;
    "elk.layered.nodePlacement.favorStraightEdges": string;
    "elk.layered.mergeEdges": string;
    "elk.layered.considerModelOrder.strategy": string;
    "elk.layered.thoroughness": string;
    "elk.padding": string;
};
/** 计算节点左上角坐标与每条连线的走线；最终目标固定在最后一列。 */
export declare function computeTaskGraphLayout(nodes: readonly TaskGraphLayoutNode[], edges: readonly TaskGraphLayoutEdge[]): Promise<TaskGraphLayout>;
/**
 * 交给 ELK 的输入顺序只由图结构决定：按依赖的拓扑序，同级按 ref 排序。
 * 这样同一张图无论整理多少次都得到同一个布局；环上的节点排在最后，由 ELK 自行断环。
 */
export declare function layoutNodeOrder<N extends {
    ref: string;
}>(nodes: readonly N[], edges: readonly TaskGraphLayoutEdge[]): N[];
/** 正交折线在拐点处用二次曲线倒圆角，半径不超过相邻线段的一半。 */
export declare function roundedOrthogonalPath(points: readonly Point[], radius?: number): string;
//# sourceMappingURL=layout.d.ts.map