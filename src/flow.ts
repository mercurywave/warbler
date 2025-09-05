import { Nil } from "./util";

let __tree: Route;
let __allRoutes: Route[] = [];
let __scheduled: boolean = false;

export namespace Flow {

    export function Init(root: HTMLElement, builder: (route: Route) => void): HTMLElement {
        __allRoutes = [];
        __tree = new Route(null, root);
        builder(__tree);
        if (!__tree._root) throw 'no document root';
        Reflow();
        return __tree._root;
    }

    export function Dirty() {
        if (!__scheduled) {
            __scheduled = true;
            requestAnimationFrame(() => {
                __scheduled = false;
                Reflow();
            });

        }
    }

    export function Reflow(from?: Route) {
        let index = 0;

        let routes = [...__allRoutes];
        if (from) {
            routes = routes.filter(r => r.isDescendedFrom(from));
        }
        let processed: Route[] = [];
        let more: boolean = true;
        while (more) {
            index++;
            routes.sort((a, b) => a._depth - b._depth);
            let checksum = __allRoutes.length;
            for (const route of routes) {
                route._flow();
                processed.push(route);
            }
            more = __allRoutes.length > checksum; // more nodes added
            routes = __allRoutes.filter(r => !processed.includes(r));

            if (index > 9999) {
                console.error("Flow.Reflow is probably in an infinite loop!");
                break;
            }
        }
        setTimeout(() => {
            Cleanup();
        }, 0);
    }

    export function Cleanup() {
        __allRoutes = __allRoutes.filter(r => r._isConnected);
    }
}

type ListOrBound<T> = T[] | (() => T[]);

export class Route {
    private _ancestor: Route | null;
    public _depth: number;
    public _boundValue: any;
    public _root: HTMLElement | Nil = null;
    private _actions: (() => void)[] = [];
    private _arrays: BoundList<any>[] = [];

    constructor(ancestor: Route | null, root: HTMLElement | Nil, boundValue?: any) {
        this._ancestor = ancestor;
        this._root = root;
        this._depth = (ancestor?._depth ?? 0) + 1;
        this._boundValue = boundValue;
        __allRoutes.push(this);
    }

    public bind(action: () => void) {
        this._actions.push(action);
    }

    public root<T extends HTMLElement>(elemName: keyof HTMLElementTagNameMap, props?: Partial<T>): T {
        if (this._root) throw 'root already set';
        let root = document.createElement(elemName) as T;
        this._applyProps(root, props);
        this._root = root;
        return root;
    }

    public child<T extends HTMLElement>(elemName: keyof HTMLElementTagNameMap, props?: Partial<T>): T {
        if (!this._root) throw 'root not set';
        let elem = document.createElement(elemName) as T;
        this._applyProps(elem, props);
        this._root.appendChild(elem);
        return elem;
    }

    public elem<T extends HTMLElement>(parent: HTMLElement | Nil, elemName: keyof HTMLElementTagNameMap, props?: Partial<T>): T {
        if (!parent) parent = this._root;
        if(!parent) throw 'could not place elem';
        let elem = document.createElement(elemName) as T;
        this._applyProps(elem, props);
        parent.appendChild(elem);
        return elem;
    }

    public applyProps<T>(props: Partial<T>) {
        if (!this._root) throw 'root not set';
        this._applyProps(this._root, props);
    }

    private _applyProps<T>(elem: HTMLElement, props?: Partial<T>) {
        if (props) {
            for (const [key, value] of Object.entries(props)) {
                // @ts-ignore: TypeScript can't guarantee all keys exist on T
                elem[key] = value;
            }
        }
    }

    public conditional(host: HTMLElement, ifRender: () => boolean, builder: (route: Route) => void) {
        let state = { rendered: false };
        this.bind(() => {
            if (ifRender()) {
                if (!state.rendered) {
                    this.bindCtl(builder, host);
                    state.rendered = true;
                }
            } else {
                state.rendered = false;
                host.innerHTML = '';
            }
        });
    }

    public conditionalStyle(host: HTMLElement, style: string, ifApply: () => boolean) {
        this.bind(() => {
            host.classList.toggle(style, ifApply());
        });
    }

    public bindCtl(builder: (route: Route) => void, parent?: HTMLElement) {
        if (!this._root) throw 'root not set';
        let cRoute = new Route(this, parent);
        builder(cRoute);
        if (!cRoute._root) throw 'builder did not set an element';
        if (!parent) this._root.appendChild(cRoute._root);
    }

    // bind to an object that might be swapped out, like a view
    public bindObject<T>(getter: () => (T | null), handler: (route: Route, elem: T) => void, host?: HTMLElement | null): BoundList<T> {
        return this.bindArray(() => {
            let obj = getter();
            if (obj) return [obj];
            return [];
        }, handler, host);
    }

    public stampArray<T>(list: ListOrBound<T>, handler: (elem: T) => HTMLElement | null, host?: HTMLElement | null) {
        // more lightweight way to stamp out simple bindings, like option elements in a select
        // CAUTION: this might be ill-concieved. If you use anything that can change internally, this skips a re-render.
        if (!host) host = this._root;
        if (!host) throw 'could not seat array';
        let state: T[] = [];
        this.bind(() => {
            let goal = (typeof list === "function") ? list() : list;
            if (goal.length == state.length && state.every((v, i) => v === goal[i]))
                return; // no changes needed
            state = goal;
            host.innerHTML = '';
            for (const obj of goal) {
                let elem = handler(obj);
                if (elem !== null)
                    host.appendChild(elem);
            }
        });
    }

    public bindArray<T>(list: ListOrBound<T>, handler: (route: Route, elem: T) => void, host?: HTMLElement | null): BoundList<T> {
        if (!host) host = this._root;
        if (!host) throw 'could not seat array';
        let arr = new BoundList(this, host, list, handler);
        this._arrays.push(arr);
        arr.sync();
        return arr;
    }

    public get _isConnected(): boolean { return this._root?.isConnected ?? false };
    public _flow() {
        if (!this._isConnected) { return; }
        for (const list of this._arrays) {
            list.sync();
        }
        for (const bind of this._actions) {
            bind();
        }
    }

    public isDescendedFrom(route: Route): boolean {
        if (this._ancestor == route) return true;
        if (this._ancestor?.isDescendedFrom(route)) return true;
        return false;
    }
}

export class BoundList<T> {
    private __list: ListOrBound<T>;
    private __bound: Route[] = [];
    private __parent: Route;
    private __container: HTMLElement
    private __handler: (route: Route, elem: any) => void;
    private __delayMs: number = 0;
    private __deleteClass: string = "";
    private __delaySlide: number = 0;

    public constructor(parent: Route, container: HTMLElement, list: ListOrBound<T>, handler: (route: Route, elem: any) => void) {
        this.__parent = parent;
        this.__container = container;
        this.__list = list;
        this.__handler = handler;
    }
    private getList(): T[] {
        return (typeof this.__list === "function") ? this.__list() : this.__list;
    }
    public sync() {
        if (this.isInSync()) return;
        let bound = [...this.__bound];

        let goal: Route[] = [];
        let children: HTMLElement[] = [];
        for (const o of this.getList()) {
            let route = bound.find(r => r._boundValue === o);
            if (route)
                bound = bound.filter(r => r !== route);
            else {
                route = new Route(this.__parent, null, o);
                this.__handler(route, o);
            }
            if (route._root) {
                children.push(route._root);
                goal.push(route);
            }
        }
        this.replaceChildrenPreserving(this.__container, children);
        this.__bound = goal;
    }
    private isInSync() {
        let goal = this.getList();
        if (goal.length != this.__bound.length) return false;
        for (let index = 0; index < this.__bound.length; index++) {
            const route = this.__bound[index];
            if (route._boundValue != goal[index]) return false;
        }
        return true;
    }

    public setAnimRemoval(msDelay: number, className: string) {
        this.__delayMs = msDelay;
        this.__deleteClass = className;
    }

    private replaceChildrenPreserving<T extends HTMLElement>(
        parent: HTMLElement,
        newChildren: T[]
    ): void {
        const existing = Array.from(parent.children) as T[];
        const firstRects = existing.map(el => el.getBoundingClientRect());

        // Remove any children not in the new list
        for (const child of existing) {
            if (!newChildren.includes(child)) {
                if (this.__delayMs > 0) { // animated delay
                    child.classList.add(this.__deleteClass);
                    setTimeout(() => child.remove(), this.__delayMs);
                }
                else parent.removeChild(child);
            }
        }

        // Insert or reorder new children
        newChildren.forEach((child, i) => {
            const current = parent.children[i];
            if (current !== child) {
                parent.insertBefore(child, current ?? null);
            }
        });
    }
}
