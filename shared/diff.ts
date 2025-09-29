

type DiffOp = {
    type: 'equal' | 'insert' | 'delete' | 'edit' | 'finished',
    lines: DiffLine[]
};
type DiffLine = {
    originalLine: number,
    text: string
}
enum eSplitDepth { file, paragraph, sentence }

/**
 * Perform a three-way merge on file-like strings
 */
export function autoThreeWayTextMerge(original: string, current: string, proposed: string): [merged: string, discarded: string[]] {
    let [merged, discarded] = autoThreeWayMerge(
        eSplitDepth.file,
        original.split('\n'),
        current.split('\n'),
        proposed.split('\n')
    );
    return [merged.join('\n'), discarded];
}

function conflictHandler(currDepth: eSplitDepth, original: string, current: string, proposed: string): [merged: string, discarded: string[]] {
    if (currDepth === eSplitDepth.sentence) {
        if (current === proposed) return [proposed, []];
        return [current, [proposed]];
    }
    let depth = currDepth == eSplitDepth.file ? eSplitDepth.paragraph : eSplitDepth.sentence;

    // TODO: Node doesn't actually seem to know what this is, and I don't really want to deal with that
    //       I also don't have a good path to reassembling these strings post-split, and should probably expose the language :\

    // const segmenter = new Intl.Segmenter('en', { granularity: (depth == eSplitDepth.paragraph ? 'sentence' : 'word') });
    // const curr = Array.from(segmenter.segment(current)).map(s => s.segment);
    // const prop = Array.from(segmenter.segment(proposed)).map(s => s.segment);

    let splitter = depth == eSplitDepth.paragraph ? /([^.!?]+[.!?])/g : /\s+/g;
    const org = splitWithTrail(original, splitter);
    const curr = splitWithTrail(current, splitter);
    const prop = splitWithTrail(proposed, splitter);

    let [merged, discarded] = autoThreeWayMerge(depth, org, curr, prop);
    if (depth == eSplitDepth.sentence && discarded.length > 0) discarded = [proposed];
    discarded = discarded.filter(s => s.trim() !== '');

    return [merged.join(''), discarded.map(s => s.trim())];
}

//splits a string, including the actual trailing split characters in each piece so they can be rejoined
function splitWithTrail(str: string, regex: RegExp) {
    const result = [];
    let lastIndex = 0;

    for (const match of Array.from(str.matchAll(regex))) {
        const endIndex = match.index + match[0].length;
        result.push(str.slice(lastIndex, endIndex));
        lastIndex = endIndex;
    }

    if (lastIndex < str.length) {
        result.push(str.slice(lastIndex));
    }

    return result;
}

// rejoins a string that was split using a regex
// not actually useful if the number of elements changed, though :\
function rejoiner(original: string, splitter: RegExp, pieces: string[]): string {
    let result = '';
    let i = 0;
    for (let piece of pieces) {
        if (i < original.length) {
            const match = original.match(splitter)![i];
            if (match) {
                result += piece + match;
            }
        } else {
            result += piece;
        }
        i++;
    }
    return result;
}

function autoThreeWayMerge(depth: eSplitDepth, original: string[], current: string[], proposed: string[]): [merged: string[], discarded: string[]] {
    const curOps = diff(original, current);
    const propOps = diff(original, proposed);
    let align = alignDiffs(original, curOps, propOps);
    let merged: string[] = [];
    let discarded: string[] = [];

    for (const line of align) {
        let a = line.original;
        let b = line.current;
        let c = line.proposed;
        let bc = b ?? c;

        let [t1, d1] = getDiffChange(b);
        let [t2, d2] = getDiffChange(c);

        //console.log(t1, d1, t2, d2);

        if (!d1 && !d2 && t1 === t2) {
            if (t1 !== undefined) merged.push(t1);
        } else if (t1 !== undefined && t2 !== undefined) {
            if (d1 && d2) {
                const sim = similarity(t1, t2);
                if (sim >= 0.25) {
                    let [m, c] = conflictHandler(depth, a ?? '', t1, t2);
                    merged.push(m);
                    discarded.push(...c);
                } else {
                    // both differ enough: keep both
                    merged.push(t1, t2);
                }
            } else if (d1) {
                merged.push(t1);
            } else if (d2) {
                merged.push(t2);
            }
        } else if (t2 !== undefined) {
            if (!d1)
                merged.push(t2);
            else if (a) {
                merged.push(a);
                discarded.push(t2);
            }
        } else if (t1 !== undefined) {
            if (!proposed.includes(t1) && d1)
                merged.push(t1);
        }
    }
    return [merged, discarded];
}

function getDiffChange(diff?: FlatDiffLine): [target: string | undefined, isDelta: boolean] {
    if (!diff) return [undefined, false];
    switch (diff.type) {
        case 'delete':
            return [undefined, true];

        case 'finished':
            return [undefined, false];

        case 'equal':
            return [diff.text, false];

        case 'edit':
        case 'insert':
            return [diff.text, true];

        default: throw 'diff type not implemented';
    }
}

/**
 * Compute the Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + 1
                );
            }
        }
    }

    return dp[m][n];
}

/**
 * Returns a similarity ratio in [0,1], based on Levenshtein.
 */
function similarity(a: string, b: string): number {
    if (a.length === 0 && b.length === 0) return 1;
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
}

/**
 * Diff original → variant into a sequence of big ops: equal, insert, delete.
 */
export function diff(original: string[], variant: string[]): DiffOp[] {
    const m = original.length, n = variant.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    // build LCS lengths
    for (let i = m; i >= 0; i--) {
        for (let j = n; j >= 0; j--) {
            if (i < m && j < n && original[i] === variant[j]) {
                dp[i][j] = dp[i + 1][j + 1] + 1;
            } else {
                dp[i][j] = Math.max(
                    i < m ? dp[i + 1][j] : 0,
                    j < n ? dp[i][j + 1] : 0
                );
            }
        }
    }

    // backtrack into a flat op list
    const ops: DiffOp[] = [];
    let i = 0, j = 0;
    while (i < m || j < n) {
        if (i < m && j < n && original[i] === variant[j]) {
            ops.push({ type: 'equal', lines: [{ text: original[i], originalLine: i }] });
            i++; j++;
        } else if (j < n && (i === m || dp[i][j + 1] >= dp[i + 1][j])) {
            ops.push({ type: 'insert', lines: [{ text: variant[j], originalLine: i }] });
            j++;
        } else {
            ops.push({ type: 'delete', lines: [{ text: original[i], originalLine: i }] });
            i++;
        }
    }

    // merge adjacent ops of the same type
    const grouped: DiffOp[] = [];
    for (const op of ops) {
        const last = grouped[grouped.length - 1];
        if (last && last.type === op.type) {
            last.lines.push(...op.lines);
        } else {
            grouped.push({ type: op.type, lines: [...op.lines] });
        }
    }

    // merge Insert + delete into a single action
    const editClean: DiffOp[] = [];
    for (let index = 0; index < grouped.length; index++) {
        const next = grouped[index + 1];
        const op = grouped[index];
        if (next && op.type === 'insert' && next.type === 'delete') {
            editClean.push({ type: 'edit', lines: [...op.lines] })
            index++; // skip ahead
        } else {
            editClean.push({ type: op.type, lines: [...op.lines] });
        }
    }

    return editClean;
}

type FlatDiffLine = {
    type: 'equal' | 'insert' | 'delete' | 'edit' | 'finished',
    originalLine: number,
    text: string
}
type MergeLine = {
    original?: string,
    current?: FlatDiffLine
    proposed?: FlatDiffLine,
}

function flattenDiffOp(op: DiffOp): FlatDiffLine[] {
    return op.lines.map(line => {
        return { ...line, type: op.type };
    });
}

/**
 * Combine the two diffs into an aligned merge
 * @param original original file line
 * @param current grouped maps of changes from original to what is on the server now
 * @param proposed grouped maps of changes from original to proposed changes
 */
function alignDiffs(original: string[], current: DiffOp[], proposed: DiffOp[]): MergeLine[] {
    const result: MergeLine[] = [];
    let i = 0, j = 0;

    let currFlat: FlatDiffLine[] = current.flatMap(flattenDiffOp);
    let propFlat: FlatDiffLine[] = proposed.flatMap(flattenDiffOp);

    while (i < currFlat.length || j < propFlat.length) {
        let a = currFlat[i];
        let b = propFlat[j];
        if (!a && !b) throw 'alignDiffs logic error';

        if (!b) {
            result.push({ original: original[a.originalLine], current: a });
            i++;
        } else if (!a) {
            result.push({ original: original[b.originalLine], proposed: b });
            j++;
        }
        else {
            let aOrig = original[a.originalLine];
            let bOrig = original[b.originalLine];
            if (a.originalLine === b.originalLine) {
                if (a.type === 'insert' && b.type !== 'insert') {
                    result.push({ original: aOrig, current: a });
                    i++;
                } else if (a.type === 'insert' && b.type !== 'insert') {
                    result.push({ original: bOrig, proposed: b });
                    j++;
                } else {
                    result.push({ original: aOrig, current: a, proposed: b });
                    i++; j++;
                }
            } else if (a.originalLine < b.originalLine) {
                result.push({ original: aOrig, current: a });
                i++;
            } else {
                result.push({ original: bOrig, proposed: b });
                j++;
            }
        }
    }
    
    return result;
}