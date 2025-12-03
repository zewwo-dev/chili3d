import { v4 as uuidv4 } from "uuid";
import { NodeSerializer } from "../model";
import { Serializer } from "../serialize";
import { IDisposable } from "./disposable";
import {
    ArrayRecord,
    History,
    IHistoryRecord,
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

/**
 * Manages the user-operations tracing tree.
 *
 * @remarks Hooked to {@link History} and {@link Transaction}
 *
 * @beta
 */
export class Tracing implements IDisposable {
    private nodes: Map<NodeId, TracingNode> = new Map();
    private currentId: NodeId;

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

    /** Logs the current state for debugging. */
    update() {
        console.log(this.serialize());
        console.log(this.nodes);
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

        this.update();
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
            let record = node.data;
            if (record != null) {
                record = RecordSerializer.serializeRecord(record);
            }
            node.data = record;

            nodes.push(node);
        });
        return nodes;
    }

    dispose() {
        this.nodes.clear();
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
                base.type = "node";
                break;
            case ArrayRecord:
                base.type = "array";
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
                    oldParent: r.oldParent ? NodeSerializer.serialize(r.oldParent) : undefined,
                    newParent: r.newParent ? NodeSerializer.serialize(r.newParent) : undefined,
                    oldPrevious: r.oldPrevious ? NodeSerializer.serialize(r.oldPrevious) : undefined,
                    newPrevious: r.newPrevious ? NodeSerializer.serialize(r.newPrevious) : undefined,
                })),
            };
        }

        // Handle ArrayRecord
        if (record instanceof ArrayRecord) {
            return {
                ...base,
                records: record.records.map((r) => serializeRecord(r)),
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
