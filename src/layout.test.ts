import { describe, expect, it } from "vitest";
import {
  computeTaskGraphLayout,
  layoutNodeOrder,
  roundedOrthogonalPath,
} from "./layout.js";
import { deliveryPlan, graphOf, ref } from "./plans.fixture.js";

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
