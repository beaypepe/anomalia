/* ============================================================
   ANOMALIA.EXE · Lógica 100% client-side (sin backend)
   Vistas: 0 login → 1 informe → 2 radar → 3 chat → 4 override
   ============================================================ */
(function () {
  "use strict";

  var LOGIN_CODE = "tensor";   // case-insensitive
  var TEQ_EXACT = "266.0868";  // comparación exacta (normalizando coma → punto)

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

  // Botones genéricos [ data-goto="view-X" ]
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-goto]");
    if (btn) {
      ev.preventDefault();
      if (btn.id === "restart-btn") resetGame();
      showView(btn.getAttribute("data-goto"));
    }
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
      var value = (loginInput.value || "").trim().toLowerCase();
      if (value === LOGIN_CODE) {
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
    return (raw || "").trim().replace(/\s+/g, "").replace(",", ".");
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
  }

  setLevel(currentView);
})();
