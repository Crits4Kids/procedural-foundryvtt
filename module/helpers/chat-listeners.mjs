export function registerChatListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    const button = root?.querySelector(".procedural-reroll-button");
    if (!button) return;

    button.addEventListener("click", async () => {
      const actor = game.actors.get(button.dataset.actorId);
      if (!actor) return;

      await actor.spendRerunPointAndReroll(
        button.dataset.skillKey,
        button.dataset.mode,
        Number(button.dataset.situationalModifier) || 0
      );
    });
  });
}
