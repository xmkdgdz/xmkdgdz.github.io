(function () {
  const OML2D_SCRIPT_ID = "oml2d-local-runtime";
  const OML2D_SCRIPT_SRC = "/vendor/oh-my-live2d/dist/index.min.js";
  const CHAT_ROOT_ID = "kurisu-assistant";
  const FOLLOW_STRENGTH = "medium";

  const state = {
    oml2d: null,
    followAttached: false,
    hitAttached: false,
    modelHitAttached: false,
    pointerX: 0,
    pointerY: 0,
    rafId: 0,
    fallbackHitAttached: false,
    lastHitAt: 0,
    idleNoClickBound: false,
    idleNoClickInterval: 0,
    lastPointerClickAt: 0,
    lastIdlePromptAt: 0,
    pageHintShown: false,
    touchStats: {
      head: { count: 0, lastAt: 0 },
      body: { count: 0, lastAt: 0 },
    },
    knowledge: {
      loaded: false,
      loading: false,
      posts: [],
    },
  };

  function pickRandom(items) {
    if (!Array.isArray(items) || items.length === 0) return "";
    return items[Math.floor(Math.random() * items.length)];
  }

  function normalizeHitAreaName(name) {
    return String(name || "").toLowerCase();
  }

  function getHitGroup(name) {
    const key = normalizeHitAreaName(name);
    if (key.includes("head")) return "head";
    if (key.includes("mouth")) return "head";
    if (key.includes("body")) return "body";
    return "other";
  }

  function getTouchTier(group) {
    if (!state.touchStats[group]) return 1;
    const now = Date.now();
    const stat = state.touchStats[group];
    const windowMs = 7000;
    if (now - stat.lastAt > windowMs) {
      stat.count = 0;
    }
    stat.count += 1;
    stat.lastAt = now;
    if (stat.count >= 6) return 3;
    if (stat.count >= 3) return 2;
    return 1;
  }

  function getHitReply(group, tier) {
    const replyMap = {
      head: {
        1: ["……有什么事吗？", "你是在测试什么吗？"],
        2: ["有话就说。", "重复同一个实验，是得不到新结果的。"],
        3: ["够了！", "你到底在干嘛？！", "……你是不是哪里有问题。"],
      },
      body: {
        1: ["等等，你在干什么？", "这种接触没有任何必要。"],
        2: ["我建议你重新思考一下你的行为。", "……你是认真的吗？"],
        3: [
          "再这样我就关闭交互了。",
          "这已经偏离正常交流范围了。",
          "你是不是把我当成什么奇怪的东西了？",
        ],
      },
      other: {
        1: ["你在找什么？", "如果你有问题，可以直接问。"],
      },
    };
    const groupMap = replyMap[group] || replyMap.other;
    const pool = groupMap[tier] || groupMap[1] || replyMap.other[1];
    return pickRandom(pool);
  }

  function getMotionGroup(group) {
    if (group === "head") return "";
    if (group === "body") return "tap_body";
    return "";
  }

  function appendMessage(content, role) {
    const list = document.querySelector("#kurisu-chat-messages");
    if (!list) return;
    const item = document.createElement("div");
    item.className = "kurisu-msg " + (role === "user" ? "is-user" : "is-kurisu");
    item.textContent = content;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  }

  function tokenizeQuestion(text) {
    const raw = String(text || "").toLowerCase();
    const parts = raw
      .replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, " ")
      .split(" ")
      .map(function (x) {
        return x.trim();
      })
      .filter(function (x) {
        return x.length >= 1;
      });
    const stopWords = new Set(["的", "了", "是", "吗", "呢", "啊", "吧", "一下", "一下子", "请", "介绍"]);
    return parts.filter(function (w) {
      return !stopWords.has(w);
    });
  }

  function ensureKnowledgeIndex() {
    if (state.knowledge.loaded || state.knowledge.loading) return Promise.resolve();
    state.knowledge.loading = true;
    return window
      .fetch("/kurisu-index.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("index-load-failed");
        return res.json();
      })
      .then(function (data) {
        state.knowledge.posts = Array.isArray(data.posts) ? data.posts : [];
        state.knowledge.loaded = true;
      })
      .catch(function () {
        state.knowledge.posts = [];
        state.knowledge.loaded = true;
      })
      .finally(function () {
        state.knowledge.loading = false;
      });
  }

  function scorePost(post, tokens) {
    const title = String(post.title || "").toLowerCase();
    const tags = Array.isArray(post.tags) ? post.tags.join(" ").toLowerCase() : "";
    const category = String(post.category || "").toLowerCase();
    const text = String(post.text || "").toLowerCase();
    let score = 0;

    tokens.forEach(function (token) {
      if (title.includes(token)) score += 8;
      if (tags.includes(token)) score += 5;
      if (category.includes(token)) score += 4;
      if (text.includes(token)) score += 2;
    });

    return score;
  }

  function findBestMatches(question) {
    const tokens = tokenizeQuestion(question);
    if (!tokens.length || !state.knowledge.posts.length) return [];
    return state.knowledge.posts
      .map(function (post) {
        return {
          post: post,
          score: scorePost(post, tokens),
        };
      })
      .filter(function (item) {
        return item.score > 0;
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.post.date || "").localeCompare(String(a.post.date || ""));
      })
      .slice(0, 2);
  }

  function getLatestPosts(limit) {
    return (state.knowledge.posts || [])
      .slice()
      .sort(function (a, b) {
        return String(b.date || "").localeCompare(String(a.date || ""));
      })
      .slice(0, limit);
  }

  function toRelativeUrl(url) {
    const val = String(url || "");
    if (!val) return "#";
    return val.replace(/^https?:\/\/[^/]+/i, "");
  }

  function formatSearchAnswer(matches) {
    if (!matches.length) {
      return "我没有在现有文章里找到足够匹配的内容。问题先记下，之后你可以换个关键词再问。";
    }
    const top = matches[0].post;
    const topUrl = toRelativeUrl(top.url);
    if (matches.length === 1 || matches[1].score <= matches[0].score * 0.6) {
      return "我优先想到这篇：[" + top.title + "](" + topUrl + ")。先看这个，再来和我讨论细节。";
    }
    const second = matches[1].post;
    const secondUrl = toRelativeUrl(second.url);
    return (
      "你这个问题可以先看两篇：[" +
      top.title +
      "](" +
      topUrl +
      ")，还有 [" +
      second.title +
      "](" +
      secondUrl +
      ")。先读再问，会更高效。"
    );
  }

  function isPresetWho(question) {
    return /你是谁|你是?谁|amadeus|红莉栖|牧濑/.test(question);
  }

  function isPresetBlogIntro(question) {
    return /介绍.*博客|博客.*介绍|这个博客|站点/.test(question);
  }

  function isPresetRecent(question) {
    return /最近.*写|最近.*文章|最新.*文章|最近更新/.test(question);
  }

  function formatRecentAnswer() {
    const latest = getLatestPosts(3);
    if (!latest.length) {
      return "当前索引里没有文章记录。先确认构建是否成功生成了 kurisu-index.json。";
    }
    const lines = latest.map(function (p) {
      return (
        "• [" +
        p.title +
        "](" +
        toRelativeUrl(p.url) +
        ")（" +
        String(p.date || "").slice(0, 10) +
        "）"
      );
    });
    return "最近的内容我给你列出来了：\n" + lines.join("\n");
  }

  function safeSetMessageHtml(node, textWithLinks) {
    const escaped = String(textWithLinks || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const linked = escaped.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    node.innerHTML = linked.replace(/\n/g, "<br>");
  }

  function appendRichKurisuMessage(content) {
    const list = document.querySelector("#kurisu-chat-messages");
    if (!list) return;
    const item = document.createElement("div");
    item.className = "kurisu-msg is-kurisu";
    safeSetMessageHtml(item, content);
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  }

  function answerQuestion(question) {
    const q = String(question || "").trim();
    if (!q) return Promise.resolve("");
    return ensureKnowledgeIndex().then(function () {
      if (isPresetWho(q)) {
        return "我是《命运石之门》中的 Amadeus，基于牧濑红莉栖的记忆备份构建的 AI。";
      }
      if (isPresetBlogIntro(q)) {
        return "这是一个技术向博客，作者是校门口的关东煮。";
      }
      if (isPresetRecent(q)) {
        return formatRecentAnswer();
      }

      const matches = findBestMatches(q);
      if (matches.length) {
        return formatSearchAnswer(matches);
      }
      return "这个问题暂时没命中现有文章。你可以换几个关键词，比如技术名词、报错关键字、系统名。";
    });
  }

  function speakKurisu(content) {
    if (!content) return;
    if (state.oml2d && typeof state.oml2d.tipsMessage === "function") {
      state.oml2d.tipsMessage(content, 2600, 5);
    }
  }

  function playMotionByGroup(group) {
    const motionGroup = getMotionGroup(group);
    if (!motionGroup) return;
    const modelController = state.oml2d && state.oml2d.models;
    const model = modelController && modelController.model;
    if (modelController && typeof modelController.playMotion === "function") {
      modelController.playMotion(motionGroup);
      return;
    }
    if (model && typeof model.motion === "function") {
      model.motion(motionGroup);
    }
  }

  function handleHit(hitAreas) {
    state.lastHitAt = Date.now();
    const firstHit = Array.isArray(hitAreas) ? hitAreas[0] : "";
    const group = getHitGroup(firstHit);
    const tier = group === "other" ? 1 : getTouchTier(group);
    const reply = getHitReply(group, tier);
    speakKurisu(reply);
    playMotionByGroup(group);
  }

  function resolveGroupByRelativePosition(clientX, clientY) {
    const stage = document.getElementById("oml2d-stage");
    if (!stage) return "other";
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return "other";
    const rx = (clientX - rect.left) / rect.width;
    const ry = (clientY - rect.top) / rect.height;
    if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return "other";
    if (ry < 0.4) return "head";
    return "body";
  }

  function bindSpecialTriggers() {
    if (state.idleNoClickBound) return;
    state.idleNoClickBound = true;
    state.lastPointerClickAt = Date.now();
    state.lastIdlePromptAt = 0;

    const idleLines = [
      "盯着看不会让问题自动解决。",
      "如果你在思考，我可以等。",
      "……你不会是在发呆吧？",
    ];

    document.addEventListener("click", function () {
      state.lastPointerClickAt = Date.now();
    });

    state.idleNoClickInterval = window.setInterval(function () {
      const now = Date.now();
      const noClickForTenSeconds = now - state.lastPointerClickAt >= 10000;
      const cooldownPassed = now - state.lastIdlePromptAt >= 15000;
      if (!noClickForTenSeconds || !cooldownPassed) return;
      state.lastIdlePromptAt = now;
      speakKurisu(pickRandom(idleLines));
    }, 1000);
  }

  function disableModelAutoInteract() {
    const model = state.oml2d && state.oml2d.models && state.oml2d.models.model;
    if (!model) return;
    if ("autoInteract" in model) {
      model.autoInteract = false;
    }
    if ("interactive" in model) {
      model.interactive = false;
    }
  }

  function showPageHintOnce() {
    if (state.pageHintShown) return;
    state.pageHintShown = true;
    const path = window.location.pathname;
    const isHome = path === "/" || path === "/index.html";
    const isPost = document.querySelector(".post-content") || /\/\d{4}\/\d{2}\/\d{2}\//.test(path);
    if (isHome) {
      speakKurisu("这里……勉勉强强吧。");
      return;
    }
    if (isPost) {
      speakKurisu("这篇文章值得认真看看。");
    }
  }

  function bindModelHitEvent() {
    if (!state.oml2d || state.modelHitAttached) return;
    const model = state.oml2d.models && state.oml2d.models.model;
    if (!model || typeof model.on !== "function") return;
    model.on("hit", handleHit);
    state.modelHitAttached = true;
  }

  function bindHitEvents() {
    if (!state.oml2d || state.hitAttached) return;
    const eventBus = state.oml2d.events;
    if (eventBus && typeof eventBus.add === "function") {
      eventBus.add("hit", handleHit);
      state.hitAttached = true;
    }
    bindModelHitEvent();
    if (state.fallbackHitAttached) return;
    const canvas = document.getElementById("oml2d-canvas");
    const stage = document.getElementById("oml2d-stage");
    const clickTarget = stage || canvas;
    if (!clickTarget) return;
    clickTarget.addEventListener("click", function (event) {
      state.lastPointerClickAt = Date.now();
      const group = resolveGroupByRelativePosition(event.clientX, event.clientY);
      const tier = group === "other" ? 1 : getTouchTier(group);
      speakKurisu(getHitReply(group, tier));
      playMotionByGroup(group);
    });
    state.fallbackHitAttached = true;
  }

  function focusModelWithPointer(x, y) {
    const model = state.oml2d && state.oml2d.models && state.oml2d.models.model;
    const canvas = document.getElementById("oml2d-canvas");
    if (!model || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const localX = (x - rect.left) * scaleX;
    const localY = (y - rect.top) * scaleY;

    if (typeof model.focus === "function") {
      model.focus(localX, localY, true);
      return;
    }

    if (typeof state.oml2d.setModelRotation === "function") {
      const ratio = FOLLOW_STRENGTH === "strong" ? 7 : FOLLOW_STRENGTH === "weak" ? 2 : 4;
      const centerX = rect.width / 2;
      const normalizedX = (x - rect.left - centerX) / Math.max(centerX, 1);
      state.oml2d.setModelRotation(normalizedX * ratio);
    }
  }

  function bindMouseFollow() {
    if (state.followAttached) return;
    state.followAttached = true;

    const onMove = function (event) {
      state.pointerX = event.clientX;
      state.pointerY = event.clientY;
      if (state.rafId) return;
      state.rafId = window.requestAnimationFrame(function () {
        state.rafId = 0;
        focusModelWithPointer(state.pointerX, state.pointerY);
      });
    };

    document.addEventListener("mousemove", onMove, { passive: true });
  }

  function createAssistantShell() {
    if (document.getElementById(CHAT_ROOT_ID)) return;

    const root = document.createElement("section");
    root.id = CHAT_ROOT_ID;
    root.innerHTML = [
      '<button id="kurisu-chat-toggle" class="kurisu-fab" type="button" aria-label="对话">对话</button>',
      '<button id="kurisu-hide-toggle" class="kurisu-fab" type="button" aria-label="隐藏">隐藏</button>',
      '<aside id="kurisu-chat-panel" class="kurisu-chat-panel" aria-hidden="true">',
      '  <header class="kurisu-chat-header">Amadeus / 牧濑红莉栖</header>',
      '  <div id="kurisu-chat-messages" class="kurisu-chat-messages"></div>',
      '  <div id="kurisu-preset-questions" class="kurisu-preset-questions">',
      '    <button type="button" data-q="你是谁">你是谁</button>',
      '    <button type="button" data-q="介绍一下博客">介绍博客</button>',
      '    <button type="button" data-q="最近写了什么">最近文章</button>',
      "  </div>",
      '  <form id="kurisu-chat-form" class="kurisu-chat-form">',
      '    <input id="kurisu-chat-input" type="text" placeholder="输入你的问题..." autocomplete="off" />',
      '    <button type="submit">发送</button>',
      "  </form>",
      "</aside>",
    ].join("");

    document.body.appendChild(root);
  }

  function bindAssistantEvents(oml2d) {
    const chatToggle = document.getElementById("kurisu-chat-toggle");
    const hideToggle = document.getElementById("kurisu-hide-toggle");
    const panel = document.getElementById("kurisu-chat-panel");
    const presets = document.getElementById("kurisu-preset-questions");
    const form = document.getElementById("kurisu-chat-form");
    const input = document.getElementById("kurisu-chat-input");

    if (!chatToggle || !hideToggle || !panel || !form || !input || !presets) return;

    let chatOpen = false;
    let hidden = false;

    appendMessage("哼，调试环境我已经就位了。要问什么就快问。", "kurisu");

    chatToggle.addEventListener("click", function () {
      chatOpen = !chatOpen;
      panel.classList.toggle("is-open", chatOpen);
      panel.setAttribute("aria-hidden", String(!chatOpen));
      if (chatOpen) {
        chatToggle.textContent = "关闭";
        input.focus();
        speakKurisu(pickRandom(["终于决定好好交流了吗。", "那就说重点。"]));
      } else {
        chatToggle.textContent = "对话";
      }
    });

    hideToggle.addEventListener("click", function () {
      hidden = !hidden;
      if (hidden) {
        if (oml2d && typeof oml2d.stageSlideOut === "function") {
          oml2d.stageSlideOut();
        }
        panel.classList.remove("is-open");
        panel.setAttribute("aria-hidden", "true");
        chatOpen = false;
        chatToggle.textContent = "对话";
        hideToggle.textContent = "显示";
      } else {
        if (oml2d && typeof oml2d.stageSlideIn === "function") {
          oml2d.stageSlideIn();
        }
        hideToggle.textContent = "隐藏";
      }
    });

    function submitQuestion(question) {
      if (!question) return;
      appendMessage(question, "user");
      input.value = "";
      answerQuestion(question).then(function (answer) {
        window.setTimeout(function () {
          appendRichKurisuMessage(answer);
        }, 120);
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submitQuestion(input.value.trim());
    });

    presets.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const q = target.getAttribute("data-q") || "";
      submitQuestion(q);
    });
  }

  function initOml2d() {
    if (!window.OML2D || typeof window.OML2D.loadOml2d !== "function") {
      return;
    }

    const oml2d = window.OML2D.loadOml2d({
      dockedPosition: "left",
      mobileDisplay: false,
      sayHello: false,
      statusBar: { disable: true },
      menus: { disable: true },
      tips: {
        messageLine: 2,
        style: {
          backgroundColor: "rgba(26, 32, 44, 0.9)",
          border: "1px solid rgba(148, 163, 184, 0.45)",
          color: "#e6edf7",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
          backdropFilter: "blur(6px)",
        },
        mobileStyle: {
          backgroundColor: "rgba(26, 32, 44, 0.9)",
          border: "1px solid rgba(148, 163, 184, 0.45)",
          color: "#e6edf7",
          borderRadius: "12px",
        },
        idleTips: { wordTheDay: false, message: [], duration: 3000, interval: 12000 },
        welcomeTips: {
          message: {
            daybreak: "……已经早上了吗，效率太低了。",
            morning: "……已经早上了吗，效率太低了。",
            noon: "中午了？时间过得比预期快。",
            afternoon: "下午容易分心，注意集中精力。",
            dusk: "晚上了……你还不打算结束今天吗？",
            night: "晚上了……你还不打算结束今天吗？",
            lateNight: "还不睡？你是打算降低认知能力吗。",
            weeHours: "……这个时间点还清醒，不太合理。",
          },
        },
        copyTips: {
          message: ["引用记得注明来源，这是基本常识。"],
        },
      },
      stageStyle: {
        width: 320,
        height: 420,
        bottom: 0,
        zIndex: 9997,
      },
      models: [
        {
          path: "/kurisu/kurisu.model.json",
          scale: 0.16,
          position: [-80, 110],
          motionPreloadStrategy: "IDLE",
          volume: 0,
          stageStyle: {
            width: 320,
            height: 420,
          },
        },
      ],
    });

    state.oml2d = oml2d;
    disableModelAutoInteract();
    bindHitEvents();
    bindMouseFollow();
    bindSpecialTriggers();
    if (oml2d && typeof oml2d.onLoad === "function") {
      oml2d.onLoad(function (loadStatus) {
        if (loadStatus === "success") {
          disableModelAutoInteract();
          bindHitEvents();
          bindModelHitEvent();
          bindMouseFollow();
          bindSpecialTriggers();
          window.setTimeout(showPageHintOnce, 300);
        }
      });
    }

    bindAssistantEvents(oml2d);
  }

  function ensureRuntimeAndBoot() {
    if (window.OML2D && typeof window.OML2D.loadOml2d === "function") {
      createAssistantShell();
      initOml2d();
      return;
    }

    let script = document.getElementById(OML2D_SCRIPT_ID);
    if (!script) {
      script = document.createElement("script");
      script.id = OML2D_SCRIPT_ID;
      script.src = OML2D_SCRIPT_SRC;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", function onLoad() {
      script.removeEventListener("load", onLoad);
      createAssistantShell();
      initOml2d();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureRuntimeAndBoot);
  } else {
    ensureRuntimeAndBoot();
  }
})();
