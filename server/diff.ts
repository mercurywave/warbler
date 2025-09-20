

type DiffOp = { type: 'equal' | 'insert' | 'delete' | 'finished', lines: string[] };
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

function conflictHandler(currDepth: eSplitDepth, current: string, proposed: string): [merged: string, discarded: string[]] {
    let depth = currDepth == eSplitDepth.file ? eSplitDepth.paragraph : eSplitDepth.sentence;

    // TODO: Node doesn't actually seem to know what this is, and I don't really want to deal with that
    //       I also don't have a good path to reassembling these strings post-split, and should probably expose the language :\

    // const segmenter = new Intl.Segmenter('en', { granularity: (depth == eSplitDepth.paragraph ? 'sentence' : 'word') });
    // const curr = Array.from(segmenter.segment(current)).map(s => s.segment);
    // const prop = Array.from(segmenter.segment(proposed)).map(s => s.segment);

    let splitter = depth == eSplitDepth.paragraph ? /([^.!?]+[.!?])/g : /\s+/g;
    const curr = current.split(splitter);
    const prop = current.split(proposed);

    let [merged, discarded] = autoThreeWayMerge(depth, [], curr, prop);
    if(depth == eSplitDepth.sentence && discarded.length > 0) discarded = [proposed];
    discarded = discarded.filter(s => s.trim() == '');
    return [merged.join(' '), discarded];
}

function autoThreeWayMerge(depth: eSplitDepth, original: string[], current: string[], proposed: string[]): [merged: string[], discarded: string[]] {
    const curOps = diff(original, current);
    const propOps = diff(original, proposed);

    // Pre-collect all proposed insertions for duplicate detection.
    const propInsertSet = new Set<string>();
    for (const op of propOps) {
        if (op.type === 'insert') {
            for (const line of op.lines) {
                propInsertSet.add(line);
            }
        }
    }

    const merged: string[] = [];
    const discarded: string[] = [];

    let p1 = 0, p2 = 0;
    let step = 0;
    while (p1 < curOps.length || p2 < propOps.length) {
        const op1: DiffOp = p1 < curOps.length
            ? curOps[p1]
            : { type: 'finished', lines: [] };
        const op2: DiffOp = p2 < propOps.length
            ? propOps[p2]
            : { type: 'finished', lines: [] };

        // 1. Both equal → advance in sync
        if (op1.type === 'equal' && op2.type === 'equal') {
            const n = Math.min(op1.lines.length, op2.lines.length);
            merged.push(...op1.lines.slice(0, n));

            if (n === op1.lines.length) p1++;
            else op1.lines = op1.lines.slice(n);

            if (n === op2.lines.length) p2++;
            else op2.lines = op2.lines.slice(n);

            // 2. Proposed-only insert
        } else if (op1.type !== 'insert' && op2.type === 'insert') {
            merged.push(...op2.lines);
            p2++;

            // 3. Current-only insert (drop if proposed inserts same text elsewhere)
        } else if (op1.type === 'insert' && op2.type !== 'insert') {
            for (const line of op1.lines) {
                if (!propInsertSet.has(line)) {
                    merged.push(line);
                }
            }
            p1++;

            // 4. Both insert at same point → conflict/merge per similarity
        } else if (op1.type === 'insert' && op2.type === 'insert') {
            const len = Math.max(op1.lines.length, op2.lines.length);
            for (let k = 0; k < len; k++) {
                const cLine = op1.lines[k];
                const pLine = op2.lines[k];

                if (cLine !== undefined && pLine !== undefined) {
                    if (cLine === pLine) {
                        merged.push(cLine);
                    }
                    else {
                        const sim = similarity(cLine, pLine);
                        if (sim >= 0.25) {
                            let [m, c] = conflictHandler(depth, cLine, pLine);
                            merged.push(m);
                            discarded.push(...c);
                        } else {
                            // both differ enough: keep both
                            merged.push(cLine, pLine);
                        }
                    }

                } else if (cLine !== undefined) {
                    if (!propInsertSet.has(cLine)) {
                        merged.push(cLine);
                    }
                } else if (pLine !== undefined) {
                    merged.push(pLine);
                }
            }
            p1++;
            p2++;

            // 5. Both delete → drop
        } else if (op1.type === 'delete' && op2.type === 'delete') {
            p1++; p2++;

            // 6. Current deletes, proposed keeps → drop those lines
        } else if (op1.type === 'delete') {
            p1++;
            if (op2.type === 'equal') p2++;

            // 7. Proposed deletes, current keeps → drop those lines
        } else if (op2.type === 'delete') {
            p2++;
            if (op1.type === 'equal') p1++;

        } else {
            // Fallback: just advance both
            p1++; p2++;
        }
    }

    return [merged, discarded];
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
function diff(original: string[], variant: string[]): DiffOp[] {
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
            ops.push({ type: 'equal', lines: [original[i]] });
            i++; j++;
        } else if (j < n && (i === m || dp[i][j + 1] >= dp[i + 1][j])) {
            ops.push({ type: 'insert', lines: [variant[j]] });
            j++;
        } else {
            ops.push({ type: 'delete', lines: [original[i]] });
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

    return grouped;
}