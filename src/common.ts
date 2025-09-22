import { Flow } from "./flow";


// starts collapsed and manages collapse state itself
export function simpleCollapsableSection(flow: Flow, title: string, parent?: HTMLElement)
    : [container: HTMLElement, header: HTMLElement, body: HTMLElement] {

    let container = flow.elem(parent, "div", { className: "collapser" });
    let header = flow.elem(container, "div", { className: "collapseHead" });
    let label = flow.elem(header, "span", { innerText: title });
    let btToggle = flow.elem(header, "button", {
        innerText: "▶",
        className: "btCollapse",
    });
    let body = flow.elem(container, "div", { className: "collapseBody noDisp" });
    header.addEventListener('click', () => {
        let hidden = body.classList.toggle('noDisp');
        btToggle.innerText = hidden ? '▶' : '▼';
    });
    return [container, header, body];
}

export function scalableTextarea(
    flow: Flow,
    getter: () => string,
    setter: (val: string) => void,
    parent?: HTMLElement
) : [container: HTMLElement, text: HTMLTextAreaElement] {

    let wrapper = flow.elem(parent, "div", { className: "growWrap" });
    let edit = flow.elem<HTMLTextAreaElement>(wrapper, "textarea");
    let updateSize = () => wrapper.dataset.replicatedValue = edit.value;
    edit.addEventListener("input", updateSize);
    flow.bind(() => {
        edit.value = getter();
        updateSize();
    });
    edit.addEventListener("change", () => {
        setter(edit.value);
        Flow.Dirty();
    });

    edit.spellcheck = false;
    edit.addEventListener("focus", () => edit.spellcheck = true);
    edit.addEventListener("blur", () => edit.spellcheck = false);
    return [wrapper, edit];
}