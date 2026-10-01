# Worko

Worko is a private Windows daily planner with a separate, resizable desktop widget. It retains the original TaskNest data directory and browser storage keys so existing tasks remain available after the rename.

## Install

1. Open the `dist` folder.
2. Run `Worko-Setup-2.6.0.exe`.
3. Choose an install location. The installer creates a desktop shortcut.

## Worko 2.6 trail workspace

The redesigned workspace separates a quiet task list from a compact mountain hut with **Climb** (Focus) and **Trek** (time-target) tabs. Trail journal notes are saved by date; press **Ctrl + Enter** on a line to turn it into a task. The matching widget has **Trail**, **Trek**, **Journal**, and **Finds** modes. Notes and tasks synchronize between the planner and widget on the same device/storage origin.

Version 2.5.1 adds Himalayan-tinted frost: sage task surfaces, lavender focus controls, glacier-toned sessions, and stone-coloured notepads inside a charcoal frame. A fine procedural grain and original mountain photograph add texture without obscuring task text. Mountain contours move subtly, with a static reduced-motion alternative.

Version 2.6 adds custom floating dropdowns across the app, with keyboard navigation, type-to-find, clear selected states, and native-select fallbacks. Segmented controls glide between modes, dialog sheets settle in and out, and completion checks have a short spring response. Reduced motion disables these effects. Existing saved data and native change events are preserved.

The trail vocabulary is consistent: **Basecamp** (Inbox), **Today’s trail** (Today), **Horizon** (Upcoming), **Avalanche** (Overdue), **Summits** (Completed), **Weekly ascent** (Weekly targets), **Expeditions** (Projects), **Trail finds** (saved content), **Climb** (Focus) and **Trek** (time targets). Tooltips, page subtitles and the “Behind the trail” glossary explain the mappings.

Original, non-sacred geometric borders draw inspiration from [Kullu weaving in Himachal Pradesh](https://himachaltourism.gov.in/destination/ethnic/). Fine line-and-dot journal details draw inspiration from [Kumaon’s Aipan tradition in Uttarakhand](https://www.incredibleindia.gov.in/en/uttarakhand/aipan-the-vibrant-folk-art-of-uttarakhand). These are contemporary UI interpretations, not reproductions of ceremonial artwork or claims of regional authenticity.

The macOS-inspired material is implemented in CSS, not Apple's native Liquid Glass framework. Inter is bundled locally for offline use, and reduced-motion/transparency preferences are respected. Existing TaskNest storage keys, task fields, and Windows data locations are unchanged.

## Use

- Choose a date, type a task, and press Enter or the **Add** button. Every task is saved under that date.
- The home screen puts quick add and the task list first. Open **Chart your trail** for priorities and missed-task recovery, **Trek** for time targets, or **Trail map** for the calendar and reminders.
- Click the microphone beside the task field, speak naturally, review the transcription, and press **Add**. Voice entry is available in both the planner and desktop widget.
- Use **Inbox**, **Today**, **Upcoming**, **Overdue**, and **Completed** to manage tasks by state and schedule.
- Open a task to add a description, status, due time, estimate, project, subtasks, recurrence, and multiple reminders.
- Drag task rows to reorder them, or use **Select** to complete, move, or delete several tasks together.
- Duplicate, edit, or delete a task from its **···** menu. Deleted tasks can be restored immediately with **Undo**.
- Repeat tasks daily, weekly, monthly, on selected weekdays, or on a custom interval. Completing one automatically creates exactly one next occurrence.
- Add several alerts before a deadline or at exact times. Due alerts can be completed, dismissed, or snoozed for 10 minutes.
- The installed Windows app remains available in the system tray so reminders continue while its main window is closed, and starts quietly with Windows whenever reminder tasks exist.
- The web app supports browser notifications when permission is enabled and keeps an offline-ready app shell.
- Start a live 3-, 5-, or 8-hour target, or work toward a chosen finish time such as 2:00 PM. The remaining time stays synchronized with the clock.
- Timed tasks on the same date require at least a two-hour gap; conflicting edits and reschedules are stopped with a clear explanation.
- Create projects from the **Projects** page and assign tasks from the full task editor.
- Open **Content** to collect videos, articles, audio, and ideas. Save a link with notes, optionally put it on today's list, and mark it explored when finished.
- Open **Weekly targets** to create a recurring goal such as “Deep work — 3 days.”
- Add a weekly target to the selected day to create a linked daily task. Completing that task automatically updates the weekly progress, and the task also appears in the desktop widget.
- Click the square beside a task to complete it.
- Click a task's title to edit its name, priority, date, and other details.
- Deleted tasks can be restored immediately with **Undo**.
- Use **All**, **Open**, and **Done** to filter the list.
- **Hide completed** keeps finished tasks in your daily record without cluttering the list.
- Click **Put today’s tasks on your desktop** to open the separate widget.
- Add or complete today’s tasks directly inside the widget. It stays synced with the planner.
- Switch the widget to **Saved** to quickly paste a link or capture an idea; the item appears in the planner's Content view.
- Click a task in the widget to edit its title inline.
- Resize the widget by dragging any edge or corner, and move it by dragging its title bar.
- The pin icon controls whether the widget stays above other windows.
- Once added, the widget launches with Windows. Use **Remove from desktop** to disable it.
- Use **Recent days** in the planner to revisit your daily record.

Tasks are stored locally in the Windows application-data folder and remain available after restarting Worko.
Worko keeps two rotating local backups, recovers from a damaged primary task file, and prevents stale widget updates from overwriting newer edits.

## Shortcuts

- `Ctrl + K`: focus the quick-add field
- `Ctrl + T`: return to today in the full planner
