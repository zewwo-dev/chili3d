import { v4 as uuidv4 } from "uuid";
import { NodeSerializer } from "../model";
import { Serializer } from "../serialize";
import type { IDisposable } from "./disposable";
import {
    ArrayRecord,
    History,
    type IHistoryRecord,
    NodeAction,
    NodeLinkedListHistoryRecord,
    PropertyHistoryRecord,
} from "./history";
import { Transaction } from "./transaction";

export type NodeId = string;

export interface TracingNode {
    id: NodeId;
    parentId: NodeId | null;
    children: NodeId[];
    meta?: { timestamp: number; label?: string };
    data?: IHistoryRecord;
}

export interface TracingDiff {
    parentId: NodeId;
    change: TracingNode;
}

/**
 * Manages the user-operations tracing tree.
 *
 * @remarks Hooked to {@link History} and {@link Transaction}
 *
 * @beta
 */
export class Tracing implements IDisposable {
    // biome-ignore lint/correctness/noInvalidUseBeforeDeclaration: <explanation>
    private readonly traceUploader: TraceUploader = new TraceUploader(this);
    private nodes: Map<NodeId, TracingNode> = new Map();
    private currentId: NodeId;

    get tree() {
        return this.nodes;
    }

    /**
     * Creates a new Tracing instance.
     *
     * @param data - Initial IHistoryRecord. Leave empty for new documents.
     * @param parent - Parent node ID.
     */
    constructor(data?: IHistoryRecord, parent?: NodeId) {
        const root: TracingNode = {
            id: uuidv4(),
            parentId: null,
            children: [],
            meta: { timestamp: Date.now() },
        };
        this.nodes.set(root.id, root);
        this.currentId = root.id;
    }

    update(change?: TracingNode) {
        console.log(this.serialize());
        console.log(this.nodes);

        if (change == null) return;

        this.traceUploader.commitChange(this.serialize_one(change));
    }

    /**
     * Adds a new history record as a child of the current node.
     */
    push(data: IHistoryRecord) {
        const node: TracingNode = {
            id: data.id,
            parentId: this.currentId,
            children: [],
            meta: { timestamp: Date.now() },
            data: data,
        };

        // Add child id into parent
        this.nodes.get(this.currentId)?.children.push(data.id);
        this.nodes.set(data.id, node);
        this.currentId = node.id;

        this.update(node);
    }

    /**
     * Is run when user calls undo.
     */
    undo() {
        const node = this.nodes.get(this.currentId)!;

        if (node.parentId != null) this.currentId = node.parentId;

        this.update();
    }

    /**
     * Is run when user calls redo.
     */
    redo(childId: NodeId) {
        this.currentId = childId;
        this.update();
    }

    /**
     * Serializes the tracing tree into a plain object.
     */
    serialize() {
        const nodes: TracingNode[] = [];
        this.nodes.forEach((node, id) => {
            nodes.push(this.serialize_one(node));
        });
        return nodes;
    }

    serialize_one(node: TracingNode) {
        const nodeCopy = { ...node };
        let record = node.data;
        if (record != null) {
            record = RecordSerializer.serializeRecord(record);
        }
        nodeCopy.data = record;
        return nodeCopy;
    }

    dispose() {
        this.nodes.clear();
    }
}

export class TraceUploader {
    private readonly tracing: Tracing;
    private readonly endpoint: string = "http://localhost:3000/data"; // TODO: Change in production
    private synced: boolean = false; // TODO: Implement syncing by time interval
    private lastSyncedId: string = ""; // Right-most tree node id
    private changes: TracingDiff[] = [];

    constructor(tracing: Tracing) {
        this.tracing = tracing;
    }

    /**
     * Syncs with the remote database
     */
    private async syncData() {
        if (this.lastSyncedId.length === 0) {
            return this.createData();
        }

        try {
            const res = await fetch(this.endpoint, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    // ID of root node. Primary key in backend database.
                    rootId: this.tracing.tree.entries().next().value?.[1].id,
                    commits: this.changes,
                }),
            });

            if (!res.ok) return false;
            this.lastSyncedId = this.changes[this.changes.length - 1].change.id;
            this.changes = [];
            this.synced = true;
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    /**
     * Creates a new row in the database by POSTing the entirety of Tracing data
     *
     * @remarks
     * Ran only once during the life of a Tracing instance
     */
    private async createData(): Promise<boolean> {
        const serializedData = this.tracing.serialize();

        try {
            const res = await fetch(this.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ id: serializedData[0].id, payload: serializedData }),
            });

            if (!res.ok && res.status !== 409) return false;

            this.synced = true;
            this.lastSyncedId = serializedData[serializedData.length - 1].id;
            this.changes = [];
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    private async getLatestData() {
        await fetch(this.endpoint, {
            method: "GET",
        });
    }

    public commitChange(change: TracingNode) {
        this.changes.push({ parentId: change.parentId as string, change: change });
        this.synced = false;
        this.syncData();
    }
}

export namespace RecordSerializer {
    export function serializeRecord(record: IHistoryRecord): any {
        const base = {
            name: record.name,
            type: record.constructor.name,
        };

        switch (record.constructor) {
            case PropertyHistoryRecord:
                base.type = "property";
                break;
            case NodeLinkedListHistoryRecord:
                base.type = "shape";
                break;
            case ArrayRecord:
                base.type = "list";
                break;
            default:
                break;
        }

        // Handle PropertyHistoryRecord
        if (record instanceof PropertyHistoryRecord) {
            return {
                ...base,
                property: String(record.property),
                oldValue: serializeValue(record.oldValue),
                newValue: serializeValue(record.newValue),
                object: serializeObject(record.object),
            };
        }

        // Handle NodeLinkedListHistoryRecord
        if (record instanceof NodeLinkedListHistoryRecord) {
            return {
                ...base,
                records: record.records.map((r) => ({
                    action: NodeAction[r.action],
                    node: NodeSerializer.serialize(r.node),
                    oldParent: r.oldParent ? NodeSerializer.serialize(r.oldParent, false)[0] : undefined,
                    newParent: r.newParent ? NodeSerializer.serialize(r.newParent, false)[0] : undefined,
                    oldPrevious: r.oldPrevious
                        ? NodeSerializer.serialize(r.oldPrevious, false)[0]
                        : undefined,
                    newPrevious: r.newPrevious
                        ? NodeSerializer.serialize(r.newPrevious, false)[0]
                        : undefined,
                })),
            };
        }

        // Handle ArrayRecord
        if (record instanceof ArrayRecord) {
            return {
                ...base,
                events: record.records.map((r) => serializeRecord(r)),
            };
        }

        return base;
    }

    export function serializeValue(value: any): any {
        if (value === null || value === undefined) return value;
        if (typeof value === "object") {
            // Try to get ID if it's an object with an id property
            if ("id" in value) return { id: value.id, type: value.constructor?.name };
            // For other objects, return a summary
            return { type: value.constructor?.name, stringified: String(value) };
        }
        return value;
    }

    export function serializeObject(obj: any): any {
        if (!obj) return undefined;
        try {
            // Try to serialize using Serializer if it's a registered object
            return Serializer.serializeObject(obj);
        } catch (error) {
            // Fallback: serialize basic properties
            if (typeof obj === "object") {
                const result: any = {
                    type: obj.constructor?.name || "Object",
                };
                // Include common properties
                if ("id" in obj) result.id = obj.id;
                if ("name" in obj) result.name = obj.name;
                // Try to get other serializable properties
                try {
                    const keys = Object.keys(obj);
                    for (const key of keys) {
                        if (key !== "parent" && key !== "previousSibling" && key !== "nextSibling") {
                            try {
                                result[key] = serializeValue(obj[key]);
                            } catch {
                                // Skip properties that can't be serialized
                            }
                        }
                    }
                } catch {
                    // If we can't enumerate keys, just return type and id
                }
                return result;
            }
            return obj;
        }
    }
}
