import { Nil } from "./util";

let __tree: Flow;
let __allFlows: Flow[] = [];
let __scheduled: boolean = false;


type ListOrBound<T> = T[] | (() => T[]);

export class Flow {

    public static Init(root: HTMLElement, builder: (flow: Flow) => void): HTMLElement {
        __allFlows = [];
        __tree = new Flow(null, root);
        builder(__tree);
        if (!__tree._root) throw 'no document root';
        Flow.Reflow();
        return __tree._root;
    }

    public static Dirty() {
        if (!__scheduled) {
            __scheduled = true;
            requestAnimationFrame(() => {
                __scheduled = false;
                Flow.Reflow();
            });
        }
    }

    public static Reflow(from?: Flow) {
        let index = 0;

        let flows = [...__allFlows];
        if (from) {
            flows = flows.filter(r => r.isDescendedFrom(from));
        }
        let processed: Flow[] = [];
        let more: boolean = true;
        while (more) {
            index++;
            flows.sort((a, b) => a._depth - b._depth);
            let checksum = __allFlows.length;
            for (const flow of flows) {
                flow._flow();
                processed.push(flow);
            }
            more = __allFlows.length > checksum; // more nodes added
            flows = __allFlows.filter(r => !processed.includes(r));

            if (index > 9999) {
                console.error("Flow.Reflow is probably in an infinite loop!");
                break;
            }
        }
        setTimeout(() => {
            Flow.Cleanup();
        }, 0);
    }

    public static Cleanup() {
        let toRemove = __allFlows.filter(r => !r._isConnected);
        for (const route of toRemove) {
            for (const clean of route._cleanupActions) {
                clean();
            }
        }
        __allFlows = __allFlows.filter(r => !toRemove.includes(r));
    }

    private _ancestor: Flow | null;
    public _depth: number;
    public _boundValue: any;
    public _root: HTMLElement | Nil = null;
    private _actions: (() => void)[] = [];
    private _cleanupActions: (() => void)[] = [];
    private _arrays: BoundList<any>[] = [];

    constructor(ancestor: Flow | null, root: HTMLElement | Nil, boundValue?: any) {
        this._ancestor = ancestor;
        this._root = root;
        this._depth = (ancestor?._depth ?? 0) + 1;
        this._boundValue = boundValue;
        __allFlows.push(this);
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
        if (!parent) throw 'could not place elem';
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

    public conditional(host: HTMLElement, ifRender: () => boolean, builder: (flow: Flow) => void) {
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

    public bindCtl(builder: (flow: Flow) => void, parent?: HTMLElement) {
        if (!this._root) throw 'root not set';
        let cFlow = new Flow(this, parent);
        builder(cFlow);
        if (!cFlow._root) throw 'builder did not set an element';
        if (!parent) this._root.appendChild(cFlow._root);
    }

    // bind to an object that might be swapped out, like a view
    public bindObject<T>(getter: () => (T | null), handler: (flow: Flow, elem: T) => void, host?: HTMLElement | null): BoundList<T> {
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

    public bindArray<T>(list: ListOrBound<T>, handler: (flow: Flow, elem: T) => void, host?: HTMLElement | null): BoundList<T> {
        if (!host) host = this._root;
        if (!host) throw 'could not seat array';
        let arr = new BoundList(this, host, list, handler);
        this._arrays.push(arr);
        arr.sync();
        return arr;
    }

    public routePage(host: HTMLElement | null, fixedPath?: string) {
        let state: string | Nil = null;
        this.bind(() => {
            let page = fixedPath ?? Route.GetUniqPage();
            if (page != state) {
                state = page;
                let flow = new Flow(this, host);
                Route.Render(flow);
            }
        });
    }

    public unwind(handler: () => void) {
        // calls handler when this router is destroyed
        this._cleanupActions.push(handler);
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

    public isDescendedFrom(flow: Flow): boolean {
        if (this._ancestor == flow) return true;
        if (this._ancestor?.isDescendedFrom(flow)) return true;
        return false;
    }
}

export class BoundList<T> {
    private __list: ListOrBound<T>;
    private __bound: Flow[] = [];
    private __parent: Flow;
    private __container: HTMLElement
    private __handler: (flow: Flow, elem: any) => void;
    private __delayMs: number = 0;
    private __deleteClass: string = "";
    private __delaySlide: number = 0;

    public constructor(parent: Flow, container: HTMLElement, list: ListOrBound<T>, handler: (flow: Flow, elem: any) => void) {
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

        let goal: Flow[] = [];
        let children: HTMLElement[] = [];
        for (const o of this.getList()) {
            let flow = bound.find(r => r._boundValue === o);
            if (flow)
                bound = bound.filter(r => r !== flow);
            else {
                flow = new Flow(this.__parent, null, o);
                this.__handler(flow, o);
            }
            if (flow._root) {
                children.push(flow._root);
                goal.push(flow);
            }
        }
        this.replaceChildrenPreserving(this.__container, children);
        this.__bound = goal;
    }
    private isInSync() {
        let goal = this.getList();
        if (goal.length != this.__bound.length) return false;
        for (let index = 0; index < this.__bound.length; index++) {
            const flow = this.__bound[index];
            if (flow._boundValue != goal[index]) return false;
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

// acts as a virtual page storing state in the URL
// you can only have one "page" at a time, with arbitrary optional sub-keys
// the key 'page' is used for main navigation
let __allRoutes: { [page: string]: Route } = {};
let __defaultRoute: Route;
type RouteHandler = (flow: Flow, path: { [key: string]: string }) => void;
type OnNavigateHandler = (path: { [key: string]: string }) => void;
export class Route {
    public static Register(page: string, handler: RouteHandler, onNavigate?: OnNavigateHandler, dflt?: boolean) {
        let route = new Route(page, handler, onNavigate);
        __allRoutes[page] = route;
        if (dflt) {
            if (__defaultRoute) throw 'double default register';
            __defaultRoute = route;
        }
    }

    public static LaunchHome() {
        Route._launch();
    }
    public static Launch(page: string, path?: { [key: string]: string }) {
        let route = __allRoutes[page];
        if (!route) throw `page does not exist ${page}`;
        Route._launch(page, path);
    }
    static _launch(page?: string, path?: { [key: string]: string }) {
        path ??= {};
        if (page) path['page'] = page;
        if (Route.updateUrl(path))
            Route.OnNavigate();
    }

    public static GetUniqPage(): string { return window.location.search; }

    static getCurrRoute(): [Route, path: { [key: string]: string }] {
        let path = this.parseUrl();
        let page = path["page"];
        let route = __allRoutes[page] ?? __defaultRoute;
        if (!route) throw 'default route not set';
        return [route, path];
    }

    public static OnNavigate() {
        let [route, path] = Route.getCurrRoute();
        if (route._onNavigate) route._onNavigate(path);
        Flow.Dirty();
    }

    public static Render(flow: Flow) {
        let [route, path] = Route.getCurrRoute();
        route.render(flow, path);
    }

    public static ErrorFallback() {
        console.trace(`falling back to default route from URL ${window.location.search} `);
        Route.updateUrl({});
        Flow.Dirty();
    }


    private _page: string;
    private _handler: RouteHandler;
    private _onNavigate?: OnNavigateHandler | Nil;

    constructor(page: string, handler: RouteHandler, onNavigate?: OnNavigateHandler) {
        this._page = page;
        this._handler = handler;
        this._onNavigate = onNavigate;
    }
    render(flow: Flow, path: { [key: string]: string }) {
        this._handler(flow, path);
    }



    static updateUrl(path: { [key: string]: string }): boolean {
        const url = new URL(window.location.href);
        const params = new URLSearchParams();
        const oldParams = new URLSearchParams(window.location.search);
        for (const [key, value] of Object.entries(path)) {
            params.set(key, value);
        }
        let target = params.toString();
        if (oldParams.toString() == target)
            return false;
        url.search = target;
        history.pushState(null, '', url.toString());
        return true;
    }

    static parseUrl(): { [key: string]: string } {
        const params = new URLSearchParams(window.location.search);
        const path: { [key: string]: string } = {};
        params.forEach((value, key) => {
            path[key] = value;
        });
        return path;
    }

}