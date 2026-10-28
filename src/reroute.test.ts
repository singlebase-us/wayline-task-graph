import { describe, expect, it } from "vitest";
import { adaptEdgeRoute, crossesAny, followRoute, overlapsAny, routeAroundObstacles, type Rect, type RoutingScene } from "./reroute.js";
import type { Point, TaskEdgeRoute } from "./layout.js";

const box = (x: number, y: number, width = 100, height = 60): Rect => ({ x, y, width, height });
const isOrthogonal = (points: Point[]) => points.every((point, index) => index === 0 || point.x === points[index - 1]!.x || point.y === points[index - 1]!.y);

/** 布局时：源节点 (0,0)、目标节点 (300,100)，走线在 x=150 的通道里竖直转向。 */
const channelRoute: TaskEdgeRoute = {
  points: [{ x: 100, y: 30 }, { x: 150, y: 30 }, { x: 150, y: 130 }, { x: 300, y: 130 }],
  source: { x: 0, y: 0 },
  target: { x: 300, y: 100 },
};

describe("followRoute", () => {
  it("moves only the dragged end and keeps the channel in place", () => {
    const points = followRoute(channelRoute, { x: 0, y: 40 }, channelRoute.target, [box(0, 40), box(300, 100)]);

    expect(points).toEqual([{ x: 100, y: 70 }, { x: 150, y: 70 }, { x: 150, y: 130 }, { x: 300, y: 130 }]);
  });

  it("adds a jog in the middle when a straight route's ends no longer line up", () => {
    const straight: TaskEdgeRoute = { points: [{ x: 100, y: 30 }, { x: 300, y: 30 }], source: { x: 0, y: 0 }, target: { x: 300, y: 0 } };

    expect(followRoute(straight, straight.source, { x: 300, y: 50 }, [])).toEqual([
      { x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 80 }, { x: 300, y: 80 },
    ]);
  });

  it("prefers a given jog position, such as a sibling's trunk, over the midpoint", () => {
    const straight: TaskEdgeRoute = { points: [{ x: 100, y: 30 }, { x: 300, y: 30 }], source: { x: 0, y: 0 }, target: { x: 300, y: 0 } };

    expect(followRoute(straight, straight.source, { x: 300, y: 50 }, [], { jogCandidates: [260] })?.[1]).toEqual({ x: 260, y: 30 });
  });

  it("keeps the channel until the node comes close, then pushes it along instead of collapsing the stub", () => {
    expect(followRoute(channelRoute, { x: 40, y: 0 }, channelRoute.target, [])?.[1]).toEqual({ x: 150, y: 30 });
    expect(followRoute(channelRoute, { x: 80, y: 0 }, channelRoute.target, [])?.[1]).toEqual({ x: 188, y: 30 });
  });

  it("gives up when the dragged node passes the target", () => {
    expect(followRoute(channelRoute, { x: 250, y: 0 }, channelRoute.target, [])).toBeNull();
  });

  it("gives up when the moved route runs through another node", () => {
    expect(followRoute(channelRoute, { x: 0, y: 40 }, channelRoute.target, [box(120, 60, 60, 40)])).toBeNull();
  });

  it("gives up when the moved route would lie on top of another edge", () => {
    const other = [{ x: 150, y: 140 }, { x: 150, y: 200 }];

    expect(followRoute(channelRoute, { x: 0, y: 150 }, channelRoute.target, [], { others: [other] })).toBeNull();
  });
});

describe("routeAroundObstacles", () => {
  it("draws a straight line when nothing is in the way", () => {
    expect(routeAroundObstacles({ x: 100, y: 30 }, { x: 400, y: 30 }, [box(0, 0), box(400, 0)])).toEqual([
      { x: 100, y: 30 }, { x: 400, y: 30 },
    ]);
  });

  it("goes around a node standing between the endpoints", () => {
    const nodes = [box(0, 0), box(200, 0), box(400, 0)];
    const points = routeAroundObstacles({ x: 100, y: 30 }, { x: 400, y: 30 }, nodes)!;

    expect(crossesAny(points, nodes)).toBe(false);
    expect(points[0]).toEqual({ x: 100, y: 30 });
    expect(points[points.length - 1]).toEqual({ x: 400, y: 30 });
    expect(points[1]!.x).toBeGreaterThan(100);
    expect(points[points.length - 2]!.x).toBeLessThan(400);
  });

  it("keeps the layout's edge-node spacing from the nodes it passes", () => {
    const nodes = [box(0, 0), box(200, 0), box(400, 0)];
    const points = routeAroundObstacles({ x: 100, y: 30 }, { x: 400, y: 30 }, nodes)!;

    expect(crossesAny(points.slice(1, -1), nodes.map((node) => ({ x: node.x - 23, y: node.y - 23, width: node.width + 46, height: node.height + 46 })))).toBe(false);
  });

  it("loops back around both nodes when the target sits left of the source", () => {
    const nodes = [box(300, 0), box(0, 0)];
    const points = routeAroundObstacles({ x: 400, y: 30 }, { x: 0, y: 30 }, nodes)!;

    expect(crossesAny(points, nodes)).toBe(false);
    expect(isOrthogonal(points)).toBe(true);
  });

  it("joins a sibling's trunk instead of drawing a parallel line next to it", () => {
    const sibling = [{ x: 160, y: 200 }, { x: 160, y: 30 }, { x: 400, y: 30 }];
    const points = routeAroundObstacles({ x: 100, y: 130 }, { x: 400, y: 30 }, [box(0, 100), box(400, 0)], { siblings: [sibling] })!;

    expect(points).toContainEqual({ x: 160, y: 30 });
  });

  it("does not lie on top of an unrelated edge when another way exists", () => {
    const other = [{ x: 150, y: 30 }, { x: 350, y: 30 }];
    const points = routeAroundObstacles({ x: 100, y: 30 }, { x: 400, y: 30 }, [box(0, 0), box(400, 0)], { others: [other] })!;

    expect(overlapsAny(points, [other])).toBe(false);
  });

  it("stays on the side it took in the previous frame when both sides cost the same", () => {
    const nodes = [box(0, 0), box(200, 0), box(400, 0)];
    const above = routeAroundObstacles({ x: 100, y: 30 }, { x: 400, y: 30 }, nodes)!;
    const below = above.map((point) => ({ x: point.x, y: 60 - point.y }));

    expect(routeAroundObstacles({ x: 100, y: 30 }, { x: 400, y: 30 }, nodes, { previous: [above] })).toEqual(above);
    expect(routeAroundObstacles({ x: 100, y: 30 }, { x: 400, y: 30 }, nodes, { previous: [below] })).toEqual(below);
  });

  it("still finds a way when the endpoints sit on a node's spacing boundary up to a rounding error", () => {
    // 拖动后的坐标带小数：把布局时的端点 1476 平移到 905.0239726027397，按 1476 + x - 1476 算出来是 905.0239726027398。
    const target = box(905.0239726027397, -139.31164383561645, 252, 150);
    const end = { x: 1476 + target.x - 1476, y: -64.31164383561645 };

    expect(routeAroundObstacles({ x: 1368, y: 208 }, end, [box(1116, 133, 252, 150), target, box(756, 36, 252, 150)])).not.toBeNull();
  });

  it("returns null when the start is buried under another node", () => {
    expect(routeAroundObstacles({ x: 100, y: 30 }, { x: 400, y: 30 }, [box(0, 0), box(90, 0), box(400, 0)])).toBeNull();
  });
});

describe("adaptEdgeRoute", () => {
  const scene = (sourceAt: Point): RoutingScene => ({
    nodes: new Map([["a", box(sourceAt.x, sourceAt.y)], ["b", box(300, 100)], ["c", box(0, 200)]]),
    edges: [
      { ref: "ab", source: "a", target: "b", route: channelRoute },
      {
        ref: "cb",
        source: "c",
        target: "b",
        route: { points: [{ x: 100, y: 230 }, { x: 150, y: 230 }, { x: 150, y: 130 }, { x: 300, y: 130 }], source: { x: 0, y: 200 }, target: { x: 300, y: 100 } },
      },
    ],
  });

  it("draws the layout route while both endpoints stay put", () => {
    const current = scene({ x: 0, y: 0 });

    expect(adaptEdgeRoute(current.edges[0]!, current)).toBe(channelRoute.points);
  });

  it("keeps sharing the merged trunk with its sibling after a small drag", () => {
    const current = scene({ x: 0, y: 10 });

    expect(adaptEdgeRoute(current.edges[0]!, current)).toEqual([{ x: 100, y: 40 }, { x: 150, y: 40 }, { x: 150, y: 130 }, { x: 300, y: 130 }]);
  });

  it("routes an edge without a layout route between its ports", () => {
    const current = scene({ x: 0, y: 0 });
    const points = adaptEdgeRoute({ ref: "ac", source: "a", target: "c" }, current, { start: { x: 100, y: 30 }, end: { x: 0, y: 230 } })!;

    expect(points[0]).toEqual({ x: 100, y: 30 });
    expect(points[points.length - 1]).toEqual({ x: 0, y: 230 });
    expect(crossesAny(points, [...current.nodes.values()])).toBe(false);
  });
});
