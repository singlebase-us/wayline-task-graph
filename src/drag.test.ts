import { describe, expect, it } from "vitest";
import { getSmoothStepPath, Position } from "@xyflow/react";
import { computeTaskGraphLayout, type Point, type TaskGraphLayout, type TaskGraphLayoutEdge, type TaskGraphLayoutNode } from "./layout.js";
import { adaptEdgeRoute, crossesAny, overlapsAny, type Rect, type RoutingScene } from "./reroute.js";
import { deliveryPlan, fanInPlan, graphOf, latticePlan, skipChainPlan, smallPlan, type Plan } from "./plans.fixture.js";

/**
 * 拖动场景测试：对每张样例图的每个节点做小、中、大幅度拖动以及连续拖动，检查改道后的连线。
 * “畅通”指被拖节点外扩布局间距后不与其他节点相交，此时一定能找到绕开所有节点的走线。
 */
const fixtures: Array<[string, Plan, string[]]> = [
  ["delivery plan", deliveryPlan, ["G1"]],
  ["small editor graph", smallPlan, ["G", "H"]],
  ["fan-in", fanInPlan, ["N"]],
  ["skip chain", skipChainPlan, ["S6", "T3"]],
  ["lattice", latticePlan, ["L30", "L31", "L32"]],
];

const offsets = {
  small: [{ x: 0, y: 12 }, { x: 0, y: -12 }, { x: 15, y: 0 }, { x: -15, y: 0 }, { x: 10, y: 10 }],
  medium: [{ x: 0, y: 60 }, { x: 0, y: -60 }, { x: 40, y: 40 }, { x: -40, y: -40 }],
  large: [{ x: 0, y: 250 }, { x: 0, y: -250 }, { x: 300, y: 0 }, { x: -300, y: 0 }, { x: -500, y: -200 }, { x: 400, y: 300 }],
};

const edgeNodeSpacing = 24;

interface Laid extends TaskGraphLayout {
  nodes: TaskGraphLayoutNode[];
  edges: TaskGraphLayoutEdge[];
}

async function laidOut(plan: Plan, summaryFrom: string[]): Promise<Laid> {
  const { nodes, edges } = graphOf(plan, summaryFrom);
  return { nodes, edges, ...(await computeTaskGraphLayout(nodes, edges)) };
}

/** 把 moved 节点挪动 offset 后的画布；drawn 为各连线上一帧画出的折线。 */
function sceneOf(laid: Laid, moved: string, offset: Point, drawn = new Map<string, Point[] | null>()): RoutingScene {
  return {
    nodes: new Map(laid.nodes.map((node) => {
      const at = laid.positions.get(node.ref)!;
      const position = node.ref === moved ? { x: at.x + offset.x, y: at.y + offset.y } : at;
      return [node.ref, { ...position, width: node.width, height: node.height }];
    })),
    edges: laid.edges.map((edge) => ({ ...edge, route: laid.routes.get(edge.ref), points: drawn.get(edge.ref) ?? undefined })),
  };
}

function isClear(scene: RoutingScene, moved: string): boolean {
  const box = scene.nodes.get(moved)!;
  return [...scene.nodes].every(([ref, other]) => ref === moved
    || box.x - edgeNodeSpacing >= other.x + other.width || other.x - edgeNodeSpacing >= box.x + box.width
    || box.y - edgeNodeSpacing >= other.y + other.height || other.y - edgeNodeSpacing >= box.y + box.height);
}

const verticalXs = (points: readonly Point[]) => points.slice(1).flatMap((point, index) => (point.x === points[index]!.x && point.y !== points[index]!.y ? [point.x] : []));

/** 与本连线无关、且布局时也没有与它并在同一条线上的连线：改道后不应压到它们上面。 */
function unrelatedRoutes(laid: Laid, edge: TaskGraphLayoutEdge, moved: string): Point[][] {
  const own = laid.routes.get(edge.ref)!.points;
  return laid.edges
    .filter((other) => other.source !== edge.source && other.target !== edge.target && other.source !== moved && other.target !== moved)
    .map((other) => laid.routes.get(other.ref)!.points)
    .filter((points) => !overlapsAny(points, [own], 0));
}

function expectWellFormed(points: Point[], source: Rect, target: Rect, obstacles: Rect[]) {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  expect(first.x).toBeCloseTo(source.x + source.width);
  expect(first.y).toBeGreaterThan(source.y);
  expect(first.y).toBeLessThan(source.y + source.height);
  expect(last.x).toBeCloseTo(target.x);
  expect(last.y).toBeGreaterThan(target.y);
  expect(last.y).toBeLessThan(target.y + target.height);
  expect(points[1]!.x).toBeGreaterThan(first.x);
  expect(points[points.length - 2]!.x).toBeLessThan(last.x);
  expect(points.slice(1).every((point, index) => point.x === points[index]!.x || point.y === points[index]!.y)).toBe(true);
  expect(crossesAny(points, obstacles)).toBe(false);
}

/** 两条折线之间的最大偏离（对称 Hausdorff 距离，按 4px 采样）。拐点一一对应时取对应点距离的最大值作为上界。 */
function deviation(a: Point[], b: Point[]): number {
  if (a.length === b.length) {
    const bound = Math.max(...a.map((point, index) => Math.hypot(point.x - b[index]!.x, point.y - b[index]!.y)));
    if (bound <= 16) return bound;
  }
  const sample = (points: Point[]) => points.slice(1).flatMap((point, index) => {
    const from = points[index]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / 4));
    return Array.from({ length: steps + 1 }, (_, step) => ({ x: from.x + (point.x - from.x) * step / steps, y: from.y + (point.y - from.y) * step / steps }));
  });
  const distance = (point: Point, from: Point, to: Point) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
  };
  const oneWay = (from: Point[], to: Point[]) => Math.max(...sample(from).map((point) => Math.min(...to.slice(1).map((end, index) => distance(point, to[index]!, end)))));
  return Math.max(oneWay(a, b), oneWay(b, a));
}

function smoothStepPoints(start: Point, end: Point): Point[] {
  const [path] = getSmoothStepPath({ sourceX: start.x, sourceY: start.y, sourcePosition: Position.Right, targetX: end.x, targetY: end.y, targetPosition: Position.Left });
  return [...path.matchAll(/[MLQ]\s*([-\d.]+)[ ,]([-\d.]+)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
}

describe.each(fixtures)("dragging a node in the %s", (_, plan, summaryFrom) => {
  it.each(Object.entries(offsets))("keeps every attached edge clear of all nodes on a %s drag", async (_kind, list) => {
    const laid = await laidOut(plan, summaryFrom);
    for (const moved of laid.nodes) {
      for (const offset of list) {
        const scene = sceneOf(laid, moved.ref, offset);
        if (!isClear(scene, moved.ref)) continue;
        for (const edge of scene.edges) {
          const points = adaptEdgeRoute(edge, scene);
          if (edge.source !== moved.ref && edge.target !== moved.ref) {
            expect(points).toBe(edge.route!.points);
            continue;
          }
          expect(points, `${edge.ref} after moving ${moved.ref} by ${JSON.stringify(offset)}`).not.toBeNull();
          expectWellFormed(points!, scene.nodes.get(edge.source)!, scene.nodes.get(edge.target)!, [...scene.nodes.values()]);
        }
      }
    }
  });

  it("keeps the layout channels and adds no overlaps on a small drag", async () => {
    const laid = await laidOut(plan, summaryFrom);
    for (const moved of laid.nodes) {
      for (const offset of offsets.small) {
        const scene = sceneOf(laid, moved.ref, offset);
        for (const edge of laid.edges) {
          if (edge.source !== moved.ref && edge.target !== moved.ref) continue;
          const route = laid.routes.get(edge.ref)!;
          const points = adaptEdgeRoute(scene.edges.find((item) => item.ref === edge.ref)!, scene)!;
          const label = `${edge.ref} after moving ${moved.ref} by ${JSON.stringify(offset)}`;
          expect(verticalXs(points), label).toEqual(expect.arrayContaining(verticalXs(route.points.length > 2 ? route.points : [])));
          expect(overlapsAny(points, unrelatedRoutes(laid, edge, moved.ref)), label).toBe(false);
        }
      }
    }
  });

  it("changes shape continuously while a node is dragged across a clear canvas", async () => {
    const laid = await laidOut(plan, summaryFrom);
    let frames = 0;
    let jumps = 0;
    for (const moved of laid.nodes) {
      for (const direction of [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: 0, y: 1 }]) {
        const drawn = new Map<string, Point[] | null>();
        let wasClear = false;
        for (let frame = 1; frame <= 75; frame += 1) {
          // 浏览器里画布有缩放，拖动坐标总带小数，步长也取小数以覆盖浮点误差。
          const scene = sceneOf(laid, moved.ref, { x: direction.x * 4.137 * frame, y: direction.y * 4.137 * frame }, drawn);
          const clear = isClear(scene, moved.ref);
          for (const edge of scene.edges) {
            if (edge.source !== moved.ref && edge.target !== moved.ref) continue;
            const points = adaptEdgeRoute(edge, scene);
            const before = drawn.get(edge.ref);
            if (clear) expect(points, `${edge.ref} while moving ${moved.ref}`).not.toBeNull();
            if (clear && wasClear && before && points) {
              frames += 1;
              // 每帧移动约 4px，除拖动本身外不应有明显跳变。
              if (deviation(before, points) > 16) jumps += 1;
            }
            drawn.set(edge.ref, points);
          }
          wasClear = clear;
        }
      }
    }
    expect(frames).toBeGreaterThan(0);
    expect(jumps / frames).toBeLessThan(0.01);
  }, 30_000);
});

describe("compared with smoothstep", () => {
  it("never runs an edge through a node where smoothstep would", async () => {
    let smoothStepCrossings = 0;
    for (const [, plan, summaryFrom] of fixtures) {
      const laid = await laidOut(plan, summaryFrom);
      for (const moved of laid.nodes) {
        for (const offset of [...offsets.medium, ...offsets.large]) {
          const scene = sceneOf(laid, moved.ref, offset);
          if (!isClear(scene, moved.ref)) continue;
          const obstacles = [...scene.nodes.values()];
          for (const edge of scene.edges) {
            if (edge.source !== moved.ref && edge.target !== moved.ref) continue;
            const points = adaptEdgeRoute(edge, scene)!;
            if (crossesAny(smoothStepPoints(points[0]!, points[points.length - 1]!), obstacles)) smoothStepCrossings += 1;
            expect(crossesAny(points, obstacles)).toBe(false);
          }
        }
      }
    }
    expect(smoothStepCrossings).toBeGreaterThan(100);
  });
});
