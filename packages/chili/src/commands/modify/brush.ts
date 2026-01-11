// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, GeometryNode, type ISubFaceShape, Property, ShapeType, Transaction } from "chili-core";
import { type IStep, SelectNodeStep, SelectShapeStep } from "../../step";
import { MultistepCommand } from "../multistepCommand";

@command({
    key: "modify.brushAdd",
    icon: "icon-addBrush",
})
export class AddBrushCommand extends MultistepCommand {
    @Property.define("common.material", { type: "materialId" })
    get materialId(): string {
        return this.getPrivateValue("materialId", this.document.modelManager.materials.at(0)?.id);
    }
    set materialId(value: string) {
        this.setProperty("materialId", value);
    }

    protected override getSteps(): IStep[] {
        return [new SelectShapeStep(ShapeType.Face, "prompt.select.faces", { multiple: true })];
    }
    protected override executeMainTask(): void {
        const nodeMaterialMap = new Map<GeometryNode, { faceIndex: number; materialId: string }[]>();

        this.stepData[0].shapes.forEach((x) => {
            if (x.owner.node instanceof GeometryNode) {
                if (!nodeMaterialMap.has(x.owner.node)) {
                    nodeMaterialMap.set(x.owner.node, []);
                }
                nodeMaterialMap.get(x.owner.node)!.push({
                    faceIndex: (x.shape as ISubFaceShape).index,
                    materialId: this.materialId,
                });
            }
        });

        Transaction.execute(this.document, "add face material", () => {
            nodeMaterialMap.forEach((value, key) => {
                key.addFaceMaterial(value);
            });
        });

        this.document.visual.update();
    }
}

@command({
    key: "modify.brushRemove",
    icon: "icon-removeBrush",
})
export class RemoveBrushCommand extends MultistepCommand {
    protected override getSteps(): IStep[] {
        return [new SelectShapeStep(ShapeType.Face, "prompt.select.faces", { multiple: true })];
    }

    protected override executeMainTask(): void {
        const nodeMaterialMap = new Map<GeometryNode, number[]>();

        this.stepData[0].shapes.forEach((x) => {
            if (x.owner.node instanceof GeometryNode) {
                if (!nodeMaterialMap.has(x.owner.node)) {
                    nodeMaterialMap.set(x.owner.node, []);
                }
                nodeMaterialMap.get(x.owner.node)!.push((x.shape as ISubFaceShape).index);
            }
        });

        Transaction.execute(this.document, "remove face material", () => {
            nodeMaterialMap.forEach((value, key) => {
                key.removeFaceMaterial(value);
            });
        });

        this.document.visual.update();
    }
}

@command({
    key: "modify.brushClear",
    icon: "icon-clearBrush",
})
export class ClearBrushCommand extends MultistepCommand {
    protected override getSteps(): IStep[] {
        return [new SelectNodeStep("prompt.select.shape", { multiple: true, keepSelection: true })];
    }

    protected override executeMainTask(): void {
        Transaction.execute(this.document, "clear face material", () => {
            this.stepData[0].nodes?.forEach((x) => {
                if (x instanceof GeometryNode) {
                    x.clearFaceMaterial();
                }
            });
        });

        this.document.visual.update();
    }
}
