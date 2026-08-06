# Feature Specification: Frontmatter Handling

**Feature Branch**: `021-frontmatter-handling`

**Created**: 2026-08-07

**Status**: Archived

**Input**: User description: "Frontmatter should be stripped before loading into the visual editor, always visible at the top in view source mode, and recombined on save."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a file with frontmatter in the visual editor (Priority: P1)

A user opens a markdown file that begins with a YAML frontmatter block. The visual editor displays only the document body — the frontmatter is hidden and does not appear as thematic breaks or bullet lists. The user edits the body normally without seeing or disturbing the frontmatter.

**Why this priority**: This is the core problem. Without it, the visual editor mangles frontmatter into unrelated markdown elements, corrupting the user's metadata on every open.

**Independent Test**: Open a file containing `---` delimited YAML frontmatter followed by body content. The visual editor shows only the body. No horizontal rules, bullet lists, or raw YAML text appear from the frontmatter block.

**Acceptance Scenarios**:

1. **Given** a file containing valid YAML frontmatter followed by body text, **When** the user opens it in the visual editor, **Then** only the body text is displayed and the frontmatter is not visible.
2. **Given** a file containing frontmatter with nested YAML structures (lists, maps), **When** the user opens it in the visual editor, **Then** only the body text is displayed and no artefacts of the YAML parsing appear.
3. **Given** a file with no frontmatter, **When** the user opens it in the visual editor, **Then** the entire file content is displayed as normal.

---

### User Story 2 - Save a file that has frontmatter (Priority: P1)

After editing the body in the visual editor, the user saves the file. The saved file contains the original frontmatter block intact at the top, followed by the current editor content.

**Why this priority**: Saving without restoring frontmatter would silently delete the user's metadata, violating the principle of never losing the user's words.

**Independent Test**: Open a file with frontmatter, make a body edit, save, and verify the saved file contains the original frontmatter followed by the edited body.

**Acceptance Scenarios**:

1. **Given** a file with frontmatter that was opened in the visual editor, **When** the user makes edits and saves, **Then** the saved file contains the original frontmatter block followed by the edited body.
2. **Given** a file with no frontmatter, **When** the user edits and saves, **Then** the saved file contains only the edited body with no frontmatter block added.
3. **Given** a file with frontmatter, **When** the user makes no edits and saves, **Then** the saved file is identical to the original.

---

### User Story 3 - View and edit frontmatter in source mode (Priority: P2)

The user switches to view source mode. The full file content is displayed, including the frontmatter block at the top. The user can edit the frontmatter directly. When switching back to the visual editor, the updated frontmatter is preserved.

**Why this priority**: Users need to manage their metadata. Source mode is the appropriate place for this since the visual editor cannot represent YAML.

**Independent Test**: Open a file with frontmatter, switch to view source mode, verify frontmatter is visible at the top, edit it, switch back to visual editor, then verify the updated frontmatter is preserved on save.

**Acceptance Scenarios**:

1. **Given** a file with frontmatter open in the visual editor, **When** the user switches to view source mode, **Then** the frontmatter block is visible at the top of the source, followed by the body content.
2. **Given** a file in source view, **When** the user edits the frontmatter and switches back to the visual editor, **Then** the visual editor shows only the body and the edited frontmatter is preserved for the next save.
3. **Given** a file with no frontmatter in source view, **When** the user adds a valid frontmatter block at the top and switches to the visual editor, **Then** the frontmatter is extracted, hidden from the visual editor, and preserved for the next save.
4. **Given** a file in source view, **When** the user removes the frontmatter block entirely and switches to the visual editor, **Then** the visual editor shows the body and the file no longer has frontmatter on save.

---

### User Story 4 - Round-trip fidelity of frontmatter (Priority: P2)

A user opens a file with frontmatter, makes no changes, and saves. The frontmatter in the saved file is byte-identical to the original. Formatting, key order, comments, and whitespace within the frontmatter are preserved.

**Why this priority**: Users rely on specific frontmatter formatting (e.g., for static site generators). Silently reformatting metadata would break workflows.

**Independent Test**: Open a file with complex frontmatter (comments, custom formatting, quoted strings), save without editing, and diff the result against the original.

**Acceptance Scenarios**:

1. **Given** a file with frontmatter containing comments, custom indentation, and quoted strings, **When** the user opens in the visual editor and saves without editing, **Then** the frontmatter block in the saved file is identical to the original.
2. **Given** a file with frontmatter, **When** the user edits only the body in the visual editor and saves, **Then** the frontmatter block is unchanged from the original.

---

### Edge Cases

- What happens when the file starts with `---` but has no closing `---`? The content is treated as body text (no frontmatter detected) and displayed in the visual editor as-is.
- What happens when the frontmatter contains invalid YAML? The frontmatter block is still extracted and hidden from the visual editor. It is preserved verbatim on save. The system does not attempt to validate or parse the YAML content.
- What happens when a new empty file is created? No frontmatter is present. The user can add frontmatter via source view.
- What happens when the user pastes `---` delimited content into the visual editor? It is treated as body content. Frontmatter is only extracted from the raw file on load, not from editor input.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect a YAML frontmatter block at the start of a markdown file, delimited by `---` on its own line at the start and `---` on its own line as the closing delimiter.
- **FR-002**: The system MUST separate the frontmatter block from the body content before passing content to the visual editor.
- **FR-003**: The visual editor MUST receive only the body content, with no frontmatter text, delimiters, or artefacts.
- **FR-004**: The system MUST store the extracted frontmatter separately alongside the document state for the lifetime of the editing session.
- **FR-005**: On save, the system MUST recombine the stored frontmatter and the current editor content into a single file, with the frontmatter block at the top.
- **FR-006**: The source view MUST display the full file content including frontmatter at the top when present.
- **FR-007**: When switching from source view to visual editor, the system MUST re-extract any frontmatter from the source content and update the stored frontmatter.
- **FR-008**: The system MUST preserve the frontmatter verbatim (byte-identical) when no edits are made to it.
- **FR-009**: The system MUST NOT treat `---` delimiters within the body (not at the start of the file) as frontmatter.
- **FR-010**: The system MUST handle files with no frontmatter without adding an empty frontmatter block on save.

### Key Entities

- **Document**: A markdown file with an optional frontmatter block and a body. The frontmatter is the raw text between the opening and closing `---` delimiters (inclusive). The body is everything after the closing delimiter.
- **Frontmatter**: The raw YAML text block at the start of a document, including its `---` delimiters. Stored as an opaque string — the system does not parse or validate the YAML.
- **Document State**: The in-memory representation of an open document, holding both the current body content (edited by the visual editor) and the current frontmatter string (edited only via source view).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of files with valid frontmatter open in the visual editor without any frontmatter text or artefacts visible.
- **SC-002**: 100% of saves on files with frontmatter produce output where the frontmatter block is preserved verbatim when unedited.
- **SC-003**: Source view always displays the complete file including frontmatter, with no information loss compared to the raw file on disk.
- **SC-004**: Switching between visual and source modes any number of times does not alter the frontmatter content or the body content.

## Assumptions

- Frontmatter is defined as content between `---` delimiters at the very start of the file (line 1). This matches the Jekyll/Hugo/Grav convention.
- The system does not need to parse, validate, or understand the YAML content. It treats frontmatter as an opaque string to be preserved verbatim.
- Frontmatter editing is done exclusively through source view. The visual editor has no frontmatter UI.
- Only one frontmatter block per file is supported, at the top of the file.
- The `---` delimiter must be on its own line. Inline `---` within text is not treated as a delimiter.
