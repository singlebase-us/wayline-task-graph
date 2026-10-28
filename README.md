# @wayline/task-graph

Layout and edge routing for Wayline task graphs, as used by the Wayline user and admin consoles.
Use it to build your own views of a delivery plan on top of [React Flow](https://reactflow.dev).

The package decides **where things go**; you decide **what they look like**. Node cards, colours
and the canvas chrome stay in your application.

- Tasks are placed in the earliest column their dependencies allow, like a technology tree.
- The final objective (`type: "summary"`) is pinned to the last column.
- The same graph always produces the same layout, whatever order nodes and edges arrive in.
- Edges follow orthogonal routes around other nodes, with rounded bends.

## Install

```sh
pnpm add github:singlebase-us/wayline-task-graph#v0.1.0
```

Peer dependencies: `react` 19 and `@xyflow/react` 12.

## Usage

```tsx
import { ReactFlow, type Edge, type Node } from "@xyflow/react";
import { computeTaskGraphLayout, TaskGraphRoutedEdge, type RoutedEdgeData } from "@wayline/task-graph";

const edgeTypes = { routed: TaskGraphRoutedEdge };

async function toFlow(graph: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const { positions, routes } = await computeTaskGraphLayout(
    graph.nodes.map((node) => ({
      ref: node.ref,
      type: node.type,
      width: 250,
      height: node.type === "summary" ? 116 : 146,
    })),
    graph.edges,
  );
  const nodes: Node[] = graph.nodes.map((node) => ({
    id: node.ref,
    position: positions.get(node.ref) ?? { x: 0, y: 0 },
    width: 250,
    height: node.type === "summary" ? 116 : 146,
    data: { node },
  }));
  const edges: Edge<RoutedEdgeData>[] = graph.edges.map((edge) => ({
    id: edge.ref,
    source: edge.source,
    target: edge.target,
    type: "routed",
    data: { route: routes.get(edge.ref) },
  }));
  return { nodes, edges };
}

// <ReactFlow nodes={nodes} edges={edges} edgeTypes={edgeTypes} nodeTypes={yourNodeTypes} />
```

Give React Flow nodes the same `width` and `height` you passed to the layout, so edges meet the
cards where the routes expect them.

`TaskGraphRoutedEdge` draws the computed route while both endpoints stay where the layout put them.
Once a user drags an endpoint, it falls back to a smoothstep path until you lay the graph out again.

## API

| Export | Purpose |
| ------ | ------- |
| `computeTaskGraphLayout(nodes, edges)` | Resolves to `{ positions, routes }`, both `Map`s keyed by `ref`. Positions are top-left corners. |
| `TaskGraphRoutedEdge` | React Flow edge component that reads `data.route`. |
| `layoutNodeOrder(nodes, edges)` | The deterministic topological order fed to ELK; nodes on a cycle come last. |
| `roundedOrthogonalPath(points, radius?)` | SVG path for an orthogonal polyline with rounded bends. |
| `taskGraphLayoutOptions` | The ELK layered options in use. |

## Develop

```sh
pnpm install
pnpm check   # typecheck, test, build
```

`dist/` is committed so that installing from Git needs no build step. Run `pnpm build` and commit
the result with every source change.

## Licence

MIT. Layout is computed by [elkjs](https://github.com/kieler/elkjs) (EPL-2.0), installed as a
regular dependency.
