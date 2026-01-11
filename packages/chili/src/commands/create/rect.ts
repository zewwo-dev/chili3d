// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Config, command, type GeometryNode, MathUtils, Plane, Property, type XYZ } from "chili-core";
import { ViewUtils } from "chili-vis";
import { RectNode } from "../../bodies";
import type { SnapLengthAtPlaneData, SnapResult } from "../../snap";
import { type IStep, LengthAtPlaneStep, PointStep } from "../../step";
import { CreateCommand } from "../createCommand";

export interface RectData {
    plane: Plane;
    dx: number;
    dy: number;
    p1: XYZ;
    p2: XYZ;
}

export namespace RectData {
    export function get(atPlane: Plane, start: XYZ, end: XYZ): RectData {
        const plane = new Plane(start, atPlane.normal, atPlane.xvec);
        const vector = end.sub(start);
        const dx = vector.dot(plane.xvec);
        const dy = vector.dot(plane.yvec);
        return { plane, dx, dy, p1: start, p2: end };
    }
}

export abstract class RectCommandBase extends CreateCommand {
    protected getSteps(): IStep[] {
        return [
            new PointStep("prompt.pickFistPoint"),
            new LengthAtPlaneStep("prompt.pickNextPoint", this.nextSnapData),
        ];
    }

    private readonly nextSnapData = (): SnapLengthAtPlaneData => {
        const { point, view } = this.stepData[0];
        return {
            point: () => point!,
            preview: this.previewRect,
            plane: (tmp: XYZ | undefined) => this.findPlane(view, point!, tmp),
            validator: this.handleValid,
            prompt: (snapped: SnapResult) => {
                const data = this.rectDataFromTemp(snapped.point!);
                return `${data.dx.toFixed(2)}, ${data.dy.toFixed(2)}`;
            },
        };
    };

    private readonly handleValid = (end: XYZ) => {
        const data = this.rectDataFromTemp(end);
        return data !== undefined && !MathUtils.anyEqualZero(data.dx, data.dy);
    };

    protected previewRect = (end: XYZ | undefined) => {
        if (end === undefined) return [this.meshPoint(this.stepData[0].point!)];
        const { plane, dx, dy } = this.rectDataFromTemp(end);

        return [
            this.meshPoint(this.stepData[0].point!),
            this.meshPoint(end),
            this.meshCreatedShape("rect", plane, dx, dy),
        ];
    };

    protected rectDataFromTemp(tmp: XYZ): RectData {
        const { view, point } = this.stepData[0];
        const plane = Config.instance.dynamicWorkplane
            ? ViewUtils.raycastClosestPlane(view, point!, tmp)
            : this.stepData[0].view.workplane.translateTo(point!);
        return RectData.get(plane, point!, tmp);
    }

    protected rectDataFromTwoSteps() {
        let rect: RectData;
        if (this.stepData[1].plane) {
            rect = RectData.get(this.stepData[1].plane, this.stepData[0].point!, this.stepData[1].point!);
        } else {
            rect = this.rectDataFromTemp(this.stepData[1].point!);
        }
        return rect;
    }
}

@command({
    key: "create.rect",
    icon: "icon-rect",
})
export class Rect extends RectCommandBase {
    @Property.define("option.command.isFace")
    public get isFace() {
        return this.getPrivateValue("isFace", false);
    }
    public set isFace(value: boolean) {
        this.setProperty("isFace", value);
    }

    protected override geometryNode(): GeometryNode {
        const { plane, dx, dy } = this.rectDataFromTwoSteps();
        const node = new RectNode(this.document, plane, dx, dy);
        node.isFace = this.isFace;
        return node;
    }
}
