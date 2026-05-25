import { MODIFICATIONS } from "./modification-registry.js";
import { MODULE_ID, DAMAGE_TYPES } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CATEGORY_LABEL = {
  morphic: "MANIFEST_TULPA.Dialog.CategoryMorphic",
  combat:  "MANIFEST_TULPA.Dialog.CategoryCombat",
  resistance: "MANIFEST_TULPA.Dialog.CategoryResistance",
  movement:   "MANIFEST_TULPA.Dialog.CategoryMovement",
  skill:      "MANIFEST_TULPA.Dialog.CategorySkill",
  special:    "MANIFEST_TULPA.Dialog.CategorySpecial",
};

/**
 * @returns Promise<{damageType, modifications: string[]} | null>  resolves to null on cancel
 */
export function openCastDialog({ availableSlots }) {
  return new Promise(resolve => {
    new ManifestTulpaCastDialog({ availableSlots, resolve }).render(true);
  });
}

class ManifestTulpaCastDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "manifest-tulpa-cast-dialog",
    classes: ["manifest-tulpa-dialog"],
    tag: "form",
    window: { title: "MANIFEST_TULPA.Dialog.Title", contentClasses: ["standard-form"] },
    position: { width: 480, height: "auto" },
    form: { handler: ManifestTulpaCastDialog.#onSubmit, closeOnSubmit: true },
    actions: { cancel: ManifestTulpaCastDialog.#onCancel },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/cast-dialog.hbs` },
  };

  constructor({ availableSlots, resolve }) {
    super({});
    this.availableSlots = availableSlots;
    this.resolve = resolve;
    this.selected = new Set();
    this.damageType = "force";
    this._resolved = false;
  }

  async _prepareContext() {
    const grouped = {};
    for (const [slug, m] of Object.entries(MODIFICATIONS)) {
      (grouped[m.category] ??= []).push({ slug, ...m, isSelected: this.selected.has(slug) });
    }
    const used = this._slotsUsed();
    return {
      damageTypes: DAMAGE_TYPES,
      damageType: this.damageType,
      grouped,
      categories: Object.keys(grouped).map(k => ({ key: k, label: CATEGORY_LABEL[k] ?? k })),
      slotsUsed: used,
      slotsMax: this.availableSlots,
      overBudget: used > this.availableSlots,
    };
  }

  _slotsUsed() {
    let n = 0;
    for (const slug of this.selected) n += MODIFICATIONS[slug]?.slots ?? 0;
    return n;
  }

  _attachPartListeners(_partId, htmlElement) {
    htmlElement.querySelectorAll("input[name='damageType']").forEach(el =>
      el.addEventListener("change", ev => { this.damageType = ev.currentTarget.value; })
    );
    htmlElement.querySelectorAll("input[type='checkbox'][data-slug]").forEach(el =>
      el.addEventListener("change", ev => this._onToggle(ev))
    );
  }

  _onToggle(event) {
    const slug = event.currentTarget.dataset.slug;
    const m = MODIFICATIONS[slug];
    if (!m) return;
    if (event.currentTarget.checked) {
      // Enforce mutually-exclusive size shifts.
      if (m.mutuallyExclusive) {
        for (const other of [...this.selected]) {
          if (MODIFICATIONS[other]?.mutuallyExclusive === m.mutuallyExclusive) this.selected.delete(other);
        }
      }
      this.selected.add(slug);
    } else {
      this.selected.delete(slug);
    }
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const used = this._slotsUsed();
    if (used > this.availableSlots) {
      ui.notifications.error(`Over budget: ${used} / ${this.availableSlots}`);
      return false;
    }
    this._resolved = true;
    this.resolve({ damageType: this.damageType, modifications: [...this.selected] });
  }

  static #onCancel() {
    this._resolved = true;
    this.resolve(null);
    return this.close();
  }

  async close(options) {
    if (!this._resolved) {
      this._resolved = true;
      this.resolve(null);
    }
    return super.close(options);
  }
}
