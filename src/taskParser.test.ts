import { describe, expect, it } from 'vitest';

import { addTasksToTarget, extractCompletedTasks } from './taskParser';

/**
 * Convenience helper: run the parse + insert cycle and return all three
 * observable outputs in one shot.
 */
const move = (source: string, target = '# Done\n') => {
	const parsed = extractCompletedTasks(source);
	return {
		remaining: parsed.remainingContent,
		moved: parsed.completedTasks,
		target: addTasksToTarget(target, parsed.completedTasks),
	};
};

describe('extractCompletedTasks — subtree rules', () => {
	it('moves a fully checked subtree as one block', () => {
		const source = ['- [x] DONE', '  - [x] 1', '  - [x] 2'].join('\n');

		const result = move(source);

		expect(result.moved).toHaveLength(1);
		expect(result.moved[0]?.lines).toEqual([
			'- [x] DONE',
			'  - [x] 1',
			'  - [x] 2',
		]);
		expect(result.remaining).toBe('');
	});

	it('leaves a checked child under an unchecked parent', () => {
		const source = [
			'- [ ] TODO',
			'  - [x] 1',
			'  - [ ] 2',
			'  - [x] 3',
		].join('\n');

		const result = move(source);

		expect(result.moved).toHaveLength(0);
		expect(result.remaining).toBe(source);
	});

	it('leaves a checked parent with an unchecked child', () => {
		const source = ['- [x] PARENT', '  - [ ] CHILD'].join('\n');

		const result = move(source);

		expect(result.moved).toHaveLength(0);
		expect(result.remaining).toBe(source);
	});

	it('treats a cancelled task as a blocking ancestor', () => {
		const source = ['- [-] CANCELLED', '  - [x] child'].join('\n');

		const result = move(source);

		expect(result.moved).toHaveLength(0);
		expect(result.remaining).toBe(source);
	});

	it('moves an orphan checked task under a non-task bullet', () => {
		const source = ['- Notes', '  - [x] sub'].join('\n');

		const result = move(source);

		expect(result.moved).toHaveLength(1);
		expect(result.moved[0]?.lines).toEqual(['  - [x] sub']);
		expect(result.remaining).toBe('- Notes');
	});
});

describe('addTasksToTarget — heading routing', () => {
	it('routes tasks to matching headings', () => {
		const source = ['## A', '- [x] a1', '## B', '- [x] b1'].join('\n');

		const target = ['# Done', '', '## A', '', '## B', ''].join('\n');
		const result = move(source, target);

		// Both tasks move.
		expect(result.moved).toHaveLength(2);

		// a1 lands under ## A.
		const aIndex = result.target.indexOf('## A');
		const bIndex = result.target.indexOf('## B');
		const a1Index = result.target.indexOf('- [x] a1');
		const b1Index = result.target.indexOf('- [x] b1');

		expect(aIndex).toBeGreaterThanOrEqual(0);
		expect(bIndex).toBeGreaterThanOrEqual(0);
		expect(a1Index).toBeGreaterThan(aIndex);
		expect(a1Index).toBeLessThan(bIndex);
		expect(b1Index).toBeGreaterThan(bIndex);
	});

	it('creates a missing heading section', () => {
		const source = ['## New Section', '- [x] task'].join('\n');
		const target = '# Done\n';

		const result = move(source, target);

		expect(result.target).toContain('## New Section');
		expect(result.target).toContain('- [x] task');
		// Task appears after the heading it belongs to.
		expect(result.target.indexOf('## New Section')).toBeLessThan(
			result.target.indexOf('- [x] task'),
		);
	});
});
