"use strict";

/* ==========================================================================
   Riviera — PWA (install prompt and update handling)
   The service worker itself is /sw.js. Registration needs https or localhost.
   ========================================================================== */

const PWA = {
  installEvent: null,

  init() {
    PWA.bindInstall();
    PWA.registerWorker().catch((err) => console.error("Service worker registration failed:", err));
  },

  // Chrome and Edge fire beforeinstallprompt when the app is installable.
  // Buttons marked [data-install] stay hidden until then.
  bindInstall() {
    const buttons = document.querySelectorAll("[data-install]");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      PWA.installEvent = e;
      buttons.forEach((b) => { b.hidden = false; });
    });
    window.addEventListener("appinstalled", () => {
      PWA.installEvent = null;
      buttons.forEach((b) => { b.hidden = true; });
    });
    buttons.forEach((b) =>
      b.addEventListener("click", async () => {
        PWA.installEvent.prompt();
        await PWA.installEvent.userChoice;
        PWA.installEvent = null;
        buttons.forEach((x) => { x.hidden = true; });
      })
    );
  },

  async registerWorker() {
    if (!("serviceWorker" in navigator)) return;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const registration = await navigator.serviceWorker.register("sw.js");

    // A new version installed while this page was open: offer to switch.
    const offer = (worker) =>
      App.notify({
        message: "A new version of Riviera is ready.",
        actionLabel: "Reload",
        onAction: () => worker.postMessage({ type: "SKIP_WAITING" }),
      });
    if (registration.waiting && hadController) offer(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
      });
    });

    // Reload once when the new worker takes over. Not on first install.
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
  },
};
