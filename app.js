(function () {
  const data = window.DIGITAL_YAMA_DATA;
  const app = document.getElementById("app");
  const pageShell = document.querySelector(".page-shell");
  const headerNode = document.querySelector(".top-header");
  const eyebrowNode = document.querySelector(".eyebrow");
  const titleNode = document.getElementById("app-title");
  const subtitleNode = document.getElementById("app-subtitle");
  const homeButton = document.getElementById("home-button");

  if (!data || !Array.isArray(data.subjects)) {
    app.innerHTML = '<section class="empty-state">문제 데이터를 불러오지 못했습니다. `data.js`가 있는지 확인해 주세요.</section>';
    return;
  }

  titleNode.textContent = data.title || "통합 문제 CBT";
  subtitleNode.textContent = data.subtitle || "과목을 선택해 연습을 시작하세요.";

  const state = {
    selectedSubjectId: null,
    currentPage: 0,
    answers: {},
    reviewFlags: {},
    committedReviewFlags: {},
    subjectTimers: {},
    submittedSubjects: {},
    attemptOrders: {},
    profileAvatar: createSystemProfileDataUrl(),
    timerHandle: null
  };

  homeButton.addEventListener("click", () => {
    const currentSubject = getSelectedSubject();
    if (currentSubject) {
      commitPageReviewFlags(getPageQuestions(currentSubject, state.currentPage));
    }
    stopTimer();
    state.selectedSubjectId = null;
    state.currentPage = 0;
    render();
  });

  function getSelectedSubject() {
    return data.subjects.find((subject) => subject.id === state.selectedSubjectId) || null;
  }

  function getPageCount(subject) {
    return Math.ceil(subject.questions.length / (data.pageSize || 10));
  }

  function getPageQuestions(subject, page) {
    const orderedQuestions = getOrderedQuestions(subject);
    const pageSize = data.pageSize || 10;
    const start = page * pageSize;
    return orderedQuestions.slice(start, start + pageSize);
  }

  function getAnswerKey(question) {
    return `${state.selectedSubjectId}:${question.id}`;
  }

  function getReviewKey(question) {
    return question.id;
  }

  function isSubmitted(subjectId) {
    return Boolean(state.submittedSubjects[subjectId]);
  }

  function createSystemProfileDataUrl() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240">
        <rect width="200" height="240" fill="#f7f7f7"/>
        <circle cx="100" cy="78" r="34" fill="#a6a6a6"/>
        <path d="M48 198 C54 158 75 138 100 138 C125 138 146 158 152 198 L152 214 L48 214 Z" fill="#a6a6a6"/>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function shuffleArray(items) {
    const clone = [...items];
    for (let index = clone.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
    }
    return clone;
  }

  function ensureAttemptOrder(subject) {
    if (state.attemptOrders[subject.id]) {
      return state.attemptOrders[subject.id];
    }

    const questionIds = shuffleArray(subject.questions.map((question) => question.id));
    const optionOrders = {};
    subject.questions.forEach((question) => {
      optionOrders[question.id] = shuffleArray((question.options || []).map((option) => String(option.label)));
    });

    state.attemptOrders[subject.id] = { questionIds, optionOrders };
    return state.attemptOrders[subject.id];
  }

  function getOrderedQuestions(subject) {
    const attemptOrder = ensureAttemptOrder(subject);
    const questionMap = new Map(subject.questions.map((question) => [question.id, question]));
    return attemptOrder.questionIds.map((questionId) => questionMap.get(questionId)).filter(Boolean);
  }

  function getOrderedOptions(subject, question) {
    const attemptOrder = ensureAttemptOrder(subject);
    const order = attemptOrder.optionOrders[question.id] || [];
    const optionMap = new Map((question.options || []).map((option) => [String(option.label), option]));
    return order.map((label) => optionMap.get(label)).filter(Boolean);
  }

  function ensureAnswerStore(question) {
    const key = getAnswerKey(question);
    if (!state.answers[key]) {
      state.answers[key] = {
        selections: [],
        marker: {},
        text: "",
        memo: ""
      };
    }
    return state.answers[key];
  }

  function sanitize(text) {
    return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getCircledNumber(index) {
    const value = index + 1;

    if (value >= 1 && value <= 20) {
      return String.fromCodePoint(0x245f + value);
    }

    if (value >= 21 && value <= 35) {
      return String.fromCodePoint(0x3250 + (value - 20));
    }

    if (value >= 36 && value <= 50) {
      return String.fromCodePoint(0x32b0 + (value - 35));
    }

    return `${value}.`;
  }

  function renderRichText(line) {
    const parts = String(line || "").split(/(\[IMAGE:[^\]]+\])/g).filter(Boolean);
    return parts
      .map((part) => {
        const imageMatch = part.match(/^\[IMAGE:(.+)\]$/);
        if (imageMatch) {
          const src = imageMatch[1];
          return `<img class="inline-image" src="${encodeURI(src)}" alt="문항 이미지">`;
        }
        return escapeHtml(part);
      })
      .join("");
  }

  function parseObjectiveAnswer(question) {
    if (!question.answer) {
      return [];
    }

    const circled = question.answer.match(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿]/g);
    if (circled && circled.length) {
      return circled;
    }

    const numeric = [...question.answer.matchAll(/\b(\d+)\b/g)].map((match) => match[1]);
    if (numeric.length) {
      return numeric;
    }

    return [];
  }

  function getSubjectiveCandidates(question) {
    const raw = String(question.answer || "").trim();
    if (!raw) {
      return [];
    }

    const candidates = new Set();
    const beforeDash = raw.split(/\s+[—-]\s+/)[0].trim();
    const withoutLeadingMarker = beforeDash.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").trim();

    if (withoutLeadingMarker) {
      candidates.add(sanitize(withoutLeadingMarker));
    }

    const withoutParenthetical = withoutLeadingMarker.replace(/\([^)]*\)/g, "").trim();
    if (withoutParenthetical) {
      candidates.add(sanitize(withoutParenthetical));
    }

    const parentheticalMatches = [...withoutLeadingMarker.matchAll(/\(([^)]*)\)/g)];
    parentheticalMatches.forEach((match) => {
      const value = sanitize(match[1]);
      if (value) {
        candidates.add(value);
      }
    });

    return [...candidates].filter(Boolean);
  }

  function getQuestionResult(question) {
    if (question.inputType !== "radio" && question.inputType !== "checkbox") {
      const answerCandidates = getSubjectiveCandidates(question);
      if (!answerCandidates.length) {
        return {
          status: "error",
          message: "배정된 주관식 답이 없어 채점할 수 없습니다."
        };
      }

      const record = ensureAnswerStore(question);
      const userAnswer = sanitize(record.text);
      if (!userAnswer) {
        return {
          status: "incorrect",
          message: "답안이 비어 있습니다."
        };
      }

      const correct = answerCandidates.includes(userAnswer);
      return {
        status: correct ? "correct" : "incorrect",
        message: correct ? "입력한 답이 정답과 일치합니다." : "입력한 답이 정답과 다릅니다."
      };
    }

    const record = ensureAnswerStore(question);
    const selected = [...record.selections].sort().join("|");
    const answerTokens = parseObjectiveAnswer(question).sort().join("|");
    if (!answerTokens) {
      return {
        status: "incorrect",
        message: "선택형 정답 표식이 없어 오답 처리됩니다."
      };
    }

    if (!selected) {
      return {
        status: "incorrect",
        message: "선택한 답이 없습니다."
      };
    }

    const correct = selected === answerTokens;
    return {
      status: correct ? "correct" : "incorrect",
      message: correct ? "선택이 정답과 일치합니다." : "선택과 정답이 다릅니다."
    };
  }

  function renderSubjectScreen() {
    document.body.classList.add("home-screen-mode");
    document.body.classList.remove("quiz-screen-mode");
    document.body.classList.remove("review-screen-mode");
    pageShell.classList.add("home-screen-shell");
    pageShell.classList.remove("quiz-screen-shell");
    headerNode.classList.add("home-header");
    headerNode.classList.remove("quiz-header");
    headerNode.classList.remove("review-header");
    stopTimer();
    homeButton.classList.add("hidden");
    eyebrowNode.textContent = "Digital Past Papers";
    titleNode.textContent = "Digital Yama";
    subtitleNode.textContent = "통합문제집 기반 CBT 아카이브. 과목명을 클릭하면 해당 문제 세트로 이동합니다.";
    app.innerHTML = `
      <section class="subject-screen home-subject-screen">
        <section class="subject-link-grid">
          ${data.subjects.map(renderSubjectLink).join("")}
        </section>
      </section>
    `;

    app.querySelectorAll("[data-subject-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSubjectId = button.dataset.subjectId;
        state.currentPage = 0;
        render();
      });
    });
  }

  function renderSubjectLink(subject) {
    return `
      <button class="subject-link" type="button" data-subject-id="${escapeHtml(subject.id)}">
        ${escapeHtml(subject.name)}
      </button>
    `;
  }

  function renderQuizScreen(subject) {
    const submitted = isSubmitted(subject.id);
    document.body.classList.remove("home-screen-mode");
    document.body.classList.add("quiz-screen-mode");
    document.body.classList.toggle("review-screen-mode", submitted);
    pageShell.classList.remove("home-screen-shell");
    pageShell.classList.add("quiz-screen-shell");
    headerNode.classList.remove("home-header");
    headerNode.classList.toggle("quiz-header", !submitted);
    headerNode.classList.toggle("review-header", submitted);
    eyebrowNode.textContent = submitted ? "Review Mode" : "Digital Yama";
    titleNode.textContent = submitted ? "Digital Yama Review" : "Digital Yama Question Book";
    homeButton.classList.remove("hidden");
    const pageCount = getPageCount(subject);
    const questions = getPageQuestions(subject, state.currentPage);
    const pageKey = `${subject.id}:${state.currentPage}`;
    const answeredCount = questions.filter((question) => {
      const record = ensureAnswerStore(question);
      return (record.selections && record.selections.length) || sanitize(record.text);
    }).length;
    ensureSubjectTimer(subject);
    subtitleNode.textContent = `${subject.name} · 총 ${subject.questions.length}문항`;

    app.innerHTML = `
      <section class="quiz-screen legacy-quiz-screen">
        <aside class="legacy-sidebar">
          <section class="sidebar-block timer-block">
            <p class="sidebar-label">남은 시간</p>
            <p id="timer-display" class="timer-value">${formatTime(state.subjectTimers[subject.id])}</p>
          </section>
          <section class="sidebar-block">
            <img class="profile-avatar" src="${state.profileAvatar}" alt="랜덤 아바타">
          </section>
          <section class="sidebar-block review-block">
            <div class="review-list">${renderReviewList(subject)}</div>
          </section>
        </aside>

        <section class="legacy-main">
          <div class="legacy-toolbar">
            <div class="page-index legacy-page-index">
              ${Array.from({ length: pageCount }, (_, index) => `
                <button class="page-chip ${index === state.currentPage ? "current" : ""}" type="button" data-page="${index}">
                  ${index + 1}
                </button>
              `).join("")}
              <button id="submit-button" class="page-chip submit-chip" type="button" ${submitted ? "disabled" : ""}>제출</button>
            </div>
            <div class="legacy-actions">
              <button id="reset-page-button" class="secondary-button" type="button" ${submitted ? "disabled" : ""}>답안 비우기</button>
              <button id="clear-subject-button" class="secondary-button" type="button">초기화</button>
            </div>
          </div>

          <section class="question-list legacy-question-list">
            ${questions.map((question, index) => renderQuestionCard(question, submitted, state.currentPage * (data.pageSize || 10) + index + 1)).join("")}
          </section>
        </section>
      </section>
    `;

    wireQuizEvents(subject, questions, pageKey);
    if (submitted) {
      stopTimer();
    } else {
      startTimer(subject.id);
    }
  }

  function renderQuestionCard(question, submitted, displayNumber) {
    const record = ensureAnswerStore(question);
    const result = submitted ? getQuestionResult(question) : null;
    const cardClass = result ? `question-card ${result.status}` : "question-card";
    const reviewChecked = state.reviewFlags[getReviewKey(question)] ? "checked" : "";

    return `
      <article class="${cardClass}" data-question-id="${escapeHtml(question.id)}">
        <div class="question-header">
          <label class="review-toggle-wrap">
            <input class="review-toggle" type="checkbox" data-review-question-id="${escapeHtml(question.id)}" ${reviewChecked} ${submitted ? "disabled" : ""}>
          </label>
          <span class="question-dot" aria-hidden="true"></span>
          <div class="question-heading">
            <p class="question-number">문항 ${displayNumber}</p>
            <h3 class="question-stem">${renderRichText(question.stem)}</h3>
            ${question.lecture ? `<span class="lecture-chip">${escapeHtml(question.lecture)}</span>` : ""}
          </div>
        </div>
        <div class="question-body">
          ${question.bodyLines.map((line) => `<p>${renderRichText(line)}</p>`).join("")}
        </div>
        ${renderInputBlock(question, record, submitted, getSelectedSubject())}
        ${renderReviewMemoBlock(question, record, submitted)}
        ${submitted && question.notes && question.notes.length ? `<div class="question-note">${question.notes.map(escapeHtml).join(" ")}</div>` : ""}
        <div class="answer-panel ${submitted ? "visible" : ""}">
          <p class="answer-title">정답 / 메모</p>
          ${question.inputType !== "radio" && question.inputType !== "checkbox" ? `<p>${question.answer ? renderRichText(question.answer) : "정답 정보 없음"}</p>` : ""}
          ${result ? `<p>${escapeHtml(result.message)}</p>` : ""}
        </div>
      </article>
    `;
  }

  function renderInputBlock(question, record, submitted, subject) {
    if (question.inputType === "radio" || question.inputType === "checkbox") {
      const orderedOptions = getOrderedOptions(subject, question);
      const correctLabels = submitted ? new Set(parseObjectiveAnswer(question)) : new Set();
      return `
        <div class="option-list">
          ${orderedOptions.map((option, optionIndex) => {
            const optionValue = String(option.label);
            const checked = record.selections.includes(optionValue) ? "checked" : "";
            const markerValue = record.marker[optionValue] || "?";
            const isCorrect = correctLabels.has(optionValue);
            const isSelected = record.selections.includes(optionValue);
            const rowClass = submitted && isCorrect ? "option-row option-correct" : "option-row";
            return `
              <label class="${rowClass}">
                <input
                  class="option-input"
                  type="checkbox"
                  name="question-${escapeHtml(question.id)}"
                  value="${escapeHtml(optionValue)}"
                  data-question-id="${escapeHtml(question.id)}"
                  data-selection-mode="${escapeHtml(question.inputType)}"
                  ${submitted ? "disabled" : ""}
                  ${checked}
                >
                <select class="option-marker" data-question-id="${escapeHtml(question.id)}" data-option-value="${escapeHtml(optionValue)}" ${submitted ? "disabled" : ""}>
                  <option value="?" ${markerValue === "?" ? "selected" : ""}>?</option>
                  <option value="o" ${markerValue === "o" ? "selected" : ""}>o</option>
                  <option value="x" ${markerValue === "x" ? "selected" : ""}>x</option>
                </select>
                <span class="option-text">${getCircledNumber(optionIndex)} ${renderRichText(option.text)}</span>
              </label>
            `;
          }).join("")}
        </div>
      `;
    }

    return `
      <textarea
        class="subjective-input"
        placeholder="답안을 입력하세요."
        data-question-id="${escapeHtml(question.id)}"
        ${submitted ? "disabled" : ""}
      >${escapeHtml(record.text || "")}</textarea>
    `;
  }

  function renderReviewMemoBlock(question, record, submitted) {
    return `
      <div class="review-memo-wrap">
        <textarea
          class="review-memo-input"
          placeholder="자유 메모"
          data-review-memo-id="${escapeHtml(question.id)}"
          ${submitted ? "disabled" : ""}
        >${escapeHtml(record.memo || "")}</textarea>
      </div>
    `;
  }

  function wireQuizEvents(subject, questions, pageKey) {
    app.querySelectorAll(".option-input").forEach((input) => {
      input.addEventListener("change", () => {
        if (isSubmitted(subject.id)) {
          return;
        }
        const question = questions.find((item) => item.id === input.dataset.questionId);
        const record = ensureAnswerStore(question);
        if (input.dataset.selectionMode === "radio" && input.checked) {
          app.querySelectorAll(`input[data-question-id='${input.dataset.questionId}']`).forEach((node) => {
            if (node !== input) {
              node.checked = false;
            }
          });
        }
        const values = [...app.querySelectorAll(`input[data-question-id='${input.dataset.questionId}']:checked`)].map((node) => node.value);
        record.selections = values;
      });
    });

    app.querySelectorAll(".option-marker").forEach((select) => {
      select.addEventListener("change", () => {
        if (isSubmitted(subject.id)) {
          return;
        }
        const question = questions.find((item) => item.id === select.dataset.questionId);
        const record = ensureAnswerStore(question);
        record.marker[select.dataset.optionValue] = select.value;
      });
    });

    app.querySelectorAll(".subjective-input").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        if (isSubmitted(subject.id)) {
          return;
        }
        const question = questions.find((item) => item.id === textarea.dataset.questionId);
        const record = ensureAnswerStore(question);
        record.text = textarea.value;
      });
    });

    app.querySelectorAll(".review-memo-input").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        if (isSubmitted(subject.id)) {
          return;
        }
        const question = questions.find((item) => item.id === textarea.dataset.reviewMemoId);
        const record = ensureAnswerStore(question);
        record.memo = textarea.value;
      });
    });

    app.querySelectorAll(".review-toggle").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (isSubmitted(subject.id)) {
          return;
        }
        state.reviewFlags[checkbox.dataset.reviewQuestionId] = checkbox.checked;
      });
    });

    document.getElementById("reset-page-button").addEventListener("click", () => {
      if (isSubmitted(subject.id)) {
        return;
      }
      questions.forEach((question) => {
        delete state.answers[getAnswerKey(question)];
      });
      render();
    });

    document.getElementById("clear-subject-button").addEventListener("click", () => {
      clearSubjectState(subject.id);
      state.selectedSubjectId = subject.id;
      state.currentPage = 0;
      render();
    });

    document.getElementById("submit-button").addEventListener("click", () => {
      if (isSubmitted(subject.id)) {
        return;
      }
      commitPageReviewFlags(questions);
      state.submittedSubjects[subject.id] = true;
      render();
    });

    app.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        commitPageReviewFlags(questions);
        state.currentPage = Number(button.dataset.page);
        render();
      });
    });
  }

  function render() {
    const subject = getSelectedSubject();
    if (!subject) {
      renderSubjectScreen();
      return;
    }

    renderQuizScreen(subject);
  }

  function renderReviewList(subject) {
    const reviewed = getOrderedQuestions(subject).filter((question) => state.committedReviewFlags[getReviewKey(question)]);
    if (!reviewed.length) {
      return '<p class="review-empty">없음</p>';
    }

    return reviewed
      .map((question, index) => `<p class="review-item">${index + 1}</p>`)
      .join("");
  }

  function commitPageReviewFlags(questions) {
    questions.forEach((question) => {
      const key = getReviewKey(question);
      state.committedReviewFlags[key] = Boolean(state.reviewFlags[key]);
    });
  }

  function ensureSubjectTimer(subject) {
    if (typeof state.subjectTimers[subject.id] !== "number") {
      state.subjectTimers[subject.id] = subject.questions.length * 60;
    }
  }

  function clearSubjectState(subjectId) {
    Object.keys(state.answers).forEach((key) => {
      if (key.startsWith(`${subjectId}:`)) {
        delete state.answers[key];
      }
    });

    const subject = data.subjects.find((item) => item.id === subjectId);
    if (subject) {
      subject.questions.forEach((question) => {
        delete state.reviewFlags[question.id];
        delete state.committedReviewFlags[question.id];
      });
    }

    delete state.subjectTimers[subjectId];
    delete state.submittedSubjects[subjectId];
    delete state.attemptOrders[subjectId];
  }

  function formatTime(totalSeconds) {
    const safe = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function stopTimer() {
    if (state.timerHandle) {
      window.clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
  }

  function startTimer(subjectId) {
    stopTimer();
    const timerNode = document.getElementById("timer-display");
    if (!timerNode) {
      return;
    }

    timerNode.textContent = formatTime(state.subjectTimers[subjectId]);
    state.timerHandle = window.setInterval(() => {
      if (state.subjectTimers[subjectId] > 0) {
        state.subjectTimers[subjectId] -= 1;
      }
      timerNode.textContent = formatTime(state.subjectTimers[subjectId]);
    }, 1000);
  }

  render();
})();
