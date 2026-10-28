import { describe, expect, it } from "vitest";
import {
  computeTaskGraphLayout,
  layoutNodeOrder,
  roundedOrthogonalPath,
  type TaskGraphLayoutEdge,
  type TaskGraphLayoutNode,
} from "./layout.js";

/** 27 节点的交付计划样例：多条并行分支、跨多列的长依赖，最终汇入交付目标。 */
const deliveryPlan: Array<[string, string[]]> = [
  ["A1", []], ["A2", []], ["A3", []],
  ["B1", ["A1", "A2"]], ["B2", ["B1"]], ["B3", ["A1", "A3"]], ["B4", ["B3"]], ["B5", ["A3"]],
  ["C1", ["B3"]], ["C2", ["C1", "B5"]], ["C3", ["C1", "B4"]], ["C4", ["C3", "B5"]], ["C5", ["C2"]], ["C6", ["C2", "C3"]],
  ["D1", ["B2"]], ["D2", ["D1", "C2"]], ["D3", ["D1", "C3", "B4", "A2"]], ["D4", ["D3", "C4"]], ["D5", ["D1", "C6"]],
  ["E1", ["A3"]], ["E2", ["E1", "C1"]], ["E3", ["E2"]],
  ["F1", ["D2", "D4", "E2"]], ["F2", ["C4", "E2"]], ["F3", ["C2", "C4"]],
  ["G1", ["F1", "F2", "F3", "E3", "D5", "C5"]],
];

const ref = (key: string) => `n_${key}0000`;

function graphOf(plan: Array<[string, string[]]>, summaryFrom: string[]): { nodes: TaskGraphLayoutNode[]; edges: TaskGraphLayoutEdge[] } {
  return {
    nodes: [
      ...plan.map(([key]) => ({ ref: ref(key), type: "task" as const, width: 250, height: 146 })),
      { ref: ref("ZZ"), type: "summary" as const, width: 250, height: 116 },
    ],
    edges: [
      ...plan.flatMap(([key, deps]) => deps.map((dep) => ({ source: ref(dep), target: ref(key) }))),
      ...summaryFrom.map((key) => ({ source: ref(key), target: ref("ZZ") })),
    ].map((edge, index) => ({ ...edge, ref: `e_${String(index).padStart(6, "0")}` })),
  };
}

describe("computeTaskGraphLayout", () => {
  it("routes every dependency around the other tasks and keeps the final objective in the last column", async () => {
    const { nodes, edges } = graphOf(deliveryPlan, ["G1"]);
    const { positions, routes } = await computeTaskGraphLayout(nodes, edges);
    const boxes = new Map(nodes.map((node) => [node.ref, { ...positions.get(node.ref)!, width: node.width, height: node.height }]));

    expect(Math.max(...[...positions.values()].map((position) => position.x))).toBe(positions.get(ref("ZZ"))?.x);
    expect(routes.size).toBe(edges.length);
    for (const edge of edges) {
      const points = routes.get(edge.ref)?.points ?? [];
      expect(points.length).toBeGreaterThanOrEqual(2);
      for (const [index, start] of points.slice(0, -1).entries()) {
        const end = points[index + 1]!;
        for (const [id, box] of boxes) {
          if (id === edge.source || id === edge.target) continue;
          const crossesX = Math.max(start.x, end.x) > box.x + 2 && Math.min(start.x, end.x) < box.x + box.width - 2;
          const crossesY = Math.max(start.y, end.y) > box.y + 2 && Math.min(start.y, end.y) < box.y + box.height - 2;
          expect(crossesX && crossesY, `${edge.ref} crosses ${id}`).toBe(false);
        }
      }
    }
  });

  it("records the node positions each route was computed for", async () => {
    const { nodes, edges } = graphOf([["A", []], ["B", ["A"]]], ["B"]);
    const { positions, routes } = await computeTaskGraphLayout(nodes, edges);
    const route = routes.get(edges[0]!.ref);

    expect(route?.source).toEqual(positions.get(ref("A")));
    expect(route?.target).toEqual(positions.get(ref("B")));
  });

  it("places each task in the earliest column its dependencies allow", async () => {
    const { nodes, edges } = graphOf([["A", []], ["B", ["A"]], ["C", ["B"]], ["D", []]], ["C", "D"]);
    const { positions } = await computeTaskGraphLayout(nodes, edges);

    expect(positions.get(ref("D"))?.x).toBe(positions.get(ref("A"))?.x);
  });

  it("produces the same layout for the same plan regardless of input order", async () => {
    const { nodes, edges } = graphOf(deliveryPlan, ["G1"]);
    const forward = await computeTaskGraphLayout(nodes, edges);
    const reversed = await computeTaskGraphLayout([...nodes].reverse(), [...edges].reverse());

    expect(reversed.positions).toEqual(forward.positions);
  });
});

describe("layoutNodeOrder", () => {
  it("orders an unplaced graph topologically", () => {
    const { nodes, edges } = graphOf([["B", ["A"]], ["A", []], ["C", ["B"]]], ["C"]);
    expect(layoutNodeOrder(nodes, edges).map((node) => node.ref)).toEqual([ref("A"), ref("B"), ref("C"), ref("ZZ")]);
  });

  it("keeps nodes on a cycle instead of dropping them", () => {
    const { nodes, edges } = graphOf([["A", ["B"]], ["B", ["A"]]], ["A"]);
    expect(layoutNodeOrder(nodes, edges)).toHaveLength(3);
  });
});

describe("roundedOrthogonalPath", () => {
  it("rounds each bend without overshooting short segments", () => {
    expect(roundedOrthogonalPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 40 }]))
      .toBe("M0,0 L5,0 Q10,0 10,5 L10,40");
  });
});
