import { Char, CharId, charIdEquals, charIdToString, charIdCompare } from "./char";
import { Operation, InsertOperation, DeleteOperation } from "./operation";

export class RGA {
  private chars: Char[] = [];
  private clock: number = 0;
  private siteId: string;

  private pendingInserts: InsertOperation[] = [];
  private ghostDeletes: Map<string, DeleteOperation> = new Map();

  constructor(siteId: string) {
    this.siteId = siteId;
  }

  getSiteId(): string { return this.siteId; }
  getClock(): number  { return this.clock; }

  // ── Local ops ─────────────────────────────────────────────────────────────────

  localInsert(index: number, value: string): InsertOperation {
    this.clock++;
    const charId: CharId = { siteId: this.siteId, clock: this.clock };

    const visible = this.visibleChars();
    const parentId = index === 0 ? null : visible[index - 1].id;

    const char: Char = { id: charId, value, parentId, tombstone: false };
    this.insertChar(char);

    return {
      type: "insert",
      charId,        // ← safe field name, no Mongoose collision
      value,
      parentId,
      siteId: this.siteId,
      clock: this.clock,
    };
  }

  localDelete(index: number): DeleteOperation | null {
    const visible = this.visibleChars();
    if (index < 0 || index >= visible.length) return null;

    const target = visible[index];
    target.tombstone = true;
    this.clock++;

    return {
      type: "delete",
      targetId: target.id,
      siteId: this.siteId,
      clock: this.clock,
    };
  }

  // ── Remote ops ────────────────────────────────────────────────────────────────

  applyRemoteInsert(op: InsertOperation): void {
    if (op.clock > this.clock) this.clock = op.clock;

    if (this.findChar(op.charId)) return; // idempotent

    if (op.parentId !== null && !this.findChar(op.parentId)) {
      this.pendingInserts.push(op);
      return;
    }

    const char: Char = {
      id: op.charId,
      value: op.value,
      parentId: op.parentId,
      tombstone: false,
    };
    this.insertChar(char);

    // Apply any ghost delete waiting for this char
    const key = charIdToString(op.charId);
    if (this.ghostDeletes.has(key)) {
      char.tombstone = true;
      this.ghostDeletes.delete(key);
    }

    this.drainPending();
  }

  applyRemoteDelete(op: DeleteOperation): void {
    if (op.clock > this.clock) this.clock = op.clock;

    const target = this.findChar(op.targetId);
    if (!target) {
      this.ghostDeletes.set(charIdToString(op.targetId), op);
      return;
    }
    target.tombstone = true;
  }

  applyOperation(op: Operation): void {
    if (op.type === "insert") this.applyRemoteInsert(op);
    else this.applyRemoteDelete(op);
  }

  // ── Text content ──────────────────────────────────────────────────────────────

  getText(): string {
    return this.visibleChars().map((c) => c.value).join("");
  }

  visibleChars(): Char[] {
    return this.chars.filter((c) => !c.tombstone);
  }

  // ── Serialisation ─────────────────────────────────────────────────────────────

  toJSON(): object {
    return { siteId: this.siteId, clock: this.clock, chars: this.chars };
  }

  static fromOps(siteId: string, ops: Operation[]): RGA {
    const rga = new RGA(siteId);
    for (const op of ops) rga.applyOperation(op);
    return rga;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private insertChar(char: Char): void {
    const parentIdx = char.parentId === null
      ? -1
      : this.chars.findIndex((c) => charIdEquals(c.id, char.parentId!));

    let insertAt = parentIdx + 1;
    while (insertAt < this.chars.length) {
      const next = this.chars[insertAt];
      const nextParentId = next.parentId;
      const sameParent = char.parentId === null
        ? nextParentId === null
        : nextParentId !== null && charIdEquals(nextParentId, char.parentId);

      if (!sameParent) break;
      if (charIdCompare(next.id, char.id) > 0) break;
      insertAt++;
    }

    this.chars.splice(insertAt, 0, char);
  }

  private findChar(id: CharId): Char | undefined {
    return this.chars.find((c) => charIdEquals(c.id, id));
  }

  private drainPending(): void {
    let progress = true;
    while (progress) {
      progress = false;
      this.pendingInserts = this.pendingInserts.filter((op) => {
        if (op.parentId === null || this.findChar(op.parentId)) {
          this.applyRemoteInsert(op);
          progress = true;
          return false;
        }
        return true;
      });
    }
  }
}
