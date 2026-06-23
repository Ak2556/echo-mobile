// Mirror of the SQL get_ranked_feed scoring formula — used for local/offline
// mode so client sort matches server sort exactly.

export const GRAVITY: Record<string, number> = {
  latest: 1.8,  // recency-heavy
  popular: 1.0, // engagement-heavy (older viral posts rank higher)
};

export type ScoringInput = {
  likes: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  createdAt: string;
  postType?: string;
  followerCount?: number;
  isFollowing?: boolean;
};

export function computeScore(item: ScoringInput, gravity: number = GRAVITY.latest): number {
  const ageHours = Math.max(
    (Date.now() - new Date(item.createdAt).getTime()) / 3_600_000,
    0.1
  );
  const engagement =
    item.likes * 3 + item.commentCount * 5 + item.repostCount * 4 + item.viewCount * 0.3;

  const base = engagement / Math.pow(ageHours + 2, gravity);
  const engagementRate =
    1 + (item.likes + item.commentCount + item.repostCount) / Math.max(item.viewCount, 1) * 2;
  const authorAuthority =
    1 + Math.log(Math.max((item.followerCount ?? 0) + 1, 1)) / 10;
  const mediaBoost = item.postType && item.postType !== 'text' ? 1.2 : 1.0;
  const followBoost = item.isFollowing ? 1.5 : 1.0;

  return base * engagementRate * authorAuthority * mediaBoost * followBoost;
}

// Min-heap for merging sorted pages without re-sorting everything
// Used in useInfiniteFeed to merge incoming pages while preserving rank order.

export class MinHeap<T> {
  private heap: T[] = [];
  constructor(private compare: (a: T, b: T) => number) {}

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number { return this.heap.length; }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.heap[i], this.heap[parent]) < 0) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.compare(this.heap[l], this.heap[smallest]) < 0) smallest = l;
      if (r < n && this.compare(this.heap[r], this.heap[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}

// Deduplicate feed items across infinite-scroll pages in O(n) using a Set.
export function deduplicateFeed<T extends { id: string }>(
  pages: T[][],
  seen = new Set<string>()
): T[] {
  const result: T[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        result.push(item);
      }
    }
  }
  return result;
}
