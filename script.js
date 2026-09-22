/* ============================================================
   ANOMALIA.EXE · Lógica 100% client-side (sin backend)
   Vistas: 0 login → 1 informe → 2 radar → 3 chat → 4 override → victoria
   Cada transición entre vistas exige introducir una clave
   (normalizada: minúsculas y sin tildes, indistintamente).
   ============================================================ */
(function () {
  "use strict";

  var LOGIN_CODE = "tensor";          // clave inicial (normalizada al comparar)
  var TEQ_EXACT = "266.0868";         // comparación exacta (normalizando coma → punto)
  var UNLOCK_CODE = "OAN-OVERRIDE";   // código de desbloqueo de Adventure Lab

  /* Normalización de claves: minúsculas, sin tildes/acentos, sin bordes.
     Así "ANOMALÍA", "anomalia", "Anomalía"… son todas equivalentes. */
  function normalizeKey(raw) {
    return String(raw == null ? "" : raw)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  var hudClock = document.getElementById("hud-clock");
  var hudLevel = document.getElementById("hud-level");

  /* ---------- Reloj del HUD ---------- */
  function tickClock() {
    if (!hudClock) return;
    var d = new Date();
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    hudClock.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------- Navegación entre vistas con transición ---------- */
  var views = Array.prototype.slice.call(document.querySelectorAll(".view"));
  var currentView = document.querySelector(".view.is-active") || views[0];
  var chatTimers = [];

  function setLevel(view) {
    if (hudLevel && view && view.dataset.level) hudLevel.textContent = view.dataset.level;
  }

  function focusView(view) {
    var target = view.querySelector("h1, h2, input, button");
    if (target) {
      if (!target.hasAttribute("tabindex") && !/^(INPUT|BUTTON)$/.test(target.tagName)) {
        target.setAttribute("tabindex", "-1");
      }
      try { target.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
  }

  function showView(id) {
    var next = document.getElementById(id);
    if (!next || next === currentView) return;

    function activate() {
      views.forEach(function (v) {
        v.classList.remove("is-active", "is-leaving");
        v.hidden = true;
      });
      next.hidden = false;
      // Forzar reflow para reiniciar la animación de entrada
      void next.offsetWidth;
      next.classList.add("is-active");
      currentView = next;
      setLevel(next);
      window.scrollTo({ top: 0, behavior: "auto" });
      focusView(next);

      // Hooks por vista
      if (id === "view-3") playChatSequence();
      if (id !== "view-3") clearChatTimers();
    }

    // Fade-out de la vista actual ("terminal limpiándose") y luego fade-in
    currentView.classList.add("is-leaving");
    window.setTimeout(activate, 220);
  }

  // Botones genéricos [ data-goto="view-X" ] (solo el reinicio de victoria)
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-goto]");
    if (btn) {
      ev.preventDefault();
      if (btn.id === "restart-btn") resetGame();
      showView(btn.getAttribute("data-goto"));
    }
  });

  /* ---------- Compuertas de clave entre vistas ---------- */
  // Botón [ data-keygate="id-form" ] → oculta el botón y revela su formulario
  document.addEventListener("click", function (ev) {
    var trigger = ev.target.closest("[data-keygate]");
    if (!trigger) return;
    ev.preventDefault();
    var form = document.getElementById(trigger.getAttribute("data-keygate"));
    if (!form) return;
    trigger.hidden = true;
    form.hidden = false;
    var input = form.querySelector("input");
    if (input) {
      try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) { /* noop */ } }
      try { form.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e3) { /* noop */ }
    }
  });

  // Validación genérica: todo <form data-key data-target> avanza si la clave coincide
  Array.prototype.slice
    .call(document.querySelectorAll("form[data-key]"))
    .forEach(function (form) {
      var input = form.querySelector("input");
      var errorEl = form.querySelector(".error");
      if (!input) return;

      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (normalizeKey(input.value) === normalizeKey(form.getAttribute("data-key"))) {
          if (errorEl) errorEl.hidden = true;
          showView(form.getAttribute("data-target"));
        } else {
          if (errorEl) errorEl.hidden = false;
          form.classList.remove("shake");
          void form.offsetWidth; // reinicia animación
          form.classList.add("shake");
          input.select();
        }
      });

      input.addEventListener("input", function () {
        if (errorEl && !errorEl.hidden) errorEl.hidden = true;
      });
    });

  /* ---------- VISTA 0 · Login ---------- */
  var loginForm = document.getElementById("login-form");
  var loginInput = document.getElementById("override-code");
  var loginError = document.getElementById("login-error");

  function denyLogin() {
    loginError.hidden = false;
    loginForm.classList.remove("shake");
    void loginForm.offsetWidth; // reinicia animación
    loginForm.classList.add("shake");
    loginInput.select();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (normalizeKey(loginInput.value) === normalizeKey(LOGIN_CODE)) {
        loginError.hidden = true;
        showView("view-1");
      } else {
        denyLogin();
      }
    });
    loginInput.addEventListener("input", function () {
      if (!loginError.hidden) loginError.hidden = true;
    });
  }

  /* ---------- VISTA 2 · Escáner de satélites ---------- */
  var satHeads = Array.prototype.slice.call(document.querySelectorAll(".sat-head"));
  var scanned = {}; // nombre → true
  var scanCount = document.getElementById("scan-count");
  var interceptWrap = document.getElementById("intercept-wrap");
  var rogueFound = false;

  function updateScanCount() {
    var n = Object.keys(scanned).length;
    if (scanCount) scanCount.textContent = n + "/5";
  }

  satHeads.forEach(function (head) {
    head.addEventListener("click", function () {
      var card = head.closest(".sat");
      var body = document.getElementById(head.getAttribute("aria-controls"));
      var isOpen = card.classList.contains("is-open");

      // Comportamiento acordeón: cerrar los demás, abrir el tocado
      document.querySelectorAll(".sat.is-open").forEach(function (other) {
        if (other !== card) {
          other.classList.remove("is-open");
          var otherHead = other.querySelector(".sat-head");
          var otherBody = document.getElementById(otherHead.getAttribute("aria-controls"));
          otherBody.hidden = true;
          otherHead.setAttribute("aria-expanded", "false");
          otherHead.querySelector(".sat-toggle").textContent = "[+]";
        }
      });

      if (isOpen) {
        card.classList.remove("is-open");
        body.hidden = true;
        head.setAttribute("aria-expanded", "false");
        head.querySelector(".sat-toggle").textContent = "[+]";
      } else {
        card.classList.add("is-open", "is-scanned");
        body.hidden = false;
        head.setAttribute("aria-expanded", "true");
        head.querySelector(".sat-toggle").textContent = "[–]";

        var name = head.getAttribute("data-sat");
        scanned[name] = true;
        updateScanCount();

        // Solo al descubrir el NAVSTAR-47 aparece el botón de interceptar
        if (name === "NAVSTAR-47" && !rogueFound) {
          rogueFound = true;
          interceptWrap.hidden = false;
          // Pequeño scroll para revelar el botón en móvil
          window.setTimeout(function () {
            interceptWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 150);
        }
      }
    });
  });

  /* ---------- VISTA 3 · Chat interceptado (revelado secuencial) ---------- */
  var chatMessages = Array.prototype.slice.call(document.querySelectorAll("[data-msg]"));
  var chatCount = document.getElementById("chat-count");
  var emergencyWrap = document.getElementById("emergency-wrap");
  var chatPlayed = false;

  function clearChatTimers() {
    chatTimers.forEach(function (t) { clearTimeout(t); });
    chatTimers = [];
  }

  function playChatSequence() {
    clearChatTimers();
    // Si ya se vio, mostrar todo al instante al volver atrás/adelante
    if (chatPlayed) {
      chatMessages.forEach(function (m) { m.classList.add("is-visible"); });
      if (chatCount) chatCount.textContent = chatMessages.length + "/" + chatMessages.length;
      emergencyWrap.hidden = false;
      return;
    }
    chatMessages.forEach(function (m) { m.classList.remove("is-visible"); });
    if (chatCount) chatCount.textContent = "0/" + chatMessages.length;
    emergencyWrap.hidden = true;

    chatMessages.forEach(function (msg, i) {
      var t = window.setTimeout(function () {
        msg.classList.add("is-visible");
        if (chatCount) chatCount.textContent = (i + 1) + "/" + chatMessages.length;
        msg.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (i === chatMessages.length - 1) {
          chatPlayed = true;
          var t2 = window.setTimeout(function () {
            emergencyWrap.hidden = false;
            emergencyWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 500);
          chatTimers.push(t2);
        }
      }, 600 + i * 900);
      chatTimers.push(t);
    });
  }

  /* ---------- VISTA 4 · Override t_eq ---------- */
  var overrideForm = document.getElementById("override-form");
  var teqInput = document.getElementById("teq");
  var overrideError = document.getElementById("override-error");

  function normalizeTeq(raw) {
    return (raw || "").trim().replace(/\s+/g, "").replace(/,/g, ".");
  }

  if (overrideForm) {
    overrideForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var value = normalizeTeq(teqInput.value);
      if (value === TEQ_EXACT) {
        overrideError.hidden = true;
        showView("view-victory"); // "borra" la pantalla y muestra victoria
      } else {
        overrideError.hidden = false;
        overrideForm.classList.remove("shake");
        void overrideForm.offsetWidth;
        overrideForm.classList.add("shake");
        teqInput.select();
      }
    });
    teqInput.addEventListener("input", function () {
      if (!overrideError.hidden) overrideError.hidden = true;
    });
  }

  /* ---------- Victoria · código de desbloqueo (clic = copiar) ---------- */
  var unlockBtn = document.getElementById("unlock-code");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", function () {
      var state = document.getElementById("unlock-state");
      var idleText = "[ PULSA PARA COPIAR ]";

      function flashCopied() {
        if (state) state.textContent = "✓ COPIADO AL PORTAPAPELES";
        unlockBtn.classList.add("is-copied");
        window.setTimeout(function () {
          if (state) state.textContent = idleText;
          unlockBtn.classList.remove("is-copied");
        }, 2000);
      }

      function manualCopy() {
        try {
          var valueEl = document.getElementById("unlock-value");
          var range = document.createRange();
          range.selectNodeContents(valueEl);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          if (document.execCommand) document.execCommand("copy");
        } catch (e) { /* noop */ }
        flashCopied();
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(UNLOCK_CODE).then(flashCopied, manualCopy);
      } else {
        manualCopy();
      }
    });
  }

  /* ---------- Reinicio (botón de victoria) ---------- */
  function resetGame() {
    clearChatTimers();
    chatPlayed = false;
    rogueFound = false;
    scanned = {};
    updateScanCount();
    if (loginInput) loginInput.value = "";
    if (teqInput) teqInput.value = "";
    if (loginError) loginError.hidden = true;
    if (overrideError) overrideError.hidden = true;
    if (interceptWrap) interceptWrap.hidden = true;
    if (emergencyWrap) emergencyWrap.hidden = true;
    document.querySelectorAll(".sat").forEach(function (card) {
      card.classList.remove("is-open", "is-scanned");
      var head = card.querySelector(".sat-head");
      var body = document.getElementById(head.getAttribute("aria-controls"));
      body.hidden = true;
      head.setAttribute("aria-expanded", "false");
      head.querySelector(".sat-toggle").textContent = "[+]";
    });
    chatMessages.forEach(function (m) { m.classList.remove("is-visible"); });
    if (chatCount) chatCount.textContent = "0/" + chatMessages.length;
    // Restaurar las compuertas de clave: botones visibles, formularios ocultos
    Array.prototype.slice
      .call(document.querySelectorAll("form[data-key]"))
      .forEach(function (form) {
        form.hidden = true;
        form.classList.remove("shake");
        var input = form.querySelector("input");
        if (input) input.value = "";
        var err = form.querySelector(".error");
        if (err) err.hidden = true;
        var trigger = document.querySelector('[data-keygate="' + form.id + '"]');
        if (trigger) trigger.hidden = false;
      });
  }

  setLevel(currentView);
})();
