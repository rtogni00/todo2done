# Todo2Done

Todo2Done moves completed Markdown tasks from a source note into a separate archive note. It groups moved tasks under the same headings they had in the source, so the archive keeps their section structure.

> **Requires Obsidian 1.1.0 or later** (uses `Vault.process` for safe read-modify-write).

## Use the plugin

1. Enable **Todo2Done** in Obsidian's Community plugins settings.
2. Open **Settings → Todo2Done** and set the source and target note paths. Paths are relative to the vault root.
3. Run **Move completed tasks** from the Command Palette, or select the archive icon in the ribbon.

By default, the source is `TODO.md` and the target is `DONE.md`. The source note must already exist. If the target note does not exist, the plugin creates it with a `# Done` heading.

## What gets moved

The plugin recognizes task lines whose list marker is followed by a checked box, including `- [x]`, `* [X]`, and `+ [x]`. Indentation before the list marker is allowed. Checkbox-looking text inside fenced code blocks is ignored.

### Subtree rules

A completed task moves only if it is part of a fully completed subtree: the task itself must be checked, every task nested under it must be checked, and every task it is nested under must be checked. In other words, checked children of unchecked parents stay put, and checked parents with unchecked children stay put too. This keeps partially finished work together instead of splitting it across two notes.

- Checked children of an unchecked parent stay in the source (the parent is still open).
- A checked parent with an unchecked child stays in the source (the subtree is not fully done).
- A fully checked subtree moves as one block, preserving indentation and order.
- An orphan checked task with no task ancestors (e.g. nested under a plain bullet) moves on its own.

Cancelled tasks (`- [-]`) are treated as open, so they block their checked children from moving.

### Heading routing

For each moved subtree, the plugin uses the root task's nearest preceding Markdown heading (`#` through `######`) as its section. The source heading remains in place. In the target, tasks are added to a section with the same heading; if that section does not exist, it is appended. Tasks without a preceding heading go under `## Uncategorized`.

### Known limitations

- Setext headings (`Title` underlined with `===` or `---`) are not recognized as headings; tasks under them are routed as if no heading preceded them. Use ATX headings (`# Title`) in source notes.
- Tasks are appended to the target without deduplication. Running the command twice on the same source note (before the source update is applied) would duplicate the tasks; the plugin's safety checks make this unlikely, but it is not prevented.

## Safety

The source and target must be different notes. The plugin uses `Vault.process` for both writes, so a concurrent edit to either note aborts the move instead of overwriting it. If the target was updated but the source could not be, the plugin rolls the target back; if rollback also fails, it asks you to review both notes before retrying.

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

Run tests with:

```bash
npm run test
```
