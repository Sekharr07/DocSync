export interface CharId {
  siteId: string;
  clock: number;
}

export interface Char {
  id: CharId;
  value: string;
  parentId: CharId | null; // null = beginning of doc
  tombstone: boolean;
}

export function charIdToString(id: CharId): string {
  return `${id.siteId}:${id.clock}`;
}

export function charIdEquals(a: CharId, b: CharId): boolean {
  return a.siteId === b.siteId && a.clock === b.clock;
}

export function charIdCompare(a: CharId, b: CharId): number {
  if (a.clock !== b.clock) return b.clock - a.clock;
  return a.siteId < b.siteId ? -1 : a.siteId > b.siteId ? 1 : 0;
}
