import { type Point, type TaskEdgeRoute } from "./layout.js";
/** 节点在画布上占据的矩形，左上角坐标加尺寸。 */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** 改道时参考的一条连线：布局时的走线，以及当前实际画出的折线（已知时）。 */
export interface RoutingEdge {
    ref: string;
    source: string;
    target: string;
    route?: TaskEdgeRoute;
    points?: readonly Point[];
}
/** 画布此刻的状态：节点按 ref 给出当前矩形，连线给出布局走线和当前折线。 */
export interface RoutingScene {
    nodes: ReadonlyMap<string, Rect>;
    edges: readonly RoutingEdge[];
}
export interface RoutingHints {
    /** 同源或同目标连线在共用节点一侧的走线；沿它们走很便宜，于是像布局时一样合成一股。 */
    siblings?: readonly (readonly Point[])[];
    /** 其他连线：不与它们重叠，尽量少与它们交叉。 */
    others?: readonly (readonly Point[])[];
    /** 本连线上一帧画出的折线与布局走线：沿它们走略便宜，改道后尽量贴近原来的位置，拖动中也不在两条路之间来回跳。 */
    previous?: readonly (readonly Point[])[];
    /** 与节点保持的距离，默认取布局的 edgeNode 间距。 */
    margin?: number;
}
/**
 * 求一条连线此刻应画的折线，规则尽量与自动布局一致：
 * 1. 两端节点都还在布局位置时，原样使用 ELK 走线；
 * 2. 否则先沿用原走线，只挪动被拖一端的首段或末段，中间通道不动；需要补竖线时优先落在兄弟连线的汇合竖线上；
 * 3. 挪动后穿过节点或压在其他连线上时，绕开所有节点重新寻路：与节点保持布局间距、并入兄弟连线、避开其他连线、少拐弯，
 *    并优先沿上一帧画出的折线（edge.points）走，拖动中不在两条路之间来回跳；节点靠近时按间距把走线推开，形状连续变化；
 * 4. 仍然无路可走（如节点互相重叠）时返回 null，由调用方退回直连样式。
 * 与本连线共用端点且也在移动的连线位置还在变化，不作参考；其余连线一律视为固定。
 */
export declare function adaptEdgeRoute(edge: RoutingEdge, scene: RoutingScene, ports?: {
    start: Point;
    end: Point;
}): Point[] | null;
/**
 * 端点被拖动后尽量沿用原走线：只平移被拖动一端的首段或末段并带动相邻拐点，中间的走线通道保持不动。
 * 原本是直线、两端错开后需要补一段竖线时，依次尝试 jogCandidates 中的位置（通常是兄弟连线的汇合竖线），最后才取中点。
 * 结果不再是从右侧出、从左侧进的正交折线，穿过任何节点（包括两端节点自身），或与 others 中的连线重叠时返回 null。
 */
export declare function followRoute(route: TaskEdgeRoute, source: Point, target: Point, obstacles: readonly Rect[], options?: FollowOptions): Point[] | null;
interface FollowOptions {
    others?: readonly (readonly Point[])[];
    jogCandidates?: readonly number[];
}
/**
 * 在节点之间找一条正交走线：从起点向右出发、向右进入终点，绕开所有节点并与其保持间距。
 * 候选网格取自外扩后的节点边界、已有连线所在的坐标以及相邻坐标之间的中线，走线因此落在通道中央或与已有连线对齐；
 * 在网格上按“长度 × 系数 + 拐弯 + 交叉”做 A* 搜索。起点或终点被节点占住、无路可走时返回 null。
 */
export declare function routeAroundObstacles(start: Point, end: Point, obstacles: readonly Rect[], hints?: RoutingHints): Point[] | null;
/** 折线是否有任何一段穿过某个矩形内部；只擦过边缘不算。 */
export declare function crossesAny(points: readonly Point[], obstacles: readonly Rect[]): boolean;
/**
 * 折线是否有一段与其他连线共线重叠（不同连线压在同一条线上，分不清走向）。
 * minLength 为重叠至少要多长才算；取 0 时首尾相接也算，用来识别 ELK 并在同一条线上的连线。
 */
export declare function overlapsAny(points: readonly Point[], lines: readonly (readonly Point[])[], minLength?: number): boolean;
export {};
//# sourceMappingURL=reroute.d.ts.map