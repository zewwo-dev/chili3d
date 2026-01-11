// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type I18nKeys, Localize } from "chili-core";
import { div, label, setSVGIcon, svg } from "../controls";
import style from "./expander.module.css";

export class Expander extends HTMLElement {
    private _isExpanded = true;
    private readonly expanderIcon: SVGSVGElement;
    private readonly headerPanel: HTMLDivElement;
    readonly contextPanel = div({ className: style.contextPanel });

    constructor(header: I18nKeys) {
        super();
        this.headerPanel = div({ className: style.headerPanel, onclick: this._handleExpanderClick });
        this.className = style.rootPanel;
        this.expanderIcon = svg({
            icon: this.getExpanderIcon(),
            className: style.expanderIcon,
        });
        const text = label({
            textContent: new Localize(header),
            className: style.headerText,
        });
        this.headerPanel.append(this.expanderIcon, text);
        super.append(this.headerPanel, this.contextPanel);
    }

    override appendChild<T extends Node>(node: T): T {
        return this.contextPanel.appendChild(node);
    }

    override append(...nodes: Node[]): void {
        this.contextPanel.append(...nodes);
    }

    override removeChild<T extends Node>(child: T): T {
        return this.contextPanel.removeChild(child);
    }

    addItem(...nodes: Node[]) {
        this.append(...nodes);
        return this;
    }

    private getExpanderIcon() {
        return this._isExpanded ? "icon-angle-down" : "icon-angle-right";
    }

    private readonly _handleExpanderClick = (e: MouseEvent) => {
        e.stopPropagation();
        this._isExpanded = !this._isExpanded;
        setSVGIcon(this.expanderIcon, this.getExpanderIcon());
        this.contextPanel.classList.toggle(style.hidden, !this._isExpanded);
    };
}

customElements.define("chili-expander", Expander);
