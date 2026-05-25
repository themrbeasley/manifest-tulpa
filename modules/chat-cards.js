import { MODULE_ID } from "./constants.js";

function speakerFor(actor) {
  return ChatMessage.getSpeaker(actor ? { actor } : {});
}

function i18n(key, data = {}) {
  return game.i18n.format(key, data);
}

export async function postCast({ caster, tulpa, castConfig }) {
  const mods = castConfig.modifications.join(", ") || "—";
  const content = `
    <div class="manifest-tulpa-chat-card">
      <h3>${i18n("MANIFEST_TULPA.Chat.CastTitle")}</h3>
      <p>${i18n("MANIFEST_TULPA.Chat.CastSubtitle", { caster: caster.name })}</p>
      <p><strong>Damage:</strong> ${castConfig.damageType} &nbsp;
         <strong>Slot:</strong> ${castConfig.slotLevel}</p>
      <p><strong>Modifications:</strong> ${mods}</p>
    </div>`;
  return ChatMessage.create({ speaker: speakerFor(caster), content });
}

export async function postLinkOpen({ caster, tulpa }) {
  const content = `<p>${i18n("MANIFEST_TULPA.Chat.LinkOpen",
    { caster: caster.name, tulpa: tulpa.name })}</p>`;
  return ChatMessage.create({ speaker: speakerFor(caster), content });
}

export async function postRelentless({ tulpa }) {
  const content = `<p>${i18n("MANIFEST_TULPA.Chat.Relentless", { name: tulpa.name })}</p>`;
  return ChatMessage.create({ speaker: speakerFor(tulpa), content });
}

export async function postDismiss({ caster, tulpa, reason }) {
  const reasonText = i18n(`MANIFEST_TULPA.Chat.Reason.${reason}`) || reason;
  const content = `
    <div class="manifest-tulpa-chat-card">
      <h3>${i18n("MANIFEST_TULPA.Chat.DismissTitle")}</h3>
      <p>${tulpa?.name ?? "The Tulpa"} fades — ${reasonText}.</p>
    </div>`;
  return ChatMessage.create({ speaker: speakerFor(caster), content });
}

export async function postWarning({ message }) {
  return ChatMessage.create({
    speaker: speakerFor(),
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<p><strong>${MODULE_ID}:</strong> ${message}</p>`,
  });
}
