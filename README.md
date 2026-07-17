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
title: Innofood priorities
project: innofood
completed: false
priority: 1
due: upcoming
sort: due_date
limit: 100
```
````

Supported `due` values: `today`, `overdue`, `upcoming`, `no-date`. Omit a filter to include every value.

Use the command **Task View: Insert linked task view** to create a view with a form. Configure the Supabase URL and public key in Obsidian settings, then log in with the existing task-webapp account.

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
