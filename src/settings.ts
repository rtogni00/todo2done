import { App, PluginSettingTab, Setting } from 'obsidian';
import type Todo2DonePlugin from './main';

export interface Todo2DoneSettings {
	sourceNote: string;
	targetNote: string;
}

export const DEFAULT_SETTINGS: Todo2DoneSettings = {
	sourceNote: 'TODO.md',
	targetNote: 'DONE.md',
};

export class Todo2DoneSettingTab extends PluginSettingTab {
	plugin: Todo2DonePlugin;

	constructor(app: App, plugin: Todo2DonePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Source note')
			.setDesc('Note containing active tasks')
			.addText((text) =>
				text
					.setPlaceholder('TODO.md')
					.setValue(this.plugin.settings.sourceNote)
					.onChange(async (value) => {
						this.plugin.settings.sourceNote = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Target note')
			.setDesc('Note receiving completed tasks')
			.addText((text) =>
				text
					.setPlaceholder('DONE.md')
					.setValue(this.plugin.settings.targetNote)
					.onChange(async (value) => {
						this.plugin.settings.targetNote = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
