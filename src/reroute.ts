import { taskGraphLayoutOptions, type Point, type TaskEdgeRoute } from "./layout.js";

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

// 与自动布局相同的连线-节点间距；节点挨得太近时退到较小的间距再试一次。
const edgeNodeSpacing = Number(taskGraphLayoutOptions["elk.spacing.edgeNode"]);
const fallbackMargin = 8;
// 代价：拐弯、与其他连线交叉各折算的长度，以及沿兄弟连线、原走线、其他连线行进时的长度系数。
const bendCost = 32;
const crossingCost = 24;
const siblingFactor = 0.3;
const previousFactor = 0.7;
const overlapFactor = 5;
// 判断线段是否穿过节点时允许擦边的像素，与布局测试保持一致。
const touchTolerance = 2;
// 寻路时视为落在节点外扩边界上的误差。
const edgeTolerance = 0.5;

/**
 * 求一条连线此刻应画的折线，规则尽量与自动布局一致：
 * 1. 两端节点都还在布局位置时，原样使用 ELK 走线；
 * 2. 否则先沿用原走线，只挪动被拖一端的首段或末段，中间通道不动；需要补竖线时优先落在兄弟连线的汇合竖线上；
 * 3. 挪动后穿过节点或压在其他连线上时，绕开所有节点重新寻路：与节点保持布局间距、并入兄弟连线、避开其他连线、少拐弯，
 *    并优先沿上一帧画出的折线（edge.points）走，拖动中不在两条路之间来回跳；节点靠近时按间距把走线推开，形状连续变化；
 * 4. 仍然无路可走（如节点互相重叠）时返回 null，由调用方退回直连样式。
 * 与本连线共用端点且也在移动的连线位置还在变化，不作参考；其余连线一律视为固定。
 */
export function adaptEdgeRoute(edge: RoutingEdge, scene: RoutingScene, ports?: { start: Point; end: Point }): Point[] | null {
  const sourceBox = scene.nodes.get(edge.source);
  const targetBox = scene.nodes.get(edge.target);
  if (!sourceBox || !targetBox) return null;
  const route = edge.route;
  if (route && isSettled(edge, scene)) return route.points;

  const siblings: (readonly Point[])[] = [];
  const others: (readonly Point[])[] = [];
  const jogCandidates: number[] = [];
  for (const other of scene.edges) {
    if (other.ref === edge.ref) continue;
    const settled = isSettled(other, scene);
    const points = settled ? other.route!.points : other.points;
    if (!points || points.length < 2) continue;
    const sharesNode = [other.source, other.target].some((ref) => ref === edge.source || ref === edge.target);
    if (!settled && sharesNode) continue;
    // ELK 合并连线时，同源连线在前两段、同目标连线在后两段与本连线汇成一股；
    // 经共用端口传递相连的连线也会被 ELK 并到同一条竖线上，布局时就与本连线共线相接或重合的线段同样算作一股。
    // 其余部分照常避让。
    const ends = other.target === edge.target ? points.slice(-3) : other.source === edge.source ? points.slice(0, 3) : [];
    for (const segment of segments(points)) {
      const shared = segments(ends).some(([a, b]) => a === segment[0] && b === segment[1])
        || (route !== undefined && overlapsAny(segment, [route.points], 0));
      (shared ? siblings : others).push(segment);
      if (shared && segment[0].x === segment[1].x) {
        if (other.target === edge.target) jogCandidates.unshift(segment[0].x);
        else jogCandidates.push(segment[0].x);
      }
    }
  }

  const obstacles = [...scene.nodes.values()];
  const start = route ? shifted(route.points[0]!, route.source, sourceBox) : ports?.start ?? { x: sourceBox.x + sourceBox.width, y: sourceBox.y + sourceBox.height / 2 };
  const end = route ? shifted(route.points[route.points.length - 1]!, route.target, targetBox) : ports?.end ?? { x: targetBox.x, y: targetBox.y + targetBox.height / 2 };
  const previous = [edge.points, route?.points].filter((points): points is readonly Point[] => points !== undefined && points.length >= 2);
  if (route) {
    const followed = followPath(route.points, start, end, obstacles, { others, jogCandidates });
    if (followed) return followed;
  }
  for (const margin of [edgeNodeSpacing, fallbackMargin]) {
    const routed = routeAroundObstacles(start, end, obstacles, { siblings, others, previous, margin });
    if (routed) return routed;
  }
  return null;
}

/**
 * 端点被拖动后尽量沿用原走线：只平移被拖动一端的首段或末段并带动相邻拐点，中间的走线通道保持不动。
 * 原本是直线、两端错开后需要补一段竖线时，依次尝试 jogCandidates 中的位置（通常是兄弟连线的汇合竖线），最后才取中点。
 * 结果不再是从右侧出、从左侧进的正交折线，穿过任何节点（包括两端节点自身），或与 others 中的连线重叠时返回 null。
 */
export function followRoute(
  route: TaskEdgeRoute,
  source: Point,
  target: Point,
  obstacles: readonly Rect[],
  options: FollowOptions = {},
): Point[] | null {
  const first = shifted(route.points[0]!, route.source, source);
  const last = shifted(route.points[route.points.length - 1]!, route.target, target);
  return followPath(route.points, first, last, obstacles, options);
}

interface FollowOptions {
  others?: readonly (readonly Point[])[];
  jogCandidates?: readonly number[];
}

/**
 * 把折线的两端换成 first、last，并带动相邻拐点；规则与校验同 followRoute。
 * 竖线保持不动，直到节点贴近到最小间距以内才推着它一起走：小幅拖动不拆散合并的连线，也不会等首末段被压扁后整段跳开。
 */
function followPath(points: readonly Point[], first: Point, last: Point, obstacles: readonly Rect[], options: FollowOptions): Point[] | null {
  const inner = points.slice(1, -1).map((point) => ({ ...point }));
  const attempts: Point[][] = [];
  if (inner.length) {
    const head = inner[0]!;
    const tail = inner[inner.length - 1]!;
    head.y = first.y;
    tail.y = last.y;
    // 布局本身给出的首末段比最小间距还短时以原长度为准，避免一开始拖动就把竖线推开。
    const headGap = Math.min(fallbackMargin, points[1]!.x - points[0]!.x);
    const tailGap = Math.min(fallbackMargin, points[points.length - 1]!.x - points[points.length - 2]!.x);
    if (inner.length >= 2 && head.x === inner[1]!.x && head.x < first.x + headGap) {
      head.x = first.x + headGap;
      inner[1]!.x = head.x;
    }
    if (inner.length >= 2 && tail.x === inner[inner.length - 2]!.x && tail.x > last.x - tailGap) {
      tail.x = last.x - tailGap;
      inner[inner.length - 2]!.x = tail.x;
    }
    const attempt = [first, ...inner, last];
    // 推动竖线后横线不能掉头，否则走线会折回自身。
    if (segments(attempt).every(([a, b], index) => a.y !== b.y || Math.sign(b.x - a.x) * Math.sign(points[index + 1]!.x - points[index]!.x) >= 0)) {
      attempts.push(attempt);
    }
  } else if (first.y === last.y) {
    attempts.push([first, last]);
  } else {
    for (const x of [...(options.jogCandidates ?? []), (first.x + last.x) / 2]) {
      if (x >= first.x + fallbackMargin && x <= last.x - fallbackMargin) attempts.push([first, { x, y: first.y }, { x, y: last.y }, last]);
    }
  }
  const valid = attempts.find((attempt) =>
    attempt[1]!.x > first.x
    && attempt[attempt.length - 2]!.x < last.x
    && isOrthogonal(attempt)
    && !crossesAny(attempt, obstacles)
    && !overlapsAny(attempt, options.others ?? []));
  return valid ? simplify(valid) : null;
}

/**
 * 在节点之间找一条正交走线：从起点向右出发、向右进入终点，绕开所有节点并与其保持间距。
 * 候选网格取自外扩后的节点边界、已有连线所在的坐标以及相邻坐标之间的中线，走线因此落在通道中央或与已有连线对齐；
 * 在网格上按“长度 × 系数 + 拐弯 + 交叉”做 A* 搜索。起点或终点被节点占住、无路可走时返回 null。
 */
export function routeAroundObstacles(start: Point, end: Point, obstacles: readonly Rect[], hints: RoutingHints = {}): Point[] | null {
  const margin = hints.margin ?? edgeNodeSpacing;
  const siblings = hints.siblings ?? [];
  const others = hints.others ?? [];
  const previous = hints.previous ?? [];
  const boxes = obstacles.map((box) => ({
    left: box.x - margin,
    right: box.x + box.width + margin,
    top: box.y - margin,
    bottom: box.y + box.height + margin,
  }));
  const from = { x: start.x + margin, y: start.y };
  const to = { x: end.x - margin, y: end.y };
  const lines = [...siblings, ...others, ...previous];
  const xs = gridLines([from.x, to.x, ...boxes.flatMap((box) => [box.left, box.right]), ...lines.flatMap(verticalXs)]);
  const ys = gridLines([from.y, to.y, ...boxes.flatMap((box) => [box.top, box.bottom]), ...lines.flatMap(horizontalYs)]);
  const grid = new Grid(xs, ys);
  const blocked = new Uint8Array(grid.size);
  for (const box of boxes) {
    // 落在外扩边界上的点不算被占：拖动后的坐标带小数，起止点与边界之间常差一个浮点误差。
    for (let i = firstAbove(xs, box.left + edgeTolerance); i < xs.length && xs[i]! < box.right - edgeTolerance; i += 1) {
      for (let j = firstAbove(ys, box.top + edgeTolerance); j < ys.length && ys[j]! < box.bottom - edgeTolerance; j += 1) blocked[grid.cell(i, j)] = 1;
    }
  }
  const startCell = grid.cell(grid.column(from.x), grid.row(from.y));
  const endCell = grid.cell(grid.column(to.x), grid.row(to.y));
  if (blocked[startCell] || blocked[endCell]) return null;
  const sibling = grid.trace(siblings);
  const own = grid.trace(previous);
  const other = grid.trace(others);

  // 状态 = 网格点 × 到达方向；方向 0 右、1 左、2 下、3 上。起点视为向右到达。
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const cost = new Float64Array(grid.size * 4).fill(Infinity);
  const previousState = new Int32Array(grid.size * 4).fill(-1);
  const heuristic = (cell: number) => siblingFactor * (Math.abs(grid.x(cell) - to.x) + Math.abs(grid.y(cell) - to.y));
  const open = new MinHeap();
  cost[startCell * 4] = 0;
  open.push(heuristic(startCell), startCell * 4);
  let best = Infinity;
  let bestState = -1;
  while (open.size) {
    const [estimate, state] = open.pop();
    if (estimate >= best) break;
    const cell = Math.floor(state / 4);
    const direction = state % 4;
    const reached = cost[state]!;
    if (estimate > reached + heuristic(cell)) continue;
    if (cell === endCell) {
      // 终点要从左侧进入节点，最后一段不是向右时多算一次拐弯。
      const total = reached + (direction === 0 ? 0 : bendCost);
      if (total < best) {
        best = total;
        bestState = state;
      }
      continue;
    }
    const column = grid.columnOf(cell);
    const row = grid.rowOf(cell);
    steps.forEach(([dx, dy], next) => {
      if (next === (direction ^ 1)) return;
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= xs.length || nextRow < 0 || nextRow >= ys.length) return;
      const nextCell = grid.cell(nextColumn, nextRow);
      if (blocked[nextCell]) return;
      const horizontal = dy === 0;
      const link = grid.link(Math.min(cell, nextCell), horizontal);
      const crossed = horizontal ? other.verticalThrough[nextCell] : other.horizontalThrough[nextCell];
      const distance = Math.abs(xs[nextColumn]! - xs[column]!) + Math.abs(ys[nextRow]! - ys[row]!);
      // 只对与其他连线重合的那部分长度加价、与兄弟连线或原走线重合的部分打折，两种折扣不叠加。
      const length = distance
        + other.along[link]! * (overlapFactor - 1)
        - Math.max(sibling.along[link]! * (1 - siblingFactor), own.along[link]! * (1 - previousFactor));
      const nextCost = reached + length + (next === direction ? 0 : bendCost) + (crossed ? crossingCost : 0);
      const nextState = nextCell * 4 + next;
      if (nextCost >= cost[nextState]!) return;
      cost[nextState] = nextCost;
      previousState[nextState] = state;
      open.push(nextCost + heuristic(nextCell), nextState);
    });
  }
  if (bestState < 0) return null;
  const path: Point[] = [];
  for (let state = bestState; state >= 0; state = previousState[state]!) {
    const cell = Math.floor(state / 4);
    path.push({ x: grid.x(cell), y: grid.y(cell) });
  }
  return simplify([start, ...path.reverse(), end]);
}

/** 折线是否有任何一段穿过某个矩形内部；只擦过边缘不算。 */
export function crossesAny(points: readonly Point[], obstacles: readonly Rect[]): boolean {
  return segments(points).some(([start, end]) => obstacles.some((box) =>
    Math.max(start.x, end.x) > box.x + touchTolerance
    && Math.min(start.x, end.x) < box.x + box.width - touchTolerance
    && Math.max(start.y, end.y) > box.y + touchTolerance
    && Math.min(start.y, end.y) < box.y + box.height - touchTolerance));
}

/**
 * 折线是否有一段与其他连线共线重叠（不同连线压在同一条线上，分不清走向）。
 * minLength 为重叠至少要多长才算；取 0 时首尾相接也算，用来识别 ELK 并在同一条线上的连线。
 */
export function overlapsAny(points: readonly Point[], lines: readonly (readonly Point[])[], minLength = 1): boolean {
  const own = segments(points);
  return lines.some((line) => segments(line).some(([a, b]) => own.some(([c, d]) => {
    if (a.y === b.y && c.y === d.y && Math.abs(a.y - c.y) < 1) return overlap(a.x, b.x, c.x, d.x) >= minLength;
    if (a.x === b.x && c.x === d.x && Math.abs(a.x - c.x) < 1) return overlap(a.y, b.y, c.y, d.y) >= minLength;
    return false;
  })));
}

/** 两端节点都还在这条连线布局时的位置上。 */
function isSettled(edge: RoutingEdge, scene: RoutingScene): boolean {
  const route = edge.route;
  return route !== undefined
    && samePosition(scene.nodes.get(edge.source), route.source)
    && samePosition(scene.nodes.get(edge.target), route.target);
}

function samePosition(current: Point | undefined, expected: Point): boolean {
  return current !== undefined && Math.abs(current.x - expected.x) < 0.5 && Math.abs(current.y - expected.y) < 0.5;
}

/** 随节点从布局位置 from 移到 to 平移一个点。 */
function shifted(point: Point, from: Point, to: Point): Point {
  return { x: point.x + to.x - from.x, y: point.y + to.y - from.y };
}

/** 两段区间重叠的长度；不相交时为负。 */
function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));
}

function segments(points: readonly Point[]): Array<[Point, Point]> {
  return points.slice(1).map((point, index) => [points[index]!, point]);
}

function verticalXs(points: readonly Point[]): number[] {
  return segments(points).filter(([a, b]) => a.x === b.x && a.y !== b.y).map(([a]) => a.x);
}

function horizontalYs(points: readonly Point[]): number[] {
  return segments(points).filter(([a, b]) => a.y === b.y && a.x !== b.x).map(([a]) => a.y);
}

function isOrthogonal(points: readonly Point[]): boolean {
  return segments(points).every(([a, b]) => a.x === b.x || a.y === b.y);
}

/** 去掉重合点和共线的中间点，避免圆角在零长度线段上出现折痕。 */
function simplify(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    const beforeLast = result[result.length - 2];
    if (last && beforeLast && ((beforeLast.x === last.x && last.x === point.x) || (beforeLast.y === last.y && last.y === point.y))) {
      result[result.length - 1] = point;
      continue;
    }
    result.push(point);
  }
  return result;
}

/** 去重排序后的坐标，并在相邻坐标之间补上中线，让走线可以从通道中央穿过。 */
function gridLines(values: readonly number[]): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return sorted.flatMap((value, index) => {
    const next = sorted[index + 1];
    return next === undefined ? [value] : [value, (value + next) / 2];
  });
}

function firstAbove(values: readonly number[], limit: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle]! > limit) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** [low, high] 覆盖的网格线下标范围（首尾都含）；没有覆盖任何网格线时 first > last。 */
function covered(values: readonly number[], low: number, high: number): [number, number] {
  let first = firstAbove(values, low);
  if (first > 0 && values[first - 1] === low) first -= 1;
  return [first, firstAbove(values, high) - 1];
}

/** 寻路网格：网格点按行优先编号；link 为某点向右（水平）或向下（竖直）的那条格线。 */
class Grid {
  readonly size: number;
  private readonly columns: Map<number, number>;
  private readonly rows: Map<number, number>;

  constructor(private readonly xs: readonly number[], private readonly ys: readonly number[]) {
    this.size = xs.length * ys.length;
    this.columns = new Map(xs.map((x, index) => [x, index]));
    this.rows = new Map(ys.map((y, index) => [y, index]));
  }

  column(x: number): number {
    return this.columns.get(x)!;
  }

  row(y: number): number {
    return this.rows.get(y)!;
  }

  cell(column: number, row: number): number {
    return row * this.xs.length + column;
  }

  columnOf(cell: number): number {
    return cell % this.xs.length;
  }

  rowOf(cell: number): number {
    return Math.floor(cell / this.xs.length);
  }

  x(cell: number): number {
    return this.xs[this.columnOf(cell)]!;
  }

  y(cell: number): number {
    return this.ys[this.rowOf(cell)]!;
  }

  link(cell: number, horizontal: boolean): number {
    return cell * 2 + (horizontal ? 0 : 1);
  }

  /**
   * 把折线落到网格上：记下每条格线与它重合的长度，以及它竖直或水平穿过的网格点（不含端点），用来计算重叠与交叉。
   * 线段端点不必落在网格线上，格线只被覆盖一部分时按实际重合长度记。
   */
  trace(lines: readonly (readonly Point[])[]): { along: Float64Array; verticalThrough: Uint8Array; horizontalThrough: Uint8Array } {
    const along = new Float64Array(this.size * 2);
    const verticalThrough = new Uint8Array(this.size);
    const horizontalThrough = new Uint8Array(this.size);
    for (const line of lines) {
      for (const [a, b] of segments(line)) {
        if (a.y === b.y && a.x !== b.x) {
          const row = this.rows.get(a.y);
          if (row === undefined) continue;
          const [low, high] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
          const [first, last] = covered(this.xs, low, high);
          for (let column = Math.max(0, first - 1); column <= last && column + 1 < this.xs.length; column += 1) {
            const link = this.link(this.cell(column, row), true);
            along[link] = Math.max(along[link]!, overlap(this.xs[column]!, this.xs[column + 1]!, low, high));
          }
          for (let column = first; column <= last; column += 1) {
            if (this.xs[column]! > low && this.xs[column]! < high) horizontalThrough[this.cell(column, row)] = 1;
          }
        } else if (a.x === b.x && a.y !== b.y) {
          const column = this.columns.get(a.x);
          if (column === undefined) continue;
          const [low, high] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
          const [first, last] = covered(this.ys, low, high);
          for (let row = Math.max(0, first - 1); row <= last && row + 1 < this.ys.length; row += 1) {
            const link = this.link(this.cell(column, row), false);
            along[link] = Math.max(along[link]!, overlap(this.ys[row]!, this.ys[row + 1]!, low, high));
          }
          for (let row = first; row <= last; row += 1) {
            if (this.ys[row]! > low && this.ys[row]! < high) verticalThrough[this.cell(column, row)] = 1;
          }
        }
      }
    }
    return { along, verticalThrough, horizontalThrough };
  }
}

class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    let index = this.keys.length;
    this.keys.push(key);
    this.values.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.move(parent, index);
      index = parent;
    }
    this.keys[index] = key;
    this.values[index] = value;
  }

  pop(): [number, number] {
    const top: [number, number] = [this.keys[0]!, this.values[0]!];
    const key = this.keys.pop()!;
    const value = this.values.pop()!;
    if (this.keys.length) {
      let index = 0;
      for (;;) {
        let child = index * 2 + 1;
        if (child >= this.keys.length) break;
        if (child + 1 < this.keys.length && this.keys[child + 1]! < this.keys[child]!) child += 1;
        if (this.keys[child]! >= key) break;
        this.move(child, index);
        index = child;
      }
      this.keys[index] = key;
      this.values[index] = value;
    }
    return top;
  }

  private move(from: number, to: number): void {
    this.keys[to] = this.keys[from]!;
    this.values[to] = this.values[from]!;
  }
}
