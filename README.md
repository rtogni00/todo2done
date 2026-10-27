# Todo2Done

Todo2Done moves completed Markdown tasks from a source note into a separate archive note. It groups moved tasks under the same headings they had in the source, so the archive keeps their section structure.

## Use the plugin

1. Enable **Todo2Done** in Obsidian's Community plugins settings.
2. Open **Settings → Todo2Done** and set the source and target note paths. Paths are relative to the vault root.
3. Run **Move completed tasks** from the Command Palette, or select the archive icon in the ribbon.

By default, the source is `TODO.md` and the target is `DONE.md`. The source note must already exist. If the target note does not exist, the plugin creates it with a `# Done` heading.

## What gets moved

The plugin recognizes task lines whose list marker is followed by a checked box, including `- [x]`, `* [X]`, and `+ [x]`. Indentation before the list marker is allowed. Checkbox-looking text inside fenced code blocks is ignored.

For each moved task, the plugin uses its nearest preceding Markdown heading (`#` through `######`) as its section. The source heading remains in place. In the target, tasks are added to a section with the same heading; if that section does not exist, it is appended. Tasks without a preceding heading go under `## Uncategorized`.

Indented continuation lines and nested content move with the completed task above them. This includes nested unchecked tasks, so review completed parent tasks with unfinished subtasks before archiving. Other lines remain in the source.

The source and target must be different notes. If a vault operation fails, the plugin reports an error; if the target was updated but the source was not, review both notes before trying again.

## Development

Install dependencies and start the development build:

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

Run lint checks with:

```bash
npm run lint
```
