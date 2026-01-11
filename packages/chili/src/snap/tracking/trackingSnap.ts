// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Config,
    EdgeMeshData,
    I18n,
    type IDocument,
    type ISubEdgeShape,
    IView,
    type Line,
    LineType,
    Precision,
    ShapeType,
    VisualConfig,
    XY,
    type XYZ,
} from "chili-core";
import type { ISnap, MouseAndDetected, SnapResult } from "../";
import type { Axis } from "./axis";
import { AxisTracking } from "./axisTracking";
import { ObjectTracking } from "./objectTracking";

export interface TrackingData {
    axis: Axis;
    point: XYZ;
    isObjectTracking: boolean;
    distance: number;
    info: string;
}

export class TrackingSnap implements ISnap {
    private readonly _axisTracking: AxisTracking;
    private readonly _objectTracking: ObjectTracking;
    private readonly _tempLines: Map<IView, number[]> = new Map();

    constructor(
        readonly referencePoint: (() => XYZ) | undefined,
        trackingAxisZ: boolean,
    ) {
        this._axisTracking = new AxisTracking(trackingAxisZ);
        this._objectTracking = new ObjectTracking(trackingAxisZ);
        Config.instance.onPropertyChanged(this.onSnapTypeChanged);
    }

    readonly handleSnapped = (document: IDocument, snapped?: SnapResult) => {
        if (Config.instance.enableSnapTracking) {
            this._objectTracking.showTrackingAtTimeout(document, snapped);
        }
    };

    snap(data: MouseAndDetected): SnapResult | undefined {
        if (!Config.instance.enableSnapTracking) return undefined;

        const trackingData = this.detectTracking(data.view, data.mx, data.my);
        if (trackingData.length === 0) return undefined;
        trackingData.sort((x) => x.distance);
        const snapped = this.shapeIntersectTracking(data, trackingData);
        if (snapped !== undefined) return snapped;
        if (trackingData.length === 1) {
            return this.getSnappedAndShowTracking(data.view, trackingData[0].point, [trackingData[0]]);
        }
        return (
            this.trackingIntersectTracking(data.view, trackingData) ??
            this.getSnappedAndShowTracking(data.view, trackingData[0].point, [trackingData[0]])
        );
    }

    private trackingIntersectTracking(view: IView, trackingData: TrackingData[]) {
        const point = trackingData[0].axis.intersect(trackingData[1].axis);
        return point
            ? this.getSnappedAndShowTracking(view, point, [trackingData[0], trackingData[1]])
            : undefined;
    }

    private getSnappedAndShowTracking(view: IView, point: XYZ, trackingData: TrackingData[]): SnapResult {
        const lines: number[] = trackingData
            .map((x) => this.showTempLine(view, x.axis.point, point))
            .filter((id) => id !== undefined);
        this._tempLines.set(view, lines);

        let info: string | undefined;
        let distance: number | undefined;
        if (trackingData.length === 1) {
            distance = point.distanceTo(trackingData[0].axis.point);
            info = trackingData[0].axis.name;
        } else if (trackingData.length === 2) {
            info = I18n.translate("snap.intersection");
        }
        const refPoint = trackingData[0].axis.point;
        return { view, point, info, shapes: [], refPoint, distance };
    }

    private showTempLine(view: IView, start: XYZ, end: XYZ): number | undefined {
        const vector = end.sub(start);
        const normal = vector.normalize();
        if (!normal) return undefined;
        const distance = Math.min(vector.length() * 1e10, 1e20);
        const newEnd = start.add(normal.multiply(distance));
        const lineData = EdgeMeshData.from(start, newEnd, VisualConfig.temporaryEdgeColor, LineType.Dash);
        return view.document.visual.context.displayMesh([lineData]);
    }

    private shapeIntersectTracking(
        data: MouseAndDetected,
        trackingData: TrackingData[],
    ): SnapResult | undefined {
        if (data.shapes.length === 0 || data.shapes[0].shape.shapeType !== ShapeType.Edge) return undefined;
        const point = this.findIntersection(data, trackingData);
        if (!point) return undefined;
        const id = this.showTempLine(data.view, point.location, point.intersect);
        if (id === undefined) return undefined;
        this._tempLines.set(data.view, [id]);
        return {
            view: data.view,
            point: point.intersect,
            info: I18n.translate("snap.intersection"),
            shapes: [data.shapes[0]],
        };
    }

    private findIntersection(data: MouseAndDetected, trackingData: TrackingData[]) {
        const edge = data.shapes[0].shape as ISubEdgeShape;
        const points: { intersect: XYZ; location: XYZ }[] = [];
        trackingData.forEach((x) => {
            edge.intersect(x.axis).forEach((p) => {
                points.push({ intersect: p.point, location: x.axis.point });
            });
        });
        points.sort((p) => IView.screenDistance(data.view, data.mx, data.my, p.intersect));
        return points.at(0);
    }

    private detectTracking(view: IView, x: number, y: number) {
        const data: TrackingData[] = [];
        if (this.referencePoint) {
            const axes = this._axisTracking.getAxes(view, this.referencePoint());
            data.push(...this.getSnappedFromAxes(axes, view, x, y));
        }
        const objectTrackingRays = this._objectTracking.getTrackingRays(view);
        objectTrackingRays.forEach((a) => {
            data.push(...this.getSnappedFromAxes(a.axes, view, x, y, a.objectName));
        });
        return data;
    }

    private getSnappedFromAxes(axes: Axis[], view: IView, x: number, y: number, snappedName?: string) {
        const result: TrackingData[] = [];
        for (const axis of axes) {
            const distance = this.rayDistanceAtScreen(view, x, y, axis);
            if (distance < Config.instance.SnapDistance) {
                const ray = view.rayAt(x, y);
                const point = axis.nearestTo(ray.toLine());
                if (point.sub(axis.point).dot(axis.direction) < 0) continue;
                result.push({
                    axis,
                    distance,
                    point,
                    info: snappedName ?? axis.name,
                    isObjectTracking: snappedName !== undefined,
                });
            }
        }
        return result;
    }

    private rayDistanceAtScreen(view: IView, x: number, y: number, axis: Line): number {
        const start = view.worldToScreen(axis.point);
        const vector = new XY(x - start.x, y - start.y);
        if (vector.isEqualTo(XY.zero)) return 0;
        const end = view.worldToScreen(axis.point.add(axis.direction.multiply(100000)));
        if (start.distanceTo(end) < Precision.Float) return vector.length();
        const dir = end.sub(start).normalize()!;
        const dot = vector.dot(dir);
        return Math.sqrt(vector.lengthSq() - dot * dot);
    }

    removeDynamicObject(): void {
        this._tempLines.forEach((v, k) => {
            v.forEach((id) => {
                k.document.visual.context.removeMesh(id);
            });
        });
        this._tempLines.clear();
    }

    private readonly onSnapTypeChanged = (property: keyof Config): void => {
        if (property === "snapType" || property === "enableSnapTracking" || property === "enableSnap") {
            this.removeDynamicObject();
            this._objectTracking.clear();
            this._axisTracking.clear();
        }
    };

    clear(): void {
        this.removeDynamicObject();
        this._axisTracking.clear();
        this._objectTracking.clear();
        Config.instance.removePropertyChanged(this.onSnapTypeChanged);
    }
}
