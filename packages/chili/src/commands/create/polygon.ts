// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AsyncController,
    command,
    EdgeMeshDataBuilder,
    type GeometryNode,
    I18n,
    Precision,
    Property,
    type ShapeMeshData,
    type XYZ,
} from "chili-core";
import { PolygonNode } from "../../bodies";
import { Dimension, type PointSnapData, type SnapResult } from "../../snap";
import { type IStep, PointStep } from "../../step";
import { CreateFaceableCommand } from "../createCommand";

@command({
    key: "create.polygon",
    icon: "icon-toPoly",
})
export class Polygon extends CreateFaceableCommand {
    @Property.define("common.confirm")
    readonly confirm = () => {
        this.controller?.success();
    };

    protected override geometryNode(): GeometryNode {
        const node = new PolygonNode(
            this.document,
            this.stepData.map((step) => step.point!),
        );
        node.isFace = this.isFace;
        return node;
    }

    protected override async executeSteps(): Promise<boolean> {
        const steps = this.getSteps();
        let firstStep = true;
        while (true) {
            const step = firstStep ? steps[0] : steps[1];
            if (firstStep) firstStep = false;
            this.controller = new AsyncController();
            const data = await step.execute(this.document, this.controller);
            if (data === undefined) {
                return this.controller.result?.status === "success";
            }
            this.stepData.push(data);
            if (this.isClose(data)) {
                return true;
            }
        }
    }

    private isClose(data: SnapResult) {
        return (
            this.stepData.length > 1 && this.stepData[0].point!.distanceTo(data.point!) <= Precision.Distance
        );
    }

    protected override getSteps(): IStep[] {
        const firstStep = new PointStep("prompt.pickFistPoint");
        const secondStep = new PointStep("prompt.pickNextPoint", this.getNextData);
        return [firstStep, secondStep];
    }

    private readonly getNextData = (): PointSnapData => {
        return {
            refPoint: () => this.stepData.at(-1)!.point!,
            dimension: Dimension.D1D2D3,
            validator: this.validator,
            preview: this.preview,
            featurePoints: [
                {
                    point: this.stepData.at(0)!.point!,
                    prompt: I18n.translate("prompt.polygon.close"),
                    when: () => this.stepData.length > 2,
                },
            ],
        };
    };

    private readonly preview = (point: XYZ | undefined): ShapeMeshData[] => {
        const ps = this.stepData.map((data) => this.meshPoint(data.point!));
        const edges = new EdgeMeshDataBuilder();
        this.stepData.forEach((data) => edges.addPosition(data.point!.x, data.point!.y, data.point!.z));
        if (point) {
            edges.addPosition(point.x, point.y, point.z);
        }
        return [...ps, edges.build()];
    };

    private readonly validator = (point: XYZ): boolean => {
        for (const data of this.stepData) {
            if (point.distanceTo(data.point!) < 0.001) {
                return false;
            }
        }
        return true;
    };
}
