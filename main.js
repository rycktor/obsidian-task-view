"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TaskViewPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  supabaseUrl: "",
  anonKey: "",
  accessToken: "",
  refreshToken: "",
  userId: ""
};
var TaskViewPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new TaskViewSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("task-view", (source, el, ctx) => {
      const child = new TaskViewRenderChild(el, this, parseConfig(source));
      ctx.addChild(child);
    });
    this.addCommand({
      id: "insert-linked-task-view",
      name: "Insert linked task view",
      editorCallback: (editor) => new InsertViewModal(this.app, this, editor).open()
    });
    this.addCommand({
      id: "log-in-to-supabase",
      name: "Log in to Supabase",
      callback: () => new LoginModal(this.app, this).open()
    });
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  configured() {
    return Boolean(this.settings.supabaseUrl && this.settings.anonKey);
  }
  async request(path, init = {}, retry = true) {
    if (!this.configured()) throw new Error("Configure Supabase in Task View settings.");
    const response = await fetch(`${this.settings.supabaseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        apikey: this.settings.anonKey,
        Authorization: `Bearer ${this.settings.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    if (response.status === 401 && retry && this.settings.refreshToken) {
      await this.refreshSession();
      return this.request(path, init, false);
    }
    if (!response.ok) throw new Error(await response.text() || `Supabase error ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : void 0;
  }
  async login(email, password) {
    const session = await this.request(
      "/auth/v1/token?grant_type=password",
      { method: "POST", body: JSON.stringify({ email, password }), headers: { Authorization: `Bearer ${this.settings.anonKey}` } },
      false
    );
    await this.storeSession(session);
  }
  async refreshSession() {
    const session = await this.request(
      "/auth/v1/token?grant_type=refresh_token",
      { method: "POST", body: JSON.stringify({ refresh_token: this.settings.refreshToken }), headers: { Authorization: `Bearer ${this.settings.anonKey}` } },
      false
    );
    await this.storeSession(session);
  }
  async storeSession(session) {
    this.settings.accessToken = session.access_token;
    this.settings.refreshToken = session.refresh_token;
    this.settings.userId = session.user.id;
    await this.saveSettings();
  }
  async projects() {
    return this.request("/rest/v1/projects?select=id,name,slug,status&order=name.asc");
  }
  async tasks(config) {
    var _a, _b, _c;
    const params = new URLSearchParams({
      select: "id,user_id,title,description,due_date,priority,project,project_id,completed",
      deleted_at: "is.null",
      completed: `eq.${(_a = config.completed) != null ? _a : false}`,
      order: `${(_b = config.sort) != null ? _b : "due_date"}.asc.nullslast`,
      limit: String((_c = config.limit) != null ? _c : 100)
    });
    if (config.priority) params.set("priority", `eq.${config.priority}`);
    if (config.project) {
      const projects = await this.projects();
      const project = projects.find((item) => {
        var _a2;
        return item.slug === config.project || item.name.toLowerCase() === ((_a2 = config.project) == null ? void 0 : _a2.toLowerCase());
      });
      if (!project) return [];
      params.set("project_id", `eq.${project.id}`);
    }
    const date = localDate();
    if (config.due === "today") params.set("due_date", `eq.${date}`);
    if (config.due === "overdue") params.set("due_date", `lt.${date}`);
    if (config.due === "upcoming") params.set("due_date", `gt.${date}`);
    if (config.due === "no-date") params.set("due_date", "is.null");
    return this.request(`/rest/v1/tasks?${params}`);
  }
  async updateTask(id, patch) {
    await this.request(`/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      headers: { Prefer: "return=minimal" }
    });
  }
  async createTask(title, config, dueDate, projectSlug) {
    var _a, _b, _c, _d;
    let projectId = null;
    let legacyProjectSlug = null;
    const effectiveProject = projectSlug != null ? projectSlug : config.project;
    if (effectiveProject) {
      const project = (await this.projects()).find((item) => item.slug === effectiveProject || item.name.toLowerCase() === effectiveProject.toLowerCase());
      projectId = (_a = project == null ? void 0 : project.id) != null ? _a : null;
      legacyProjectSlug = (_b = project == null ? void 0 : project.slug) != null ? _b : null;
    }
    await this.request("/rest/v1/tasks", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: this.settings.userId,
        title,
        completed: (_c = config.completed) != null ? _c : false,
        priority: (_d = config.priority) != null ? _d : null,
        project_id: projectId,
        project: legacyProjectSlug,
        due_date: dueDate != null ? dueDate : null
      })
    });
  }
};
var TaskViewRenderChild = class extends import_obsidian.MarkdownRenderChild {
  constructor(container, plugin, config) {
    super(container);
    this.plugin = plugin;
    this.config = config;
  }
  async onload() {
    await this.render();
  }
  async render() {
    this.containerEl.empty();
    this.containerEl.addClass("task-view");
    if (!this.plugin.settings.accessToken) {
      this.containerEl.createDiv({ cls: "task-view__error", text: "Task View: log in from plugin settings." });
      return;
    }
    const header = this.containerEl.createDiv({ cls: "task-view__header" });
    header.createDiv({ cls: "task-view__title", text: this.config.title || this.config.project || "Tasks" });
    const refresh = header.createEl("button", { text: "Refresh" });
    refresh.addEventListener("click", () => void this.render());
    const list = this.containerEl.createDiv({ cls: "task-view__list" });
    try {
      const [tasks, projects] = await Promise.all([this.plugin.tasks(this.config), this.plugin.projects()]);
      if (!tasks.length) list.createDiv({ cls: "task-view__empty", text: "No tasks in this view." });
      else if (this.config.group) this.renderGroups(list, tasks, projects, this.config.group);
      else for (const task of tasks) this.renderTask(list, task, projects);
      await this.renderComposer();
    } catch (error) {
      list.createDiv({ cls: "task-view__error", text: error instanceof Error ? error.message : "Unable to load tasks." });
    }
  }
  renderGroups(list, tasks, projects, groupBy) {
    const groups = /* @__PURE__ */ new Map();
    for (const task of tasks) {
      const group = groupBy === "project" ? projectGroup(task, projects) : dueDateGroup(task);
      const existing = groups.get(group.key);
      if (existing) existing.tasks.push(task);
      else groups.set(group.key, { label: group.label, tasks: [task] });
    }
    const orderedGroups = [...groups.entries()];
    if (groupBy === "project") orderedGroups.sort(([keyA, a], [keyB, b]) => {
      if (keyA === "project:none") return 1;
      if (keyB === "project:none") return -1;
      return a.label.localeCompare(b.label, void 0, { sensitivity: "base" });
    });
    for (const [, group] of orderedGroups) {
      const section = list.createDiv({ cls: "task-view__group" });
      const heading = section.createDiv({ cls: "task-view__group-heading" });
      heading.createSpan({ text: group.label });
      heading.createSpan({ cls: "task-view__group-count", text: String(group.tasks.length) });
      for (const task of group.tasks) this.renderTask(section, task, projects);
    }
  }
  renderTask(list, task, projects) {
    var _a;
    const row = list.createDiv({ cls: "task-view__row" });
    const checkbox = row.createEl("input", { type: "checkbox" });
    checkbox.checked = task.completed;
    const body = row.createDiv({ cls: "task-view__task-body" });
    const titleLine = body.createDiv({ cls: "task-view__title-line" });
    titleLine.createDiv({ cls: `task-view__task-title${task.completed ? " is-completed" : ""}`, text: task.title });
    const project = projects.find((item) => item.id === task.project_id);
    if (project) titleLine.createSpan({ cls: "task-view__project-badge", text: project.name });
    if (task.description) body.createDiv({ cls: "task-view__description", text: task.description });
    const metadata = [task.due_date, task.priority ? priorityLabel(task.priority) : ""].filter(Boolean).join(" \xB7 ");
    if (metadata) body.createDiv({ cls: `task-view__meta task-view__priority-${(_a = task.priority) != null ? _a : 3}`, text: metadata });
    body.addEventListener("click", () => new TaskEditModal(this.plugin.app, this.plugin, task, projects, () => void this.render()).open());
    const schedule = row.createEl("button", { cls: "task-view__schedule", attr: { "aria-label": `Reschedule ${task.title}` } });
    (0, import_obsidian.setIcon)(schedule, "calendar-days");
    schedule.addEventListener("click", () => new QuickDateModal(this.plugin.app, task, schedule.getBoundingClientRect(), async (dueDate) => {
      await this.plugin.updateTask(task.id, { due_date: dueDate });
      await this.render();
    }).open());
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      try {
        await this.plugin.updateTask(task.id, { completed: checkbox.checked });
        await this.render();
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        new import_obsidian.Notice(String(error));
      } finally {
        checkbox.disabled = false;
      }
    });
  }
  async renderComposer() {
    var _a, _b;
    const form = this.containerEl.createEl("form", { cls: "task-view__composer" });
    const editor = form.createDiv({ cls: "task-view__composer-editor" });
    const chips = editor.createDiv({ cls: "task-view__chips" });
    const input = editor.createEl("input", { type: "text", placeholder: "Add a task\u2026" });
    const suggestions = editor.createDiv({ cls: "task-view__suggestions" });
    suggestions.hide();
    const add = form.createEl("button", { type: "submit", text: "Add" });
    add.setAttr("type", "submit");
    let projects = [];
    try {
      projects = (await this.plugin.projects()).filter((item) => item.status === "Doing" || item.status === "On Hold");
    } catch (e) {
    }
    let selectedProject = (_b = (_a = projects.find(
      (item) => {
        var _a2;
        return item.slug === this.config.project || item.name.toLowerCase() === ((_a2 = this.config.project) == null ? void 0 : _a2.toLowerCase());
      }
    )) == null ? void 0 : _a.slug) != null ? _b : "";
    let confirmedDate = "";
    let highlightedProject = 0;
    const renderChips = () => {
      var _a2;
      chips.empty();
      if (selectedProject) {
        const project = projects.find((item) => item.slug === selectedProject);
        const chip = chips.createEl("button", { cls: "task-view__chip", text: `# ${(_a2 = project == null ? void 0 : project.name) != null ? _a2 : selectedProject}` });
        chip.setAttr("type", "button");
        chip.setAttr("aria-label", "Remove project");
        chip.addEventListener("click", () => {
          selectedProject = "";
          renderChips();
          input.focus();
        });
      }
      if (confirmedDate) {
        const chip = chips.createEl("button", { cls: "task-view__chip", text: `\u25F7 ${dateLabel(confirmedDate)}` });
        chip.setAttr("type", "button");
        chip.setAttr("aria-label", "Remove due date");
        chip.addEventListener("click", () => {
          confirmedDate = "";
          renderChips();
          input.focus();
        });
      }
      chips.toggle(Boolean(selectedProject || confirmedDate));
    };
    const currentProjectMatches = () => {
      const mention = projectMention(input.value);
      if (!mention) return [];
      return projects.filter((item) => `${item.name} ${item.slug}`.toLowerCase().includes(mention.query));
    };
    const chooseProject = (project) => {
      const mention = projectMention(input.value);
      if (mention) input.value = input.value.slice(0, mention.start).trimEnd();
      selectedProject = project.slug;
      highlightedProject = 0;
      suggestions.hide();
      renderChips();
      input.focus();
    };
    const renderSuggestions = () => {
      suggestions.empty();
      const matches = currentProjectMatches();
      if (!projectMention(input.value)) {
        const dateMatch = parseNaturalDate(input.value);
        if (!dateMatch) {
          suggestions.hide();
          return;
        }
        suggestions.show();
        const option = suggestions.createEl("button", {
          cls: "task-view__suggestion is-active",
          text: `Due ${dateLabel(dateMatch.date)} \xB7 press Enter`
        });
        option.setAttr("type", "button");
        option.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          confirmNaturalDate();
          suggestions.hide();
          input.focus();
        });
        return;
      }
      suggestions.show();
      if (!matches.length) {
        suggestions.createDiv({ cls: "task-view__suggestion-empty", text: "No matching projects" });
        return;
      }
      highlightedProject = Math.min(highlightedProject, matches.length - 1);
      matches.forEach((project, index) => {
        const option = suggestions.createEl("button", { cls: `task-view__suggestion${index === highlightedProject ? " is-active" : ""}`, text: project.name });
        option.setAttr("type", "button");
        option.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          chooseProject(project);
        });
      });
    };
    const confirmNaturalDate = () => {
      const match = parseNaturalDate(input.value);
      if (!match) return false;
      input.value = match.title;
      confirmedDate = match.date;
      renderChips();
      return true;
    };
    input.addEventListener("input", () => {
      highlightedProject = 0;
      renderSuggestions();
    });
    input.addEventListener("keydown", (event) => {
      const matches = currentProjectMatches();
      if (matches.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        highlightedProject = (highlightedProject + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
        renderSuggestions();
        return;
      }
      if (event.key === "Escape" && projectMention(input.value)) {
        suggestions.hide();
        return;
      }
      if (event.key === "Enter" && matches.length) {
        event.preventDefault();
        chooseProject(matches[highlightedProject]);
        return;
      }
      if (event.key === "Enter" && confirmNaturalDate()) event.preventDefault();
    });
    renderChips();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      input.disabled = true;
      add.disabled = true;
      try {
        await this.plugin.createTask(title, this.config, confirmedDate || void 0, selectedProject || void 0);
        await this.render();
      } catch (error) {
        new import_obsidian.Notice(String(error));
        input.disabled = false;
      }
    });
  }
};
var QuickDateModal = class extends import_obsidian.Modal {
  constructor(app, task, anchor, onChoose) {
    super(app);
    this.task = task;
    this.anchor = anchor;
    this.onChoose = onChoose;
  }
  onOpen() {
    var _a;
    this.modalEl.addClass("task-view-date-modal");
    this.setTitle("Reschedule task");
    this.contentEl.createDiv({ cls: "task-view-date-modal__task", text: this.task.title });
    const options = this.contentEl.createDiv({ cls: "task-view-date-modal__options" });
    const quickDates = [
      { label: "Today", detail: shortWeekday(localDate()), date: localDate(), icon: "calendar-check" },
      { label: "Tomorrow", detail: shortWeekday(relativeDate(1)), date: relativeDate(1), icon: "sun" },
      { label: "Monday", detail: compactDate(nextWeekday(1)), date: nextWeekday(1), icon: "arrow-right" },
      { label: "Next weekend", detail: compactDate(nextWeekday(6)), date: nextWeekday(6), icon: "armchair" }
    ];
    for (const option of quickDates) {
      const button = options.createEl("button", { cls: "task-view-date-modal__option" });
      const icon = button.createSpan({ cls: "task-view-date-modal__icon" });
      (0, import_obsidian.setIcon)(icon, option.icon);
      button.createSpan({ cls: "task-view-date-modal__label", text: option.label });
      button.createSpan({ cls: "task-view-date-modal__detail", text: option.detail });
      button.addEventListener("click", () => void this.choose(option.date, button));
    }
    const noDate = options.createEl("button", { cls: "task-view-date-modal__option" });
    const noDateIcon = noDate.createSpan({ cls: "task-view-date-modal__icon" });
    (0, import_obsidian.setIcon)(noDateIcon, "calendar-x");
    noDate.createSpan({ cls: "task-view-date-modal__label", text: "No date" });
    noDate.addEventListener("click", () => void this.choose(null, noDate));
    const custom = this.contentEl.createEl("label", { cls: "task-view-date-modal__custom", text: "Choose a date" });
    const input = custom.createEl("input", { type: "date" });
    input.value = (_a = this.task.due_date) != null ? _a : "";
    input.addEventListener("change", () => {
      if (input.value) void this.choose(input.value, input);
    });
    window.requestAnimationFrame(() => this.positionNearAnchor());
  }
  positionNearAnchor() {
    if (window.innerWidth < 700) return;
    const edge = 12;
    const right = Math.max(edge, window.innerWidth - this.anchor.right);
    const preferredTop = this.anchor.top - 88;
    const maxTop = window.innerHeight - this.modalEl.offsetHeight - edge;
    this.modalEl.style.position = "fixed";
    this.modalEl.style.right = `${right}px`;
    this.modalEl.style.left = "auto";
    this.modalEl.style.top = `${Math.max(edge, Math.min(preferredTop, maxTop))}px`;
    this.modalEl.style.transform = "none";
  }
  async choose(dueDate, control) {
    control.disabled = true;
    try {
      await this.onChoose(dueDate);
      this.close();
    } catch (error) {
      new import_obsidian.Notice(error instanceof Error ? error.message : "Unable to update the due date.");
      control.disabled = false;
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var TaskEditModal = class extends import_obsidian.Modal {
  constructor(app, plugin, task, projects, onSaved) {
    super(app);
    this.plugin = plugin;
    this.task = task;
    this.projects = projects;
    this.onSaved = onSaved;
  }
  onOpen() {
    var _a, _b;
    this.setTitle("Task details");
    const grid = this.contentEl.createDiv({ cls: "task-view-modal-grid" });
    const title = modalInput(grid, "Title", "text", this.task.title);
    const descriptionLabel = grid.createEl("label", { text: "Description" });
    const description = descriptionLabel.createEl("textarea");
    description.value = (_a = this.task.description) != null ? _a : "";
    description.rows = 4;
    const projectLabel = grid.createEl("label", { text: "Project" });
    const project = projectLabel.createEl("select");
    project.add(new Option("No project", ""));
    for (const item of this.projects.filter((entry) => entry.status !== "Completed" || entry.id === this.task.project_id)) {
      project.add(new Option(item.name, item.id, false, item.id === this.task.project_id));
    }
    const dueDate = modalInput(grid, "Due date", "date", (_b = this.task.due_date) != null ? _b : "");
    const priorityLabelEl = grid.createEl("label", { text: "Priority" });
    const priority = priorityLabelEl.createEl("select");
    priority.add(new Option("No priority", ""));
    priority.add(new Option("High", "1", false, this.task.priority === 1));
    priority.add(new Option("Medium", "2", false, this.task.priority === 2));
    priority.add(new Option("Low", "3", false, this.task.priority === 3));
    const completedLabel = grid.createEl("label", { cls: "task-view__completed-field" });
    const completed = completedLabel.createEl("input", { type: "checkbox" });
    completed.checked = this.task.completed;
    completedLabel.appendText(" Completed");
    const actions = this.contentEl.createDiv({ cls: "task-view__modal-actions" });
    const remove = actions.createEl("button", { cls: "mod-warning", text: "Delete" });
    remove.setAttr("type", "button");
    const save = actions.createEl("button", { cls: "mod-cta", text: "Save" });
    save.setAttr("type", "button");
    save.addEventListener("click", async () => {
      var _a2, _b2;
      const cleanTitle = title.value.trim();
      if (!cleanTitle) {
        new import_obsidian.Notice("The task title cannot be empty.");
        return;
      }
      save.disabled = true;
      const selectedProject = this.projects.find((item) => item.id === project.value);
      try {
        await this.plugin.updateTask(this.task.id, {
          title: cleanTitle,
          description: description.value.trim() || null,
          project: (_a2 = selectedProject == null ? void 0 : selectedProject.slug) != null ? _a2 : null,
          project_id: (_b2 = selectedProject == null ? void 0 : selectedProject.id) != null ? _b2 : null,
          due_date: dueDate.value || null,
          priority: priority.value ? Number(priority.value) : null,
          completed: completed.checked
        });
        this.close();
        this.onSaved();
      } catch (error) {
        new import_obsidian.Notice(String(error));
        save.disabled = false;
      }
    });
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Delete \u201C${this.task.title}\u201D?`)) return;
      remove.disabled = true;
      try {
        await this.plugin.updateTask(this.task.id, { deleted_at: (/* @__PURE__ */ new Date()).toISOString() });
        this.close();
        this.onSaved();
      } catch (error) {
        new import_obsidian.Notice(String(error));
        remove.disabled = false;
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var LoginModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    this.setTitle("Log in to Task View");
    const email = this.contentEl.createEl("input", { type: "email", placeholder: "Email" });
    email.style.width = "100%";
    const password = this.contentEl.createEl("input", { type: "password", placeholder: "Password" });
    password.style.width = "100%";
    password.style.marginTop = "8px";
    const button = this.contentEl.createEl("button", { text: "Log in" });
    button.style.marginTop = "12px";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await this.plugin.login(email.value.trim(), password.value);
        new import_obsidian.Notice("Task View connected.");
        this.close();
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : "Login failed.");
        button.disabled = false;
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var InsertViewModal = class extends import_obsidian.Modal {
  constructor(app, plugin, editor) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
    this.projects = [];
  }
  async onOpen() {
    this.setTitle("Insert linked task view");
    const grid = this.contentEl.createDiv({ cls: "task-view-modal-grid" });
    const title = field(grid, "View title", "input");
    const project = field(grid, "Project", "select");
    project.add(new Option("All projects", ""));
    try {
      this.projects = await this.plugin.projects();
      for (const item of this.projects) project.add(new Option(item.name, item.slug));
    } catch (e) {
      new import_obsidian.Notice("Projects could not be loaded; you can still insert a general view.");
    }
    const status = field(grid, "Status", "select");
    status.add(new Option("Open", "false"));
    status.add(new Option("Completed", "true"));
    const due = field(grid, "Due date", "select");
    for (const [label, value] of [["Any", "any"], ["Today", "today"], ["Overdue", "overdue"], ["Upcoming", "upcoming"], ["No date", "no-date"]]) due.add(new Option(label, value));
    const priority = field(grid, "Priority", "select");
    priority.add(new Option("Any", ""));
    priority.add(new Option("High", "1"));
    priority.add(new Option("Medium", "2"));
    priority.add(new Option("Low", "3"));
    const group = field(grid, "Group by", "select");
    group.add(new Option("None", ""));
    group.add(new Option("Project", "project"));
    group.add(new Option("Due date", "due_date"));
    const insert = this.contentEl.createEl("button", { text: "Insert view" });
    insert.addEventListener("click", () => {
      const lines = ["```task-view"];
      if (title.value.trim()) lines.push(`title: ${title.value.trim()}`);
      if (project.value) lines.push(`project: ${project.value}`);
      lines.push(`completed: ${status.value}`);
      if (due.value !== "any") lines.push(`due: ${due.value}`);
      if (priority.value) lines.push(`priority: ${priority.value}`);
      if (group.value) lines.push(`group: ${group.value}`);
      lines.push("sort: due_date", "```");
      const cursor = this.editor.getCursor();
      const fencesBeforeCursor = this.editor.getRange({ line: 0, ch: 0 }, cursor).split("\n").filter((line) => /^\s*```/.test(line)).length;
      if (fencesBeforeCursor % 2 !== 0) {
        new import_obsidian.Notice("Move the cursor outside the current code block, then insert the Task View.");
        return;
      }
      const currentLine = this.editor.getLine(cursor.line);
      const beforeCursor = currentLine.slice(0, cursor.ch);
      const afterCursor = currentLine.slice(cursor.ch);
      const previousLine = cursor.line > 0 ? this.editor.getLine(cursor.line - 1) : "";
      const nextLine = cursor.line < this.editor.lineCount() - 1 ? this.editor.getLine(cursor.line + 1) : "";
      const prefix = beforeCursor.trim() || previousLine.trim() ? "\n\n" : "";
      const suffix = afterCursor.trim() || nextLine.trim() ? "\n\n" : "";
      this.editor.replaceSelection(`${prefix}${lines.join("\n")}${suffix}`);
      this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var TaskViewSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.empty();
    new import_obsidian.Setting(this.containerEl).setName("Supabase URL").addText((text) => text.setValue(this.plugin.settings.supabaseUrl).onChange(async (value) => {
      this.plugin.settings.supabaseUrl = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("Supabase public key").setDesc("Publishable or anon key; never use the service-role key.").addText((text) => text.setValue(this.plugin.settings.anonKey).onChange(async (value) => {
      this.plugin.settings.anonKey = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("Account").setDesc(this.plugin.settings.userId ? "Connected" : "Not connected").addButton((button) => button.setButtonText("Log in").onClick(() => new LoginModal(this.app, this.plugin).open()));
  }
};
function parseConfig(source) {
  try {
    const value = (0, import_obsidian.parseYaml)(source);
    if (!value) return {};
    return {
      title: typeof value.title === "string" ? value.title : void 0,
      project: typeof value.project === "string" ? value.project : void 0,
      completed: typeof value.completed === "boolean" ? value.completed : String(value.completed) === "true",
      priority: [1, 2, 3].includes(Number(value.priority)) ? Number(value.priority) : void 0,
      due: ["today", "overdue", "upcoming", "no-date"].includes(String(value.due)) ? value.due : "any",
      group: ["project", "due_date"].includes(String(value.group)) ? value.group : void 0,
      sort: ["due_date", "created_at", "updated_at"].includes(String(value.sort)) ? value.sort : "due_date",
      limit: Number.isFinite(Number(value.limit)) ? Math.min(Math.max(Number(value.limit), 1), 500) : 100
    };
  } catch (e) {
    return {};
  }
}
function projectGroup(task, projects) {
  const project = projects.find((item) => item.id === task.project_id);
  return project ? { key: `project:${project.id}`, label: project.name } : { key: "project:none", label: "No project" };
}
function dueDateGroup(task) {
  if (!task.due_date) return { key: "due:none", label: "No due date" };
  const today = localDate();
  const tomorrowDate = /* @__PURE__ */ new Date(`${today}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateFrom(tomorrowDate);
  if (task.due_date < today) return { key: "due:overdue", label: "Overdue" };
  if (task.due_date === today) return { key: "due:today", label: "Today" };
  if (task.due_date === tomorrow) return { key: "due:tomorrow", label: "Tomorrow" };
  return {
    key: `due:${task.due_date}`,
    label: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(/* @__PURE__ */ new Date(`${task.due_date}T12:00:00`))
  };
}
function field(container, label, type) {
  const wrapper = container.createEl("label", { text: label });
  return type === "input" ? wrapper.createEl("input", { type: "text" }) : wrapper.createEl("select");
}
function modalInput(container, label, type, value) {
  const wrapper = container.createEl("label", { text: label });
  const input = wrapper.createEl("input", { type });
  input.value = value;
  return input;
}
function localDate() {
  const now = /* @__PURE__ */ new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}
function relativeDate(days) {
  const result = /* @__PURE__ */ new Date();
  result.setDate(result.getDate() + days);
  return dateFrom(result);
}
function nextWeekday(targetDay) {
  const result = /* @__PURE__ */ new Date();
  const delta = (targetDay - result.getDay() + 7) % 7 || 7;
  result.setDate(result.getDate() + delta);
  return dateFrom(result);
}
function shortWeekday(date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(/* @__PURE__ */ new Date(`${date}T12:00:00`));
}
function compactDate(date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(/* @__PURE__ */ new Date(`${date}T12:00:00`));
}
function parseNaturalDate(input, base = /* @__PURE__ */ new Date()) {
  const trimmed = input.trimEnd();
  if (!trimmed) return null;
  const numeric = trimmed.match(/(?:^|\s)(in\s+(\d+)\s+(days?|weeks?|months?))$/i);
  if ((numeric == null ? void 0 : numeric.index) !== void 0) {
    const amount = Number(numeric[2]);
    const result = new Date(base);
    const unit = numeric[3].toLowerCase();
    if (unit.startsWith("day")) result.setDate(result.getDate() + amount);
    else if (unit.startsWith("week")) result.setDate(result.getDate() + amount * 7);
    else result.setMonth(result.getMonth() + amount);
    return { date: dateFrom(result), title: trimmed.slice(0, numeric.index).trim() };
  }
  const weekdays = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const definitions = [
    { keyword: "this weekend", minimum: "this w" },
    { keyword: "next week", minimum: "next w" },
    { keyword: "today", minimum: "tod" },
    { keyword: "tomorrow", minimum: "tom" },
    ...Object.keys(weekdays).map((keyword) => ({ keyword, minimum: keyword.slice(0, 3) }))
  ];
  for (let start = 0; start < trimmed.length; start += 1) {
    if (start > 0 && !/\s/.test(trimmed[start - 1])) continue;
    const fragment = trimmed.slice(start).toLowerCase();
    const match = definitions.find((item) => fragment.length >= item.minimum.length && item.keyword.startsWith(fragment));
    if (!match) continue;
    const result = new Date(base);
    if (match.keyword === "tomorrow") result.setDate(result.getDate() + 1);
    else if (match.keyword === "this weekend") {
      const day = result.getDay();
      result.setDate(result.getDate() + (day === 0 || day === 6 ? 0 : 6 - day));
    } else if (match.keyword === "next week") result.setDate(result.getDate() + ((8 - result.getDay()) % 7 || 7));
    else if (match.keyword !== "today") result.setDate(result.getDate() + ((weekdays[match.keyword] - result.getDay() + 7) % 7 || 7));
    return { date: dateFrom(result), title: trimmed.slice(0, start).trim() };
  }
  return null;
}
function projectMention(input) {
  const match = input.match(/(?:^|\s)#([^\s#]*)$/);
  if (!match || match.index === void 0) return null;
  return { query: match[1].toLowerCase(), start: match.index + (match[0].startsWith(" ") ? 1 : 0) };
}
function dateFrom(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}
function dateLabel(date) {
  if (date === localDate()) return "Today";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(/* @__PURE__ */ new Date(`${date}T12:00:00`));
}
function priorityLabel(priority) {
  return priority === 1 ? "High priority" : priority === 2 ? "Medium priority" : "Low priority";
}
