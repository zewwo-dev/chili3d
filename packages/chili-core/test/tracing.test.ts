import { History, IHistoryRecord, Tracing } from "chili-core";
import { v4 as uuidv4 } from "uuid";

class MockRecord implements IHistoryRecord {
    id: string = uuidv4();
    name: string = "mock";

    constructor(public value: string) {}

    undo(): void {}
    redo(): void {}
    dispose(): void {}
}

describe("Tracing", () => {
    let history: History;
    let tracing: Tracing;

    beforeEach(() => {
        history = new History();
        tracing = new Tracing();
    });

    afterEach(() => {
        history.dispose();
        tracing.dispose();
    });

    test("should follow history push/undo/redo", () => {
        const r1 = new MockRecord("1");
        const r2 = new MockRecord("2");

        // Push r1
        history.add(r1);
        tracing.push(r1);

        // Check current ID (accessing private property for test)
        expect((tracing as any).currentId).toBe(r1.id);

        // Push r2
        history.add(r2);
        tracing.push(r2);
        expect((tracing as any).currentId).toBe(r2.id);

        // Undo r2
        history.undo();
        tracing.undo();
        expect((tracing as any).currentId).toBe(r1.id);

        // Undo r1
        history.undo();
        tracing.undo();

        // // Should be at root.
        // const nodes = tracing.serialize();
        // const r1Node = nodes[r1.id];
        // expect((tracing as any).currentId).toBe(r1Node.parentId);

        // Redo r1
        const redoId = history.redo();
        expect(redoId).toBe(r1.id);
        if (redoId) {
            tracing.redo(redoId);
            expect((tracing as any).currentId).toBe(r1.id);
        }
    });

    test("should handle branching history", () => {
        const r1 = new MockRecord("1");
        const r2 = new MockRecord("2");

        // Push r1
        history.add(r1);
        tracing.push(r1);

        // Undo r1 (back to root)
        history.undo();
        tracing.undo();

        // Push r2 (branching from root)
        history.add(r2);
        tracing.push(r2);

        expect((tracing as any).currentId).toBe(r2.id);

        // TODO: Fix
        // const nodes = tracing.serialize();
        // const r1Node = nodes[r1.id];
        // const r2Node = nodes[r2.id];
        // const rootId = r1Node.parentId;

        // expect(rootId).toBeDefined();
        // expect(r2Node.parentId).toBe(rootId);

        // // Verify root has both children
        // if (rootId) {
        //     const rootNode = nodes[rootId];
        //     expect(rootNode.children).toContain(r1.id);
        //     expect(rootNode.children).toContain(r2.id);
        // }
    });
});
