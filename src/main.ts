import { Notice, Plugin, TFile, normalizePath } from 'obsidian';

import {
	DEFAULT_SETTINGS,
	Todo2DoneSettings,
	Todo2DoneSettingTab,
} from './settings';

interface Heading {
	level: number;
	text: string;
	raw: string;
}

interface CompletedTask {
	heading: Heading | null;
	lines: string[];
}

interface ParsedSource {
	remainingContent: string;
	completedTasks: CompletedTask[];
}

const UNSECTIONED_HEADING = '## Uncategorized';

export default class Todo2DonePlugin extends Plugin {
	settings!: Todo2DoneSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('archive', 'Move completed tasks', async () => {
			await this.moveCompletedTasks();
		});

		this.addCommand({
			id: 'move-completed-tasks',
			name: 'Move completed tasks',
			callback: async () => {
				await this.moveCompletedTasks();
			},
		});

		this.addSettingTab(new Todo2DoneSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<Todo2DoneSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async moveCompletedTasks(): Promise<void> {
		try {
			const sourceFile = this.getMarkdownFile(this.settings.sourceNote);

			if (!sourceFile) {
				new Notice(
					`Source note not found: ${this.settings.sourceNote}`,
				);
				return;
			}

			if (
				normalizePath(sourceFile.path) ===
				normalizePath(this.settings.targetNote)
			) {
				new Notice('Source and target notes must be different');
				return;
			}

			const sourceContent = await this.app.vault.read(sourceFile);
			const parsed = this.extractCompletedTasks(sourceContent);

			if (parsed.completedTasks.length === 0) {
				new Notice('No completed tasks found');
				return;
			}

			const targetFile = await this.getOrCreateTargetFile(
				this.settings.targetNote,
			);
			const targetContent = await this.app.vault.read(targetFile);
			const updatedTarget = this.addTasksToTarget(
				targetContent,
				parsed.completedTasks,
			);

			await this.app.vault.modify(targetFile, updatedTarget);

			try {
				await this.app.vault.modify(
					sourceFile,
					parsed.remainingContent,
				);
			} catch (sourceError) {
				console.error(
					'Todo2Done could not update the source note',
					sourceError,
				);

				try {
					await this.app.vault.modify(targetFile, targetContent);
					new Notice(
						'Could not update the source note. Changes to the target were rolled back.',
					);
				} catch (rollbackError) {
					console.error(
						'Todo2Done could not roll back the target note',
						rollbackError,
					);
					new Notice(
						'Could not update the source or roll back the target. Review both notes before retrying.',
					);
				}

				return;
			}

			new Notice(
				`Moved ${parsed.completedTasks.length} completed task(s)`,
			);
		} catch (error) {
			console.error('Todo2Done failed to move completed tasks', error);
			new Notice(
				'Could not move completed tasks. Check the console for details.',
			);
		}
	}

	private getMarkdownFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));

		if (file instanceof TFile) {
			return file;
		}

		return null;
	}

	private async getOrCreateTargetFile(path: string): Promise<TFile> {
		const existing = this.getMarkdownFile(path);

		if (existing !== null) {
			return existing;
		}

		return await this.app.vault.create(normalizePath(path), '# Done\n');
	}

	private extractCompletedTasks(content: string): ParsedSource {
		const lines = content.split('\n');
		const remainingLines: string[] = [];
		const completedTasks: CompletedTask[] = [];
		let currentHeading: Heading | null = null;
		let codeFence: { marker: string; length: number } | null = null;

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const line = lines[lineIndex];

			if (line === undefined) {
				continue;
			}

			const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);

			if (codeFence !== null) {
				remainingLines.push(line);

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

				remainingLines.push(line);
				continue;
			}

			const heading = this.parseHeading(line);

			if (heading !== null) {
				currentHeading = heading;
				remainingLines.push(line);
				continue;
			}

			if (this.isCompletedTask(line)) {
				const taskIndent = /^\s*/.exec(line)?.[0].length ?? 0;
				let nextLineIndex = lineIndex + 1;

				while (nextLineIndex < lines.length) {
					const nextLine = lines[nextLineIndex];

					if (
						nextLine === undefined ||
						this.parseHeading(nextLine) !== null
					) {
						break;
					}

					if (nextLine.trim() === '') {
						let continuationIndex = nextLineIndex + 1;

						while (
							continuationIndex < lines.length &&
							lines[continuationIndex]?.trim() === ''
						) {
							continuationIndex++;
						}

						const continuationLine = lines[continuationIndex];

						if (
							continuationLine === undefined ||
							this.parseHeading(continuationLine) !== null ||
							(/^\s*/.exec(continuationLine)?.[0].length ?? 0) <=
								taskIndent
						) {
							break;
						}

						nextLineIndex = continuationIndex;
						continue;
					}

					if (
						(/^\s*/.exec(nextLine)?.[0].length ?? 0) <= taskIndent
					) {
						break;
					}

					nextLineIndex++;
				}

				completedTasks.push({
					heading: currentHeading,
					lines: lines.slice(lineIndex, nextLineIndex),
				});
				lineIndex = nextLineIndex - 1;
				continue;
			}

			remainingLines.push(line);
		}

		return {
			remainingContent: remainingLines.join('\n'),
			completedTasks,
		};
	}

	private addTasksToTarget(content: string, tasks: CompletedTask[]): string {
		let result = content;

		const grouped = new Map<string, string[]>();

		for (const task of tasks) {
			const heading = task.heading?.raw ?? UNSECTIONED_HEADING;

			let bucket = grouped.get(heading);

			if (bucket === undefined) {
				bucket = [];
				grouped.set(heading, bucket);
			}

			bucket.push(...task.lines);
		}

		for (const [heading, taskLines] of grouped.entries()) {
			result = this.insertTasksIntoSection(result, heading, taskLines);
		}

		return result;
	}

	private insertTasksIntoSection(
		content: string,
		headingLine: string,
		taskLines: string[],
	): string {
		const lines = content.split('\n');

		const headingIndex = lines.findIndex(
			(line) => line.trim() === headingLine.trim(),
		);

		// Section does not exist yet
		if (headingIndex === -1) {
			return (
				content.trimEnd() +
				`\n\n${headingLine}\n\n` +
				taskLines.join('\n') +
				'\n'
			);
		}

		let insertIndex = lines.length;

		// Find next heading
		for (let i = headingIndex + 1; i < lines.length; i++) {
			const currentLine = lines[i];

			if (currentLine === undefined) {
				continue;
			}

			const heading = this.parseHeading(currentLine);

			if (heading !== null) {
				insertIndex = i;
				break;
			}
		}

		// Check whether section already contains tasks
		let sectionHasContent = false;

		for (let i = headingIndex + 1; i < insertIndex; i++) {
			const currentLine = lines[i];

			if (currentLine !== undefined && currentLine.trim() !== '') {
				sectionHasContent = true;
				break;
			}
		}

		const itemsToInsert: string[] = [];

		// First item in section -> leave one blank line after heading
		if (!sectionHasContent) {
			itemsToInsert.push('');
		}

		itemsToInsert.push(...taskLines);

		lines.splice(insertIndex, 0, ...itemsToInsert);

		return lines.join('\n');
	}

	private parseHeading(line: string): Heading | null {
		const match = /^(#{1,6})\s+(.*?)\s*$/.exec(line);

		if (match === null) {
			return null;
		}

		const hashes = match[1];
		const text = match[2];

		if (hashes === undefined || text === undefined) {
			return null;
		}

		return {
			level: hashes.length,
			text,
			raw: line,
		};
	}

	private isCompletedTask(line: string): boolean {
		return /^\s*[-*+]\s+\[[xX]\]/.test(line);
	}
}
