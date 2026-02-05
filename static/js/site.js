(function () {
  // =========================
  // Helpers
  // =========================
  function qs(sel) { return document.querySelector(sel); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function setOverlayRect(overlayEl, anchorEl) {
    if (!overlayEl || !anchorEl) return;

    var r = anchorEl.getBoundingClientRect();
    var left = Math.round(r.left);
    var top = Math.round(r.bottom);
    var width = Math.round(r.width);

    overlayEl.style.left = left + "px";
    overlayEl.style.top = top + "px";
    overlayEl.style.width = width + "px";

    var maxH = window.innerHeight - top - 8;
    overlayEl.style.maxHeight = clamp(maxH, 140, 520) + "px";
  }

  function openOverlay(overlayEl, anchorEl) {
    if (!overlayEl) return;
    setOverlayRect(overlayEl, anchorEl);
    overlayEl.classList.add("is-open");
    overlayEl.setAttribute("aria-hidden", "false");
  }

  function closeOverlay(overlayEl) {
    if (!overlayEl) return;
    overlayEl.classList.remove("is-open");
    overlayEl.setAttribute("aria-hidden", "true");
  }

  function isClickOutside(e, boxEls) {
    for (var i = 0; i < boxEls.length; i++) {
      var el = boxEls[i];
      if (el && el.contains(e.target)) return false;
    }
    return true;
  }

  // =========================
  // Main
  // =========================
  document.addEventListener("DOMContentLoaded", function () {
    // ----- Section overlay toggle -----
    var sectionCell = qs("#sectionCell");
    var sectionBtn = qs("#sectionToggleBtn");
    var sectionOverlay = qs("#sectionOverlay");

    if (sectionBtn && sectionOverlay) {
      sectionBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOpen = sectionOverlay.classList.contains("is-open");
        if (isOpen) {
          closeOverlay(sectionOverlay);
          sectionBtn.setAttribute("aria-expanded", "false");
        } else {
          openOverlay(sectionOverlay, sectionCell || sectionBtn);
          sectionBtn.setAttribute("aria-expanded", "true");
        }
      });
    }

    // ----- Search overlay -----
    var searchCell = qs("#searchCell");
    var searchInput = qs("#searchInput");
    var searchOverlay = qs("#searchOverlay");
    var headEl = qs("#searchOverlayHead");
    var listEl = qs("#searchOverlayList");

    var indexCache = null;
    var indexLoading = null;

    // ✅ 검색 세션 플래그 (1회용)
    // - searchInput을 한번이라도 눌러 "세션 시작"하면 true
    // - 본문 터치/스크롤/외부 클릭 등 모든 움직임에서 즉시 reset
    var searchSessionActive = false;

    // ✅ 중복 이벤트 가드(모바일 pointerdown+click 중복 방지)
    var lastSearchTapAt = 0;

    function fetchIndexOnce() {
      if (indexCache) return Promise.resolve(indexCache);
      if (indexLoading) return indexLoading;

      indexLoading = fetch("/index.json", { cache: "no-store" })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          indexCache = Array.isArray(data) ? data : [];
          return indexCache;
        })
        .catch(function () {
          indexCache = [];
          return indexCache;
        });

      return indexLoading;
    }

    function renderResults(q, items) {
      if (!listEl) return;

      listEl.innerHTML = "";

      var query = (q || "").trim().toLowerCase();
      if (!query) {
        if (headEl) headEl.textContent = "Search";
        return;
      }

      var results = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        var title = (it.title || "").toString();
        var summary = (it.summary || it.description || "").toString();
        var content = (it.content || "").toString();
        var href = (it.permalink || it.relpermalink || it.url || "").toString();

        var hay = (title + " " + summary + " " + content).toLowerCase();
        if (hay.indexOf(query) !== -1 && href) {
          results.push({ title: title, summary: summary, href: href });
        }
      }

      if (headEl) headEl.textContent = "Results: " + results.length;

      var limit = 30;
      for (var j = 0; j < results.length && j < limit; j++) {
        var r = results[j];

        var a = document.createElement("a");
        a.className = "so-item";
        a.href = r.href;

        var t = document.createElement("div");
        t.className = "so-title";
        t.textContent = r.title || "(no title)";

        var s = document.createElement("div");
        s.className = "so-sub";
        s.textContent = r.summary ? r.summary : r.href;

        a.appendChild(t);
        a.appendChild(s);

        listEl.appendChild(a);
      }
    }

    function showSearchOverlay() {
      if (!searchOverlay || !searchInput) return;
      openOverlay(searchOverlay, searchCell || searchInput);
      searchInput.setAttribute("aria-expanded", "true");
    }

    function hideSearchOverlay() {
      if (!searchOverlay || !searchInput) return;
      closeOverlay(searchOverlay);
      searchInput.setAttribute("aria-expanded", "false");
    }

    // ✅ “즉시 초기화” = 입력값 비우기 + 결과 비우기 + 헤더 리셋 + 오버레이 닫기 + 세션 종료
    function resetSearchUI() {
      if (!searchInput) return;

      searchInput.value = "";
      if (headEl) headEl.textContent = "Search";
      if (listEl) listEl.innerHTML = "";

      hideSearchOverlay();

      searchSessionActive = false;

      // 모바일에서 키보드/포커스 갇힘 방지
      try { searchInput.blur(); } catch (_) {}
    }

    // ✅ “검색창을 누르는 순간” 규칙:
    // 1) 검색창 한번 누르고 또 누르면 즉시 초기화
    // 2) 검색창 한번 누른 순간 = 새 세션 시작 (즉시 초기화 후 오버레이 열기)
    function startNewSearchSession() {
      // 무조건 새 세션 시작: 이전 상태를 완전히 리셋
      if (searchInput) searchInput.value = "";
      if (headEl) headEl.textContent = "Search";
      if (listEl) listEl.innerHTML = "";

      searchSessionActive = true;
      showSearchOverlay();

      // 인덱스는 미리 로드만 해둠(검색어 입력 시 즉시 필터)
      fetchIndexOnce().then(function () {});
    }

    // ✅ 세션이 열려있는 상태에서:
    // 3) 스크롤하면 즉시 초기화
    // 4) 검색어 쓰고 본문 터치/스크롤 -> 즉시 초기화
    // 5) x로 지워도(세션 유지중) 본문 터치/스크롤 -> 즉시 초기화
    function shouldHardResetOnOutside(target) {
      if (!searchSessionActive) return false;

      // 검색창/검색셀/오버레이 내부는 “외부”가 아님
      if (searchCell && searchCell.contains(target)) return false;
      if (searchOverlay && searchOverlay.contains(target)) return false;

      return true;
    }

    if (searchInput && searchOverlay) {
      // ✅ pointerdown/touchstart/click에서 “검색창을 누르는 순간 새 세션”
      function onSearchTap(e) {
        var now = Date.now();
        if (now - lastSearchTapAt < 200) return; // 중복 방지
        lastSearchTapAt = now;

        // 누르는 순간 무조건 새 세션
        startNewSearchSession();

        // 이벤트 전파 차단(헤더/버튼줄 엉킴 방지)
        if (e && e.stopPropagation) e.stopPropagation();
      }

      searchInput.addEventListener("pointerdown", onSearchTap);
      searchInput.addEventListener("touchstart", onSearchTap);
      searchInput.addEventListener("click", onSearchTap);

      // 입력 중에는 오버레이 유지 + 결과 렌더
      searchInput.addEventListener("input", function (e) {
        if (e && e.stopPropagation) e.stopPropagation();

        // 세션 중이 아니면 세션 시작(방어)
        if (!searchSessionActive) {
          startNewSearchSession();
        } else {
          showSearchOverlay();
        }

        fetchIndexOnce().then(function (items) {
          renderResults(searchInput.value, items);
        });
      });

      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          resetSearchUI();
        }
      });

      // ✅ x(클리어) 버튼을 눌러도 “세션”은 유지중이므로
      // 이후 본문 터치/스크롤이면 resetSearchUI가 발동됨.
      // (input 이벤트에서 빈 값 들어오면 Search만 띄워둠)
    }

    // ----- Reflow on resize -----
    window.addEventListener("resize", function () {
      if (sectionOverlay && sectionOverlay.classList.contains("is-open")) {
        openOverlay(sectionOverlay, sectionCell || sectionBtn);
      }
      if (searchOverlay && searchOverlay.classList.contains("is-open")) {
        openOverlay(searchOverlay, searchCell || searchInput);
      }
    });

    // ----- Global close + HARD RESET -----
    // (섹션 오버레이 닫기: 기존 유지)
    // (검색 오버레이: “닫기”가 아니라 “즉시 초기화”로 통일)

    // ✅ 스크롤 = 즉시 초기화 (요구 3,4,5)
    window.addEventListener("scroll", function () {
      if (searchSessionActive) resetSearchUI();
    }, { passive: true });

    // ✅ 본문 터치/클릭 = 즉시 초기화 (요구 2,4,5)
    document.addEventListener("touchstart", function (e) {
      if (shouldHardResetOnOutside(e.target)) resetSearchUI();
    }, { passive: true });

    document.addEventListener("mousedown", function (e) {
      if (shouldHardResetOnOutside(e.target)) resetSearchUI();
    });

    document.addEventListener("click", function (e) {
      // 섹션 닫기(기존)
      if (sectionOverlay && sectionOverlay.classList.contains("is-open")) {
        if (isClickOutside(e, [sectionCell, sectionOverlay])) {
          closeOverlay(sectionOverlay);
          if (sectionBtn) sectionBtn.setAttribute("aria-expanded", "false");
        }
      }

      // 검색: 외부 클릭이면 즉시 초기화 (요구 2,4,5)
      if (shouldHardResetOnOutside(e.target)) {
        resetSearchUI();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;

      if (sectionOverlay && sectionOverlay.classList.contains("is-open")) {
        closeOverlay(sectionOverlay);
        if (sectionBtn) sectionBtn.setAttribute("aria-expanded", "false");
      }

      // 검색은 ESC = 즉시 초기화
      if (searchSessionActive) resetSearchUI();
    });

    // ✅ 검색 결과 링크 클릭 시: 이동 직전에 즉시 초기화(레이아웃 꼬임 방지)
    if (listEl) {
      listEl.addEventListener("click", function (e) {
        var a = e.target && e.target.closest ? e.target.closest("a.so-item") : null;
        if (a) resetSearchUI();
      });
    }
  });
})();
