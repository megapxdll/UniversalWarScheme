import { sitePath } from "../../lib/paths";

type CatalogEntity = {
  title: string;
  type: string;
  typeLabel: string;
  href: string;
  sourcePath: string;
  names: string[];
  portraitUrl?: string;
};

type Catalog = {
  entities: CatalogEntity[];
};

type ParsedNote = {
  type: string;
  title: string;
  characterFolder?: string;
  aliases?: string[];
  fields: Record<string, unknown>;
  sourcePath: string;
  portrait?: string;
  portraitUrl?: string;
};

let catalog: Catalog = { entities: [] };

function chips(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>("[data-chip]")].map((el) => el.dataset.chip ?? "").filter(Boolean);
}

function addChip(root: HTMLElement, name: string, multiple: boolean) {
  const value = name.trim();
  if (!value) return;
  const holder = root.querySelector(".picker-chips");
  if (!holder) return;
  if (!multiple) holder.innerHTML = "";
  if (chips(root).some((item) => item.toLowerCase() === value.toLowerCase())) return;
  const chip = document.createElement("span");
  chip.className = "picker-chip";
  chip.dataset.chip = value;
  chip.innerHTML = `<span></span><button type="button" class="text-dim hover:text-gold" aria-label="Убрать">×</button>`;
  chip.querySelector("span")!.textContent = value;
  chip.querySelector("button")!.addEventListener("click", () => chip.remove());
  holder.append(chip);
}

function bindPicker(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>(".picker-input");
  const suggest = root.querySelector<HTMLElement>(".picker-suggest");
  if (!input || !suggest) return;
  const types = (root.dataset.types ?? "").split(",").filter(Boolean);
  const multiple = root.dataset.multiple !== "false";

  const renderSuggest = () => {
    const q = input.value.trim().toLowerCase();
    const matches = catalog.entities
      .filter((entity) => !types.length || types.includes(entity.type))
      .filter((entity) => !q || entity.names.some((name) => name.toLowerCase().includes(q)))
      .slice(0, 8);
    suggest.innerHTML = "";
    if (!q && !matches.length) {
      suggest.classList.add("hidden");
      return;
    }
    for (const entity of matches) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "block w-full px-3 py-2 text-left text-sm hover:bg-panel";
      btn.textContent = `${entity.title} · ${entity.typeLabel}`;
      btn.addEventListener("click", () => {
        addChip(root, entity.title, multiple);
        input.value = "";
        suggest.classList.add("hidden");
      });
      suggest.append(btn);
    }
    if (q && !matches.some((entity) => entity.title.toLowerCase() === q)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "block w-full px-3 py-2 text-left text-sm text-gold hover:bg-panel";
      btn.textContent = `Ссылка [[${input.value.trim()}]] (страницы может ещё не быть)`;
      btn.addEventListener("click", () => {
        addChip(root, input.value, multiple);
        input.value = "";
        suggest.classList.add("hidden");
      });
      suggest.append(btn);
    }
    suggest.classList.toggle("hidden", !suggest.childElementCount);
  };

  input.addEventListener("input", renderSuggest);
  input.addEventListener("focus", renderSuggest);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addChip(root, input.value, multiple);
      input.value = "";
      suggest.classList.add("hidden");
    }
  });
  document.addEventListener("click", (event) => {
    if (!root.contains(event.target as Node)) suggest.classList.add("hidden");
  });
}

function val(form: HTMLFormElement, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
  return el?.value.trim() ?? "";
}

function section(form: HTMLFormElement, type: string): HTMLElement | null {
  return form.querySelector(`[data-type-form="${type}"]`);
}

function collect(form: HTMLFormElement, type: string): Record<string, unknown> {
  const root = section(form, type);
  if (!root) return {};
  const fields: Record<string, unknown> = {};
  for (const input of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[name]")) {
    if (input instanceof HTMLInputElement && input.type === "file") continue;
    if (input.closest(".entity-picker")) continue;
    fields[input.name] = input.value.trim();
  }
  for (const picker of root.querySelectorAll<HTMLElement>(".entity-picker")) {
    const name = picker.dataset.name;
    if (!name) continue;
    const values = chips(picker);
    fields[name] = picker.dataset.multiple === "false" ? (values[0] ?? "") : values;
  }
  return fields;
}

function showType(form: HTMLFormElement, type: string) {
  for (const block of form.querySelectorAll<HTMLElement>("[data-type-form]")) {
    block.classList.toggle("hidden", block.dataset.typeForm !== type);
  }
  const titleLabel = document.querySelector("#title-label");
  const aliasLabel = document.querySelector("#aliases-label");
  const titleInput = form.querySelector<HTMLInputElement>('[name="title"]');
  const aliasInput = form.querySelector<HTMLInputElement>('[name="aliases"]');
  const titleHint = document.querySelector("#title-hint");
  if (titleLabel) titleLabel.textContent = type === "character" ? "Имя карточки" : "Имя / название";
  if (aliasLabel) aliasLabel.textContent = type === "character" ? "Наименование героя" : "Алиасы через запятую";
  if (titleInput) {
    titleInput.placeholder = type === "character" ? "Дед строук Нейтан Кольт" : "Сакура";
    titleInput.required = false;
  }
  titleHint?.classList.toggle("hidden", type !== "character");
  if (aliasInput) aliasInput.placeholder = type === "character" ? "Дед строук, Dread" : "Дэниел Сольварен, Леон Астэр";
}

function autoOverall(form: HTMLFormElement) {
  const keys = ["strength", "speed", "stamina", "intellect"];
  const nums = keys.map((key) => Number(val(form, key)));
  const overall = form.querySelector<HTMLInputElement>('[name="overall"]');
  if (!overall || overall.dataset.touched === "1") return;
  if (nums.every((n) => Number.isFinite(n) && n > 0)) {
    overall.value = String(nums.reduce((a, b) => a + b, 0));
  }
}

function setSelect(el: HTMLSelectElement, value: string) {
  if (!value) return;
  if (![...el.options].some((option) => option.value === value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    el.append(option);
  }
  el.value = value;
}

function fieldEl(form: HTMLFormElement, name: string, type?: string) {
  const scoped = type ? section(form, type) : null;
  return (scoped ?? form).querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    `[name="${name}"]`,
  );
}

function setField(form: HTMLFormElement, name: string, value: unknown, type?: string) {
  const el = fieldEl(form, name, type) ?? form.querySelector(`[name="${name}"]`);
  if (!el || value == null) return;
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  if (el instanceof HTMLSelectElement) setSelect(el, text);
  else el.value = text;
}

function fillPicker(form: HTMLFormElement, type: string, name: string, value: unknown) {
  const picker = section(form, type)?.querySelector<HTMLElement>(`.entity-picker[data-name="${name}"]`);
  if (!picker) return;
  picker.querySelector(".picker-chips")!.innerHTML = "";
  const values = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
  for (const item of values) addChip(picker, item, picker.dataset.multiple !== "false");
}

function showPortrait(url: string, filename = "") {
  const preview = document.querySelector<HTMLImageElement>("#portrait-preview");
  const label = document.querySelector("#portrait-name");
  if (preview) {
    preview.src = url;
    preview.classList.remove("hidden");
  }
  if (label) label.textContent = filename;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function fillNote(form: HTMLFormElement, typeSelect: HTMLSelectElement, note: ParsedNote) {
  setSelect(typeSelect, note.type);
  typeSelect.disabled = true;
  showType(form, note.type);
  setField(form, "title", note.title);
  const titleInput = form.querySelector<HTMLInputElement>('[name="title"]');
  if (titleInput) titleInput.readOnly = true;
  setField(form, "aliases", (note.aliases ?? []).join(", "));
  if (note.type === "character") {
    setField(form, "fioRu", note.fields?.fioRu, "character");
    setField(form, "fioEn", note.fields?.fioEn, "character");
  }
  if (note.characterFolder) setField(form, "characterFolder", note.characterFolder, "character");

  const fields = note.fields ?? {};
  for (const [name, value] of Object.entries(fields)) {
    const picker = section(form, note.type)?.querySelector(`.entity-picker[data-name="${name}"]`);
    if (picker) fillPicker(form, note.type, name, value);
    else setField(form, name, value, note.type);
  }
  if (fields.overall) {
    const overall = fieldEl(form, "overall", "character");
    if (overall) overall.dataset.touched = "1";
  }
  if (note.portrait) setField(form, "portrait", note.portrait);
  if (note.portraitUrl) showPortrait(note.portraitUrl, note.portrait);

  const heading = document.querySelector("#admin-heading");
  const sub = document.querySelector("#admin-sub");
  const submit = document.querySelector("#admin-submit");
  const source = document.querySelector<HTMLInputElement>("#source-path");
  if (heading) heading.textContent = `Править: ${note.title}`;
  if (sub) sub.textContent = note.sourcePath;
  if (submit) submit.textContent = "Сохранить правки";
  if (source) source.value = note.sourcePath;
}

export function bootCatalog() {
  const search = document.querySelector<HTMLInputElement>("#catalog-q");
  const rows = [...document.querySelectorAll<HTMLElement>(".catalog-row")];
  const empty = document.querySelector("#catalog-empty");
  const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-type-filter]")];
  if (!search && !tabs.length) return;

  const params = new URLSearchParams(window.location.search);
  let type = params.get("type") || "all";
  if (type !== "all" && !tabs.some((tab) => tab.dataset.typeFilter === type)) type = "all";

  const apply = () => {
    const q = (search?.value ?? "").trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      const matchType = type === "all" || row.dataset.type === type;
      const matchQ = !q || (row.dataset.search ?? "").includes(q);
      const show = matchType && matchQ;
      row.classList.toggle("hidden", !show);
      if (show) visible += 1;
    }
    empty?.classList.toggle("hidden", visible > 0);
    for (const tab of tabs) {
      tab.classList.toggle("is-active", tab.dataset.typeFilter === type);
    }
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      type = tab.dataset.typeFilter || "all";
      const url = new URL(window.location.href);
      if (type === "all") url.searchParams.delete("type");
      else url.searchParams.set("type", type);
      history.replaceState({}, "", url);
      apply();
    });
  }
  search?.addEventListener("input", apply);
  apply();
}

export async function bootAdmin() {
  const form = document.querySelector<HTMLFormElement>("#canon-form");
  const typeSelect = document.querySelector<HTMLSelectElement>("#entity-type");
  const result = document.querySelector<HTMLElement>("#canon-result");
  if (!form || !typeSelect) return;

  try {
    const response = await fetch(sitePath("/api/admin/catalog"));
    if (!response.ok) throw new Error("Админка доступна только при npm run dev");
    catalog = await response.json();
  } catch (error) {
    if (result) {
      result.classList.remove("hidden");
      result.textContent = error instanceof Error ? error.message : "Не удалось загрузить каталог";
    }
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("type")) typeSelect.value = params.get("type") ?? "character";
  showType(form, typeSelect.value);
  typeSelect.addEventListener("change", () => {
    showType(form, typeSelect.value);
    const url = new URL(window.location.href);
    url.searchParams.set("type", typeSelect.value);
    history.replaceState({}, "", url);
  });

  for (const picker of form.querySelectorAll<HTMLElement>(".entity-picker")) bindPicker(picker);
  for (const key of ["strength", "speed", "stamina", "intellect"]) {
    form.querySelector(`[name="${key}"]`)?.addEventListener("input", () => autoOverall(form));
  }
  form.querySelector('[name="overall"]')?.addEventListener("input", (event) => {
    (event.currentTarget as HTMLInputElement).dataset.touched = "1";
  });

  const portraitFile = document.querySelector<HTMLInputElement>("#portrait-file");
  portraitFile?.addEventListener("change", () => {
    const file = portraitFile.files?.[0];
    if (!file) return;
    showPortrait(URL.createObjectURL(file), file.name);
  });

  const sourceParam = params.get("path");
  if (sourceParam) {
    try {
      const noteRes = await fetch(sitePath(`/api/admin/note?path=${encodeURIComponent(sourceParam)}`));
      const note = await noteRes.json();
      if (!noteRes.ok) throw new Error(note.error ?? "Не удалось открыть запись");
      fillNote(form, typeSelect, note);
    } catch (error) {
      if (result) {
        result.classList.remove("hidden");
        result.textContent = error instanceof Error ? error.message : "Не удалось открыть запись";
      }
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = typeSelect.value;
    const sourcePath = document.querySelector<HTMLInputElement>("#source-path")?.value.trim() ?? "";
    const fields = collect(form, type);
    const wikiFromPath = sourcePath.split(/[/\\]/).pop()?.replace(/\.md$/i, "") ?? "";
    const aliases = val(form, "aliases")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (type === "character") fields.fioRu = val(form, "fioRu") || String(fields.fioRu || "");
    const title =
      type === "character"
        ? wikiFromPath || val(form, "title") || String(fields.fioRu || "") || aliases[0] || String(fields.fioEn || "")
        : val(form, "title");
    const portrait = val(form, "portrait");
    if (portrait) fields.portrait = portrait;
    const file = portraitFile?.files?.[0];
    if (result) {
      result.classList.remove("hidden");
      result.textContent = sourcePath ? "Сохраняю правки…" : "Создаю заметку…";
    }
    try {
      if (!title) throw new Error(type === "character" ? "Нужно ФИО или наименование героя" : "Нужно имя");
      if (file) {
        const data = await fileToDataUrl(file);
        const uploaded = await fetch(sitePath("/api/admin/upload"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            mime: file.type || "image/png",
            data,
            current: String(fields.portrait ?? ""),
          }),
        });
        const body = await uploaded.json();
        if (!uploaded.ok) throw new Error(body.error ?? "Не удалось загрузить картинку");
        fields.portrait = body.filename;
        setField(form, "portrait", body.filename);
        showPortrait(body.url, body.filename);
      }
      const payload = {
        type,
        title,
        characterFolder: val(form, "characterFolder"),
        aliases,
        fields,
        sourcePath: sourcePath || undefined,
      };
      const endpoint = sitePath(sourcePath ? "/api/admin/update" : "/api/admin/create");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Ошибка");
      const linked = (body.linked as string[] | undefined)?.length
        ? ` Обновлены связи: ${body.linked.join(", ")}.`
        : " Обратных файлов для связи не нашлось — вики-ссылки всё равно записаны.";
      if (result) {
        result.innerHTML = `Готово: <code>${body.path}</code>. В Obsidian: <code>${body.wiki}</code>.${linked}`;
      }
      const source = document.querySelector<HTMLInputElement>("#source-path");
      if (source) source.value = body.path;
      typeSelect.disabled = true;
      const heading = document.querySelector("#admin-heading");
      const submit = document.querySelector("#admin-submit");
      if (heading) heading.textContent = `Править: ${title}`;
      if (submit) submit.textContent = "Сохранить правки";
      const url = new URL(window.location.href);
      url.searchParams.delete("type");
      url.searchParams.set("path", body.path);
      history.replaceState({}, "", url);
      if (portraitFile) portraitFile.value = "";
    } catch (error) {
      if (result) result.textContent = error instanceof Error ? error.message : "Ошибка";
    }
  });
}
