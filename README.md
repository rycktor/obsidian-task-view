# Task View for Obsidian

Linked Supabase task views embedded in Obsidian notes.

## Install with BRAT

1. Install and enable the BRAT community plugin in Obsidian.
2. Run **BRAT: Add a beta plugin for testing**.
3. Enter `rycktor/obsidian-task-view`.
4. Enable **Task View** in Community plugins.

BRAT can then install future releases on desktop and mobile without manually
copying plugin files.

## View syntax

````markdown
```task-view
title: Ristrutturazione casa
project: ristrutturazione-casa
completed: false
priority: 1
due: upcoming
sort: due_date
group: project
limit: 100
```
````

Set `group` to `project` or `due_date` to divide one view into sections. Due-date
groups use Overdue, Today, Tomorrow, individual future dates, and No due date.
Omit `group` for the original flat list.

Supported `due` values: `today`, `overdue`, `upcoming`, `no-date`. Omit a filter to include every value.

Use the command **Task View: Insert linked task view** to create a view with a form. Configure the Supabase URL and public key in Obsidian settings, then log in with the existing task-webapp account.

To filter a project note using its own filename, use:

````markdown
```task-view
project: "{{title}}"
```
````

The plugin resolves the current note name even when `{{title}}` is left literal by the template engine, and removes a leading `P - ` or `P_`. For example, both `P - Luminair.md` and `P_Luminair.md` resolve to the project `Luminair`.

The plugin stores Supabase access and refresh tokens in its local Obsidian plugin data. It never stores the password and must never be configured with a service-role key.

## Quick add

The composer recognizes trailing natural dates such as `tod`, `tom`, `fri`,
`this w`, `next w`, `in 3 days`, `in 2 weeks`, and `in 1 month`. Confirm the
suggestion with Enter or touch, then submit the task with a second Enter.

Type `#` to search active projects. Select a project with arrow keys and Enter,
or with mouse/touch. The selected date and project appear as removable chips.

Pressing Enter with confirmed chips creates the task without removing them.
Project names are shown as compact badges beside task titles. Click a task row
to edit its title, description, project, due date, priority, and completion
status, or to soft-delete it.

## Quick reschedule

Click the calendar icon at the far right of any task to change its due date
without opening the full task editor. The compact dialog offers Today,
Tomorrow, Monday, Next weekend, No date, and a native date picker. Changes are
saved immediately to Supabase.
