export interface Heading {
	level: number;
	text: string;
	raw: string;
	key: string;
}

export interface CompletedTask {
	heading: Heading | null;
	lines: string[];
}

export interface ParsedSource {
	remainingContent: string;
	completedTasks: CompletedTask[];
}

interface TaskNode {
	start: number;
	end: number;
	indent: number;
	checked: boolean;
	children: TaskNode[];
}

export const UNSECTIONED_HEADING: Heading = {
	level: 2,
	text: 'Uncategorized',
	raw: '## Uncategorized',
	key: '2:uncategorized',
};

const headingKey = (level: number, text: string): string =>
	`${level}:${text
		.replace(/\s+#+\s*$/, '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase()}`;

export function extractCompletedTasks(content: string): ParsedSource {
	const lines = content.split('\n');
	const skip = new Array<boolean>(lines.length).fill(false);

	let currentHeading: Heading | null = null;
	let codeFence: { marker: string; length: number } | null = null;

	// First pass: determine the heading in effect for each line, and
	// collect task blocks (start line → end line, indent, checked).
	const headings = new Array<Heading | null>(lines.length).fill(null);
	const taskAt = new Map<
		number,
		{ end: number; indent: number; checked: boolean }
	>();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);

		if (codeFence !== null) {
			headings[i] = currentHeading;
			if (
				fenceMatch !== null &&
				fenceMatch[1]?.[0] === codeFence.marker &&
				fenceMatch[1].length >= codeFence.length &&
				line.trim().slice(codeFence.length).trim() === ''
			) {
				codeFence = null;
			}
			continue;
		}

		if (fenceMatch !== null) {
			const marker = fenceMatch[1];
			if (marker !== undefined) {
				codeFence = {
					marker: marker[0] ?? '`',
					length: marker.length,
				};
			}
			headings[i] = currentHeading;
			continue;
		}

		const heading = parseHeading(line);

		if (heading !== null) {
			currentHeading = heading;
			headings[i] = heading;
			continue;
		}

		headings[i] = currentHeading;

		if (!isTaskLine(line)) {
			continue;
		}

		const indent = /^\s*/.exec(line)?.[0].length ?? 0;
		const checked = isCompletedTask(line);
		let end = i + 1;

		// Reuse the original continuation rules to find the block end.
		while (end < lines.length) {
			const next = lines[end] ?? '';

			if (parseHeading(next) !== null) break;

			if (next.trim() === '') {
				let cont = end + 1;

				while (
					cont < lines.length &&
					(lines[cont] ?? '').trim() === ''
				) {
					cont++;
				}

				const contLine = lines[cont] ?? '';

				if (
					contLine === '' ||
					parseHeading(contLine) !== null ||
					(/^\s*/.exec(contLine)?.[0].length ?? 0) <= indent
				) {
					break;
				}

				end = cont;
				continue;
			}

			if ((/^\s*/.exec(next)?.[0].length ?? 0) <= indent) break;

			end++;
		}

		taskAt.set(i, { end, indent, checked });
	}

	// Second pass: build a task tree via indentation.
	const roots: TaskNode[] = [];
	const stack: TaskNode[] = [];

	const starts = [...taskAt.keys()].sort((a, b) => a - b);

	for (const start of starts) {
		const info = taskAt.get(start);
		if (info === undefined) continue;

		const node: TaskNode = {
			start,
			end: info.end,
			indent: info.indent,
			checked: info.checked,
			children: [],
		};

		while (
			stack.length > 0 &&
			stack[stack.length - 1]!.indent >= node.indent
		) {
			stack.pop();
		}

		if (stack.length === 0) {
			roots.push(node);
		} else {
			stack[stack.length - 1]!.children.push(node);
		}

		stack.push(node);
	}

	// Third pass: a subtree moves only if every task in it is checked.
	const fullyChecked = (node: TaskNode): boolean =>
		node.checked && node.children.every(fullyChecked);

	const completedTasks: CompletedTask[] = [];

	for (const root of roots) {
		if (!fullyChecked(root)) continue;

		const heading = headings[root.start] ?? null;

		completedTasks.push({
			heading,
			lines: lines.slice(root.start, root.end),
		});

		for (let i = root.start; i < root.end; i++) {
			skip[i] = true;
		}
	}

	if (completedTasks.length === 0) {
		return { remainingContent: content, completedTasks };
	}

	const remainingLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (!skip[i]) {
			remainingLines.push(lines[i] ?? '');
		}
	}

	return {
		remainingContent: remainingLines.join('\n'),
		completedTasks,
	};
}

export function addTasksToTarget(
	content: string,
	tasks: CompletedTask[],
): string {
	let result = content;
	const grouped = new Map<string, { heading: Heading; lines: string[] }>();

	for (const task of tasks) {
		const heading = task.heading ?? UNSECTIONED_HEADING;
		let bucket = grouped.get(heading.key);

		if (bucket === undefined) {
			bucket = { heading, lines: [] };
			grouped.set(heading.key, bucket);
		}

		bucket.lines.push(...task.lines);
	}

	for (const bucket of grouped.values()) {
		result = insertTasksIntoSection(result, bucket.heading, bucket.lines);
	}

	return result;
}

function insertTasksIntoSection(
	content: string,
	heading: Heading,
	taskLines: string[],
): string {
	const lines = content.split('\n');

	const headingIndex = lines.findIndex((line) => {
		const parsed = parseHeading(line ?? '');
		return parsed !== null && parsed.key === heading.key;
	});

	if (headingIndex === -1) {
		const prefix = content.trimEnd();
		return (
			prefix +
			(prefix === '' ? '' : '\n\n') +
			heading.raw +
			'\n\n' +
			taskLines.join('\n') +
			'\n'
		);
	}

	let insertIndex = lines.length;

	for (let i = headingIndex + 1; i < lines.length; i++) {
		if (parseHeading(lines[i] ?? '') !== null) {
			insertIndex = i;
			break;
		}
	}

	let sectionHasContent = false;

	for (let i = headingIndex + 1; i < insertIndex; i++) {
		if ((lines[i] ?? '').trim() !== '') {
			sectionHasContent = true;
			break;
		}
	}

	const itemsToInsert = sectionHasContent ? [] : [''];

	itemsToInsert.push(...taskLines);
	lines.splice(insertIndex, 0, ...itemsToInsert);

	return lines.join('\n');
}

function parseHeading(line: string): Heading | null {
	const match = /^(#{1,6})\s+(.*?)\s*$/.exec(line);

	if (match === null) return null;

	const hashes = match[1];
	const text = match[2];

	if (hashes === undefined || text === undefined) return null;

	return {
		level: hashes.length,
		text,
		raw: line,
		key: headingKey(hashes.length, text),
	};
}

function isTaskLine(line: string): boolean {
	return /^\s*[-*+]\s+\[[ xX-]\]/.test(line);
}

function isCompletedTask(line: string): boolean {
	return /^\s*[-*+]\s+\[[xX]\]/.test(line);
}
