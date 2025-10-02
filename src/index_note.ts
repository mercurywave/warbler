import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Folder } from "./folder";
import { Note } from "./note";
import { Speech } from "./speech";
import { Rest, util } from "@shared/util";
import { View } from "./view";
import { simpleCollapsableSection } from "./common";
import { Config } from "./settings";
import { diff } from "@shared/diff";

export function mkNoteWrapper(flow: Flow, note: Note) {
    let view = View.CurrView();
    let root = flow.root("div", { className: "bubble-wrap", draggable: view.canReorder });

    let inner = flow.child("div", { className: "bubble" });
    flow.placeholder(f => mkNoteControl(f, note), inner, () => true);

    let mask = flow.child("div", { className: "drag-mask noDisp" });
    flow.elem(mask, "div", { className: "drag-mask-fill" });

    flow.bindTelegram("note/dragstart", null, () => mask.classList.remove("noDisp"));
    flow.bindTelegram("note/dragend", null, () => {
        mask.classList.add("noDisp");
        root.classList.remove('drop-over');
        root.classList.remove('drop-under');
    });

    root.addEventListener("dragstart", e => {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData('note/id', note.id);
        e.dataTransfer.effectAllowed = 'move';
        Flow.BroadcastTelegram("note/dragstart", note);
    });

    root.addEventListener("dragend", e => {
        if (!e.dataTransfer) return;
        Flow.BroadcastTelegram("note/dragend", note);
    });

    mask.addEventListener("dragover", e => {
        e.preventDefault();
        const rect = mask.getBoundingClientRect();
        const mouseY = e.clientY;
        let bottomThreshold = rect.bottom - 20;
        if (root.classList.contains('drop-under')) bottomThreshold -= 10; // minimize thrashing
        root.classList.toggle('drop-over', mouseY < bottomThreshold);
        root.classList.toggle('drop-under', mouseY >= bottomThreshold);
    });

    mask.addEventListener("dragleave", (e) => {
        if (e.dataTransfer?.types[0] !== 'note/id') return;
        e.preventDefault();
        root.classList.remove('drop-over');
        root.classList.remove('drop-under');
    });

    mask.addEventListener("drop", (e) => {
        e.preventDefault();
        let sourceId = e.dataTransfer?.getData('note/id');
        if (!sourceId) return;
        let dropper = DB.GetNoteById(sourceId);
        if (!dropper || dropper === note) return;
        let under = root.classList.contains('drop-under');

        let par = dropper.parent;
        let folder = dropper.folder;
        par?.removeChild(dropper);
        folder?.removeNote(dropper);
        if (note.isChild) {
            let newPar = note.parent;
            if (!newPar) throw `Note ${note.id} does not have a parent, but thinks it's a child?`;
            newPar.insertRelative(dropper, note, under);
        }
        else {
            if (under)
                note.insertChildAfter(dropper);
            else
                note.folder?.insertNote(dropper, note);
        }
        view.repopulate();
    });
}

function mkNoteControl(flow: Flow, note: Note) {
    let view = View.CurrView();
    let root = flow._root!;
    flow.conditionalStyle(root, "childNote", () => note.isChild && view.groupByParents);
    flow.conditionalStyle(root, "orphanedNote", () => note.isChild && !view.groupByParents);

    let wrapper = flow.child("div", { className: "growWrap" });
    let edit = flow.elem<HTMLTextAreaElement>(wrapper, "textarea");
    let updateSize = () => wrapper.dataset.replicatedValue = edit.value;
    edit.addEventListener("input", updateSize);
    flow.bind(() => {
        edit.value = note.text;
        updateSize();
    });
    flow.conditionalStyle(wrapper, "noDisp", () => !!note.suggestedChanges);
    edit.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = edit.selectionStart;
            const end = edit.selectionEnd;

            const newValue = edit.value.substring(0, start) +
                '\t' + edit.value.substring(end);

            edit.value = newValue;

            setTimeout(() => {
                edit.selectionStart = start + 1;
                edit.selectionEnd = start + 1;
            }, 0);
        }
    });
    edit.addEventListener("change", () => {
        note.text = edit.value;
        Flow.Dirty();
    });

    edit.spellcheck = false;
    edit.addEventListener("focus", () => edit.spellcheck = true);
    edit.addEventListener("blur", () => edit.spellcheck = false);

    flow.bindMail('noteFocus', m => m.data === note, () => {
        edit.focus();
    });

    flow.bindMail('noteView', m => m.data === note, () => {
        root.scrollIntoView();
    });

    mkSuggestion(flow, note);

    let recordings = flow.child("div");
    flow.bindArray(() => note._pendingAudio, Speech.mkRecordWidget, recordings);

    let conflicts = flow.child("div");
    flow.placeholder((f) => mkConflictResolver(f, note), conflicts, () => note.isConflicted);

    let footer = flow.child("div", { className: "bubbleFooter" });
    mkNoteFooter(flow, footer, note);
}

function mkSuggestion(flow: Flow, note: Note) {
    let container = flow.child("div");
    let suggestion = flow.elem(container, "div");
    flow.conditionalStyle(container, "noDisp", () => !note.suggestedChanges);

    let span = flow.elem(container, "span");
    let btAccept = flow.elem<HTMLButtonElement>(span, "button", {
        type: "button",
        innerText: "Accept",
        className: "btSuggestion",
    });
    btAccept.addEventListener('click', () => note.acceptSuggestion());

    let btClear = flow.elem<HTMLButtonElement>(span, "button", {
        type: "button",
        innerText: "Discard",
        className: "btSuggestion",
    });
    btClear.addEventListener('click', () => note.discardSuggestion());

    let chkMerge = flow.elem<HTMLInputElement>(span, "input", {
        type: "checkbox",
        checked: true,
    })
    let lblMerge = flow.elem(span, "label", { innerText: 'Merge Edits' });
    chkMerge.addEventListener("change", () => Flow.Dirty());
    lblMerge.addEventListener("click", () => {
        chkMerge.checked = !chkMerge.checked;
        Flow.Dirty();
    });

    flow.bind(() => {
        if (note.suggestedChanges)
            renderDiff(suggestion, note.text, note.suggestedChanges ?? '', chkMerge.checked);
        else
            suggestion.innerText = '';
    });
}

function renderDiff(parent: HTMLElement, before: string, after: string, mergeEdits: boolean) {
    // render out html elements into the parent
    parent.innerHTML = '';
    parent.classList.add('diff');
    let a = before.match(/\S+\s*/g) || [];
    let b = after.match(/\S+\s*/g) || [];
    let diffArr = diff(a, b, mergeEdits);
    for (const d of diffArr) {
        const span = document.createElement('span');
        span.className = d.type;
        let text = d.lines.map(l => l.text).join('');
        let split = text.split('\n');
        for (let i = 0; i < split.length; i++) {
            const line = document.createElement('span');
            line.textContent = split[i];
            span.appendChild(line);
            if (i !== split.length - 1 && d.type !== 'delete')
                span.appendChild(document.createElement('br'));
        }
        parent.appendChild(span);
    }
}

function mkConflictResolver(flow: Flow, note: Note) {
    let parent = flow.child("div", { className: 'confBox' });
    let lbl = flow.elem(parent, "span", {
        className: "lblWarning",
        innerText: `There was a problem syncing this note. These changes failed to apply:`
    });
    let btClear = flow.elem<HTMLButtonElement>(parent, "button", {
        type: "button",
        innerText: "Clear Conflicts",
        className: "btClearConflicts",
    });
    btClear.addEventListener('click', () => note.clearConflicts());

    let container = flow.elem(parent, "div", { className: "conflicts" });
    flow.bindArray(() => note.conflicts, mkConflictBox, container);

    let [, , body] = simpleCollapsableSection(flow, "Pre-Conflict Text", parent);
    flow.bind(() => body.innerText = note.preConflictText);
}

function mkConflictBox(flow: Flow, text: string) {
    flow.root("div", { className: 'conflict', innerText: text });
}

function mkNoteFooter(flow: Flow, span: HTMLElement, note: Note) {
    Speech.mkRecordButton(flow, span, note);

    let btAdd = flow.elem<HTMLButtonElement>(span, "button", {
        type: "button",
        innerText: "+ Sub Note",
        className: "btAddSubNote",
    });
    btAdd.addEventListener("click", () => {
        if (note.isChild) return;
        let child = DB.CreateNote();
        note.addChild(child);
        View.ForceAdd(child);
    });
    mkNoteFolderPicker(flow, span, note);
    flow.conditionalStyle(btAdd, "noDisp", () => note.isChild);

    let linkParent = flow.elem<HTMLAnchorElement>(span, "a", {
        className: "parentLink",
        innerText: "Parent Note",
    });
    let view = View.CurrView();
    flow.conditionalStyle(linkParent, "noDisp", () => !(note.isChild && !view.groupByParents));
    linkParent.addEventListener("click", () => {
        Route.Launch("note", { id: note.parent?.id ?? "" });
    });

    flow.elem(span, "span", { className: "spacer" });

    flow.elem(span, "span", {
        className: "noteCreation",
        innerText: util.getRelativeTime(note.creationUtc),
        title: `created ${note.creationUtc}`,
    });

    let mnuNote = mkMoreMenu(flow, span);
    let mCleanupAudio = mkMoreMenuOpt(flow, mnuNote, "Clean Transcript", async () => {
        let folder = note.folder;
        let response = await Rest.postLong(Config.getBackendUrl()!, "v1/cleanupTranscript", {
            raw: note.text,
            summary: folder?.summary,
            vocab: folder?.vocab,
        });
        console.log("Cleaned transcript:", response.response);
        if (response.success && response.response) {
            // TODO: this is a race condition if something else touches the suggestion
            note.suggestedChanges = response.response as string;
        }
    });
    let mUndelete = mkMoreMenuOpt(flow, mnuNote, "Undelete Note", () => {
        note.isDeleted = false;
    });
    let mHardDelete = mkMoreMenuOpt(flow, mnuNote, "Hard Delete Note", () => {
        DB.HardDeleteNote(note)
            .then(() => {
                View.CurrView().forceRemove(note);
                Flow.Dirty();
            });
    });
    let mDelete = mkMoreMenuOpt(flow, mnuNote, "Delete Note", () => {
        note.isDeleted = true;
    });
    flow.bind(() => {
        mUndelete.hidden = !note.isDeleted;
        mHardDelete.hidden = !note.isDeleted;
        mDelete.hidden = note.isDeleted;
        mCleanupAudio.hidden = !Config.getBackendUrl();
    });
}

function mkMoreMenu(flow: Flow, parent?: HTMLElement): HTMLSelectElement {
    let wrapper = flow.elem(parent, "div", { className: "mnuOptWrap" });
    let mnuDrop = flow.elem<HTMLSelectElement>(wrapper, "select", { className: "mnuDropdown" });
    // this makes a hidden element selected - this is all a dumb hack, but all the options are dumb hacks
    let badOpt = flow.elem<HTMLOptionElement>(mnuDrop, "option", { value: "", disabled: true, selected: true, hidden: true });
    mnuDrop.addEventListener("change", () => setTimeout(() => badOpt.selected = true));
    flow.elem<HTMLButtonElement>(wrapper, "div", {
        innerText: "•••",
        className: "btFakeMenu",
    });
    return mnuDrop;
}

function mkMoreMenuOpt(flow: Flow, select: HTMLSelectElement, lbl: string, onClick: () => void): HTMLOptionElement {
    // note - this dumb hacky dropdown requires every element to have a unique name - can't fully bind options
    lbl = lbl + "\xA0\xA0\xA0\xA0"; // non-breaking spaces help the dumb hack look less janky
    let opt = flow.elem<HTMLOptionElement>(select, "option", {
        className: "mnuOpt",
        textContent: lbl,
        value: lbl
    });
    select.addEventListener("change", e => {
        if (select.value === lbl)
            onClick();
    });
    return opt;
}

function mkNoteFolderPicker(flow: Flow, span: HTMLElement, note: Note) {
    let subSpan = flow.elem(span, "span");
    flow.conditionalStyle(subSpan, "noDisp", () => note.isChild);
    flow.elem(subSpan, "span", { innerText: "🗀" });
    let dropDown = flow.elem<HTMLSelectElement>(subSpan, "select");
    flow.bindArray(() => DB.AllFolders(), mkFolderOption, dropDown);
    flow.bind(() => {
        dropDown.value = note.folder?.id ?? "";
    });
    dropDown.addEventListener("change", () => {
        let prevFolder = note.folder;
        let folder = DB.GetFolderById(dropDown.value);
        prevFolder?.removeNote(note);
        folder?.addNote(note);
        Flow.Dirty();
    });
}

function mkFolderOption(flow: Flow, folder: Folder) {
    let opt = flow.root<HTMLOptionElement>("option");
    flow.bind(() => {
        opt.text = folder.title;
    });
    opt.value = folder.id;
    return opt;
}