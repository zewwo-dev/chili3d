// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, type GeometryNode, Precision, Property, type XYZ } from "chili-core";
import { LineNode } from "../../bodies";
import { Dimension, type PointSnapData } from "../../snap";
import { type IStep, PointStep } from "../../step";
import { CreateCommand } from "../createCommand";

@command({
    key: "create.line",
    icon: "icon-line",
})
export class Line extends CreateCommand {
    @Property.define("option.command.isConnected", {
        dependencies: [{ property: "repeatOperation", value: true }],
    })
    get isContinue() {
        return this.getPrivateValue("isContinue", false);
    }
    set isContinue(value: boolean) {
        this.setProperty("isContinue", value);
    }

    protected override geometryNode(): GeometryNode {
        return new LineNode(this.document, this.stepData[0].point!, this.stepData[1].point!);
    }

    getSteps(): IStep[] {
        const firstStep = new PointStep("prompt.pickFistPoint");
        const secondStep = new PointStep("prompt.pickNextPoint", this.getSecondPointData);
        return [firstStep, secondStep];
    }

    protected override resetStepData() {
        if (this.isContinue) {
            this.stepData[0] = this.stepData[1];
            this.stepData.length = 1;
        } else {
            this.stepData.length = 0;
        }
    }

    private readonly getSecondPointData = (): PointSnapData => {
        return {
            refPoint: () => this.stepData[0].point!,
            dimension: Dimension.D1D2D3,
            validator: (point: XYZ) => {
                return this.stepData[0].point!.distanceTo(point) > Precision.Distance;
            },
            preview: this.linePreview,
        };
    };

    private readonly linePreview = (point: XYZ | undefined) => {
        if (!point) {
            return [this.meshPoint(this.stepData[0].point!)];
        }
        return [this.meshPoint(this.stepData[0].point!), this.meshLine(this.stepData[0].point!, point)];
    };
}
