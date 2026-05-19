import { RGA } from "../src/rga";

describe("RGA - basic ops", () => {
  test("local insert and getText", () => {
    const rga = new RGA("A");
    rga.localInsert(0, "h");
    rga.localInsert(1, "i");
    expect(rga.getText()).toBe("hi");
  });

  test("local delete", () => {
    const rga = new RGA("A");
    rga.localInsert(0, "h");
    rga.localInsert(1, "i");
    rga.localDelete(0);
    expect(rga.getText()).toBe("i");
  });

  test("insert op uses charId field not id", () => {
    const rga = new RGA("A");
    const op = rga.localInsert(0, "x");
    expect(op.charId).toBeDefined();
    expect(op.charId.siteId).toBe("A");
    expect((op as any).id).toBeUndefined();
  });
});

describe("RGA - convergence", () => {
  test("two replicas converge after concurrent inserts at same position", () => {
    const a = new RGA("A");
    const b = new RGA("B");

    const op1 = a.localInsert(0, "X");
    const op2 = b.localInsert(0, "Y");

    a.applyRemoteInsert(op2);
    b.applyRemoteInsert(op1);

    expect(a.getText()).toBe(b.getText());
  });

  test("out-of-order insert (parent arrives late)", () => {
    const a = new RGA("A");
    const b = new RGA("B");

    const op1 = a.localInsert(0, "A");
    const op2 = a.localInsert(1, "B");

    b.applyRemoteInsert(op2); // buffered
    b.applyRemoteInsert(op1); // triggers drain

    expect(b.getText()).toBe("AB");
  });

  test("ghost delete (delete arrives before insert)", () => {
    const a = new RGA("A");
    const b = new RGA("B");

    const insertOp = a.localInsert(0, "Z");
    const deleteOp = a.localDelete(0)!;

    b.applyRemoteDelete(deleteOp);  // ghost
    b.applyRemoteInsert(insertOp);  // applied then immediately tombstoned

    expect(b.getText()).toBe("");
  });

  test("three replicas all converge", () => {
    const a = new RGA("A");
    const b = new RGA("B");
    const c = new RGA("C");

    const op1 = a.localInsert(0, "H");
    const op2 = a.localInsert(1, "i");
    const op3 = b.localInsert(0, "!");

    [b, c].forEach((r) => { r.applyRemoteInsert(op1); r.applyRemoteInsert(op2); });
    [a, c].forEach((r) => r.applyRemoteInsert(op3));

    expect(a.getText()).toBe(b.getText());
    expect(b.getText()).toBe(c.getText());
  });
});

describe("RGA - idempotency", () => {
  test("applying same op twice is safe", () => {
    const a = new RGA("A");
    const b = new RGA("B");
    const op = a.localInsert(0, "X");
    b.applyRemoteInsert(op);
    b.applyRemoteInsert(op);
    expect(b.getText()).toBe("X");
  });
});

describe("RGA - fromOps round-trip", () => {
  test("rebuilds document from op log", () => {
    const a = new RGA("A");
    a.localInsert(0, "h");
    a.localInsert(1, "e");
    a.localInsert(2, "l");
    a.localInsert(3, "l");
    a.localInsert(4, "o");
    a.localDelete(0); // delete 'h'

    // Collect all ops
    const b = new RGA("A");
    const ops = [
      b.localInsert(0, "h"),
      b.localInsert(1, "e"),
      b.localInsert(2, "l"),
      b.localInsert(3, "l"),
      b.localInsert(4, "o"),
      b.localDelete(0)!,
    ];

    const c = RGA.fromOps("C", ops);
    expect(c.getText()).toBe("ello");
  });
});
