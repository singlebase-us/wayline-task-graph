import type { TaskGraphLayoutEdge, TaskGraphLayoutNode } from "./layout.js";

/** 测试用任务图：每项是 [任务, 它依赖的任务]，summaryFrom 列出直接汇入最终目标的任务。 */
export type Plan = Array<[string, string[]]>;

/** 27 节点的交付计划样例：多条并行分支、跨多列的长依赖，最终汇入交付目标。 */
export const deliveryPlan: Plan = [
  ["A1", []], ["A2", []], ["A3", []],
  ["B1", ["A1", "A2"]], ["B2", ["B1"]], ["B3", ["A1", "A3"]], ["B4", ["B3"]], ["B5", ["A3"]],
  ["C1", ["B3"]], ["C2", ["C1", "B5"]], ["C3", ["C1", "B4"]], ["C4", ["C3", "B5"]], ["C5", ["C2"]], ["C6", ["C2", "C3"]],
  ["D1", ["B2"]], ["D2", ["D1", "C2"]], ["D3", ["D1", "C3", "B4", "A2"]], ["D4", ["D3", "C4"]], ["D5", ["D1", "C6"]],
  ["E1", ["A3"]], ["E2", ["E1", "C1"]], ["E3", ["E2"]],
  ["F1", ["D2", "D4", "E2"]], ["F2", ["C4", "E2"]], ["F3", ["C2", "C4"]],
  ["G1", ["F1", "F2", "F3", "E3", "D5", "C5"]],
];

/** 编辑器里常见的小图：一个起点分出三支，中间两两交汇。 */
export const smallPlan: Plan = [
  ["A", []], ["B", ["A"]], ["C", ["A"]], ["H", ["A"]],
  ["D", ["B", "C"]], ["E", ["C", "B"]], ["F", ["D", "E"]], ["G", ["F"]],
];

/** 八个互不依赖的任务全部汇入同一个节点，考验大股合并。 */
export const fanInPlan: Plan = [
  ...["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"].map((key): [string, string[]] => [key, []]),
  ["M", ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]],
  ["N", ["M", "P8"]],
];

/** 一条长链加上跨越多列的跳跃依赖，长连线要穿过中间各列。 */
export const skipChainPlan: Plan = [
  ["S1", []], ["S2", ["S1"]], ["S3", ["S2", "S1"]], ["S4", ["S3"]], ["S5", ["S4", "S1", "S2"]], ["S6", ["S5", "S3"]],
  ["T1", []], ["T2", ["T1", "S2"]], ["T3", ["T2", "S4"]],
];

/** 3 行 4 列的网格，每个任务依赖前一列的同行与相邻行，连线交叉很多。 */
export const latticePlan: Plan = [0, 1, 2, 3].flatMap((column) => [0, 1, 2].map((row): [string, string[]] => [
  `L${column}${row}`,
  column === 0 ? [] : [row - 1, row, row + 1].filter((other) => other >= 0 && other <= 2).map((other) => `L${column - 1}${other}`),
]));

export const ref = (key: string) => `n_${key}0000`;

export function graphOf(plan: Plan, summaryFrom: string[]): { nodes: TaskGraphLayoutNode[]; edges: TaskGraphLayoutEdge[] } {
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
