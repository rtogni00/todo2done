import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { addTasksToTarget, extractCompletedTasks } from './taskParser';
import {
	DEFAULT_SETTINGS,
	Todo2DoneSettings,
	Todo2DoneSettingTab,
} from './settings';

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
			const sourcePath = normalizePath(this.settings.sourceNote.trim());
			const targetPath = normalizePath(this.settings.targetNote.trim());

			if (!sourcePath.endsWith('.md') || !targetPath.endsWith('.md')) {
				new Notice('Source and target must be .md notes');
				return;
			}

			if (sourcePath === targetPath) {
				new Notice('Source and target notes must be different');
				return;
			}

			const sourceFile = this.getMarkdownFile(sourcePath);

			if (!sourceFile) {
				new Notice(`Source note not found: ${sourcePath}`);
				return;
			}

			const sourceContent = await this.app.vault.read(sourceFile);
			const parsed = extractCompletedTasks(sourceContent);

			if (parsed.completedTasks.length === 0) {
				new Notice('No completed tasks found');
				return;
			}

			const targetFile = await this.getOrCreateTargetFile(targetPath);

			if (!targetFile) return;

			if (sourceFile.path === targetFile.path) {
				new Notice('Source and target notes must be different');
				return;
			}

			const originalTarget = await this.app.vault.read(targetFile);
			let targetChanged = false;

			try {
				await this.app.vault.process(targetFile, (current) => {
					const updated = addTasksToTarget(
						current,
						parsed.completedTasks,
					);
					targetChanged = updated !== current;
					return updated;
				});
			} catch (error) {
				console.error('Todo2Done: target write failed', error);
				new Notice('Could not update the target note.');
				return;
			}

			if (parsed.remainingContent === sourceContent) {
				if (targetChanged) {
					new Notice(
						`Moved ${parsed.completedTasks.length} completed task(s)`,
					);
				}
				return;
			}

			let sourceStale = false;

			try {
				await this.app.vault.process(sourceFile, (current) => {
					if (current !== sourceContent) {
						sourceStale = true;
						return current;
					}
					return parsed.remainingContent;
				});
			} catch (error) {
				console.error('Todo2Done: source write failed', error);
				await this.tryRollback(
					targetFile,
					originalTarget,
					targetChanged,
				);
				return;
			}

			if (sourceStale) {
				await this.tryRollback(
					targetFile,
					originalTarget,
					targetChanged,
				);
				new Notice(
					'The source note changed during the move. Please retry.',
				);
				return;
			}

			new Notice(
				`Moved ${parsed.completedTasks.length} completed task(s)`,
			);
		} catch (error) {
			console.error('Todo2Done failed', error);
			new Notice('Could not move completed tasks.');
		}
	}

	private async tryRollback(
		file: TFile,
		original: string,
		changed: boolean,
	): Promise<void> {
		if (!changed) return;

		try {
			await this.app.vault.process(file, (current) =>
				current === original ? current : original,
			);
			new Notice('Source update failed. Target restored.');
		} catch (error) {
			console.error('Todo2Done: rollback failed', error);
			new Notice('Rollback failed. Review both notes before retrying.');
		}
	}

	private getMarkdownFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	private async getOrCreateTargetFile(path: string): Promise<TFile | null> {
		const existing = this.app.vault.getAbstractFileByPath(path);

		if (existing instanceof TFile) return existing;

		if (existing !== null) {
			new Notice(`Target path is not a note: ${path}`);
			return null;
		}

		try {
			return await this.app.vault.create(path, '# Done\n');
		} catch (error) {
			// Race: maybe sync just created it.
			const raced = this.app.vault.getAbstractFileByPath(path);
			if (raced instanceof TFile) return raced;

			console.error('Todo2Done: target create failed', error);
			new Notice(
				`Could not create target note: ${path}. Please verify the folder exists`,
			);
			return null;
		}
	}
}
