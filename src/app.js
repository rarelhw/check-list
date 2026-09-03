(async function () {
  'use strict';

  const STORAGE_KEY = 'sm-teaching-checklist:v1';
  const NONE = 'NONE';
  const GRAD = 'GRAD';
  const UNDERGRAD = 'UNDERGRAD';

  /* ---------- 유틸 ---------- */

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'onclick') node.addEventListener('click', value);
      else if (key.startsWith('data-') || key.startsWith('aria-')) node.setAttribute(key, value);
      else node[key] = value;
    }
    for (const child of children.flat()) if (child != null && child !== false) node.append(child);
    return node;
  }

  async function loadData() {
    const tag = document.getElementById('requirements-data');
    const raw = tag && tag.textContent.trim();
    if (raw) return JSON.parse(raw);
    const res = await fetch('./data/requirements.json');
    return res.json();
  }

  function emptyState() {
    return { version: 1, updatedAt: null, practicumExempt: false, items: {}, counters: {}, documents: {} };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Object.assign(emptyState(), JSON.parse(raw)) : emptyState();
    } catch (err) {
      // 사생활 보호 모드 등에서 저장소 접근이 막혀도 페이지는 동작해야 한다
      return emptyState();
    }
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* 저장 실패는 무시 */
    }
  }

  /* ---------- 판정 ---------- */

  function statusOf(id) {
    return state.items[id] || NONE;
  }

  function isExempt(section) {
    return Boolean(section.exemptible && state.practicumExempt);
  }

  function isDone(section, courseId) {
    return isExempt(section) || statusOf(courseId) !== NONE;
  }

  function evalGroup(section, group) {
    const done = group.courses.filter((c) => isDone(section, c.id));
    const rest = group.courses.filter((c) => !isDone(section, c.id));
    return {
      group,
      done: done.length,
      rest,
      need: Math.max(0, group.requiredCount - done.length),
    };
  }

  function evalSection(section) {
    const groups = section.groups.map((g) => evalGroup(section, g));
    return {
      section,
      groups,
      satisfied: groups.every((g) => g.need === 0),
      doneCount: groups.reduce((sum, g) => sum + Math.min(g.done, g.group.requiredCount), 0),
      requiredCount: groups.reduce((sum, g) => sum + g.group.requiredCount, 0),
      needCount: groups.reduce((sum, g) => sum + g.need, 0),
    };
  }

  function remainLines(section, evaluated) {
    if (isExempt(section)) {
      return ['교원자격증 소지 면제 적용 — 학교현장실습·교육봉사1·2 모두 P 처리됩니다.'];
    }
    const lines = [];
    for (const g of evaluated.groups) {
      if (g.need === 0) continue;
      const names = g.rest.map((c) => c.name).join(', ');
      if (g.group.label) {
        lines.push(`${g.group.label} — ${g.need}과목 필요 · ${names} 중 택${g.need}`);
      } else if (g.group.courses.length === g.group.requiredCount) {
        lines.push(`남은 ${g.need}과목 — ${names}`);
      } else {
        lines.push(
          `${g.group.requiredCount}과목 중 ${g.done}과목 이수 · ${g.need}과목 더 필요 — ${names} 중 택${g.need}`,
        );
      }
    }
    return lines;
  }

  function majorCredits() {
    let earned = data.credits.undergradBase;
    for (const section of data.sections) {
      if (section.category !== 'MAJOR') continue;
      for (const group of section.groups) {
        for (const course of group.courses) {
          if (statusOf(course.id) === GRAD) earned += course.credits;
        }
      }
    }
    return earned;
  }

  function teachingCredits() {
    let earned = 0;
    for (const section of data.sections) {
      if (section.category !== 'TEACHING') continue;
      for (const group of section.groups) {
        for (const course of group.courses) {
          if (isDone(section, course.id)) earned += course.credits;
        }
      }
    }
    return earned;
  }

  function counterValue(id) {
    return state.counters[id] || 0;
  }

  function overallProgress() {
    let total = 0;
    let done = 0;
    for (const section of data.sections) {
      const ev = evalSection(section);
      total += ev.requiredCount;
      done += ev.doneCount;
    }
    for (const counter of data.extracurricular.counters) {
      total += counter.required;
      done += Math.min(counterValue(counter.id), counter.required);
    }
    for (const doc of data.extracurricular.documents) {
      total += 1;
      if (state.documents[doc.id]) done += 1;
    }
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  /* ---------- 렌더 ---------- */

  function statusButtons(section, course) {
    const options = [
      { status: NONE, label: '미이수' },
      { status: GRAD, label: section.allowUndergrad ? '대학원 이수' : '이수' },
    ];
    if (section.allowUndergrad) options.push({ status: UNDERGRAD, label: '학부 인정' });

    const current = statusOf(course.id);
    const disabled = isExempt(section);

    return el(
      'div',
      { class: 'status-group', role: 'group', 'aria-label': `${course.name} 이수 상태` },
      options.map((option) =>
        el('button', {
          type: 'button',
          text: option.label,
          disabled,
          'data-status': option.status,
          'aria-pressed': String(current === option.status),
          onclick: () => {
            state.items[course.id] = option.status;
            saveState();
            render();
          },
        }),
      ),
    );
  }

  function courseRow(section, course) {
    const status = statusOf(course.id);
    const meta = [course.code, `${course.credits}학점`, course.aka].filter(Boolean).join(' · ');
    const classes = ['course'];
    if (isExempt(section) || status === GRAD) classes.push('checked');
    if (status === UNDERGRAD) classes.push('undergrad');

    return el(
      'li',
      { class: classes.join(' ') },
      el(
        'div',
        { class: 'course-main' },
        el('span', { class: 'course-name', text: course.name }),
        el('span', { class: 'course-meta', text: meta }),
      ),
      statusButtons(section, course),
    );
  }

  function remainBox(section, evaluated) {
    const lines = remainLines(section, evaluated);
    const ok = evaluated.satisfied;
    return el(
      'div',
      { class: ok ? 'remain ok' : 'remain' },
      el('h3', { text: ok ? '충족' : '남은 일' }),
      ok
        ? el('p', { style: 'margin:0', text: isExempt(section) ? lines[0] : '더 들을 과목이 없습니다.' })
        : el('ul', {}, lines.map((line) => el('li', { text: line }))),
    );
  }

  function sectionCard(section) {
    const evaluated = evalSection(section);
    const card = el('section', { class: 'card' });

    card.append(
      el(
        'h2',
        {},
        section.title,
        el('span', {
          class: 'sub',
          text: `${section.requiredCredits}학점 · ${evaluated.doneCount}/${evaluated.requiredCount}과목`,
        }),
      ),
    );

    if (section.note) card.append(el('p', { class: 'note', text: section.note }));

    if (section.exemptible) {
      const checkbox = el('input', {
        type: 'checkbox',
        id: `exempt-${section.id}`,
        checked: state.practicumExempt,
        onclick: (event) => {
          state.practicumExempt = event.target.checked;
          saveState();
          render();
        },
      });
      card.append(
        el(
          'div',
          { class: 'exempt' },
          checkbox,
          el(
            'label',
            { htmlFor: `exempt-${section.id}` },
            section.exemptLabel,
            el('span', { class: 'course-meta', text: section.exemptNote || '' }),
          ),
        ),
      );
    }

    for (const g of evaluated.groups) {
      const group = g.group;
      const block = el('div', { class: 'group' });
      if (group.label || group.hint) {
        block.append(
          el(
            'div',
            { class: 'group-head' },
            group.label ? el('h3', { text: group.label }) : null,
            el('span', {
              class: 'hint',
              text: [group.hint, `${Math.min(g.done, group.requiredCount)}/${group.requiredCount}`]
                .filter(Boolean)
                .join(' · '),
            }),
          ),
        );
      }
      block.append(el('ul', { class: 'courses' }, group.courses.map((c) => courseRow(section, c))));
      card.append(block);
    }

    card.append(remainBox(section, evaluated));
    return card;
  }

  function extracurricularCard() {
    const config = data.extracurricular;
    const card = el('section', { class: 'card' }, el('h2', { text: config.title }));
    if (config.note) card.append(el('p', { class: 'note', text: config.note }));

    const pending = [];

    for (const counter of config.counters) {
      const value = counterValue(counter.id);
      const ok = value >= counter.required;
      if (!ok) pending.push(`${counter.name} ${counter.required - value}${counter.unit} 남음`);

      const display = el('b', {
        class: ok ? 'ok' : '',
        text: `${value} / ${counter.required}${counter.unit}`,
      });

      const step = (delta) => () => {
        const next = Math.min(counter.required, Math.max(0, counterValue(counter.id) + delta));
        state.counters[counter.id] = next;
        saveState();
        render();
      };

      card.append(
        el(
          'div',
          { class: 'counter' },
          el(
            'div',
            { class: 'course-main' },
            el('span', { class: 'course-name', text: counter.name }),
            el('span', { class: 'course-meta', text: counter.note || '' }),
          ),
          el(
            'div',
            { class: 'steps' },
            el('button', { type: 'button', text: '−', 'aria-label': `${counter.name} 감소`, onclick: step(-1) }),
            display,
            el('button', { type: 'button', text: '+', 'aria-label': `${counter.name} 증가`, onclick: step(1) }),
          ),
        ),
      );
    }

    for (const doc of config.documents) {
      const checked = Boolean(state.documents[doc.id]);
      if (!checked) pending.push(`${doc.name} 확인 필요`);
      card.append(
        el(
          'div',
          { class: 'doc' },
          el('input', {
            type: 'checkbox',
            id: `doc-${doc.id}`,
            checked,
            onclick: (event) => {
              state.documents[doc.id] = event.target.checked;
              saveState();
              render();
            },
          }),
          el(
            'label',
            { htmlFor: `doc-${doc.id}` },
            doc.name,
            el('span', { class: 'course-meta', text: doc.note || '' }),
          ),
        ),
      );
    }

    card.append(
      el(
        'div',
        { class: pending.length ? 'remain' : 'remain ok' },
        el('h3', { text: pending.length ? '남은 일' : '충족' }),
        pending.length
          ? el('ul', {}, pending.map((line) => el('li', { text: line })))
          : el('p', { style: 'margin:0', text: '비교과 요건을 모두 채웠습니다.' }),
      ),
    );

    return card;
  }

  function renderSummary(evaluations, extracurricularOk) {
    const major = majorCredits();
    const teaching = teachingCredits();
    const progress = overallProgress();

    const totals = document.getElementById('totals');
    totals.replaceChildren(
      el(
        'div',
        { class: 'total' },
        el('b', { text: `${major} / ${data.credits.majorTarget}학점` }),
        el('span', { text: `전공 — 학부 인정 ${data.credits.undergradBase}학점 + 대학원 이수분` }),
      ),
      el(
        'div',
        { class: 'total' },
        el('b', { text: `${teaching} / ${data.credits.teachingTarget}학점` }),
        el('span', { text: '교직 — 교직이론 + 교직소양 + 교육실습' }),
      ),
      el(
        'div',
        { class: 'total' },
        el('b', { text: `${progress.percent}%` }),
        el('span', { text: `필수 항목 ${progress.done} / ${progress.total}` }),
      ),
    );

    document
      .getElementById('overall-progress')
      .replaceChildren(el('i', { style: `width:${progress.percent}%` }));

    const badges = evaluations.map((ev) =>
      el('span', {
        class: ev.satisfied ? 'badge ok' : 'badge',
        text: `${ev.section.title} ${ev.satisfied ? '충족' : '미충족'}`,
      }),
    );
    badges.push(
      el('span', {
        class: extracurricularOk ? 'badge ok' : 'badge',
        text: `비교과 ${extracurricularOk ? '충족' : '미충족'}`,
      }),
    );
    document.getElementById('summary-badges').replaceChildren(...badges);

    const todo = evaluations
      .filter((ev) => !ev.satisfied)
      .map((ev) => `${ev.section.title} — ${ev.needCount}과목 남음`);
    if (!extracurricularOk) todo.push('비교과 — 미이수 항목 있음');

    document.getElementById('summary-todo').replaceChildren(
      el('h3', { text: '지금 남은 일' }),
      todo.length
        ? el('ul', {}, todo.map((line) => el('li', { text: line })))
        : el('p', { class: 'done', style: 'margin:0', text: '모든 영역을 충족했습니다.' }),
    );
  }

  function extracurricularSatisfied() {
    const config = data.extracurricular;
    return (
      config.counters.every((c) => counterValue(c.id) >= c.required) &&
      config.documents.every((d) => Boolean(state.documents[d.id]))
    );
  }

  function render() {
    const evaluations = data.sections.map(evalSection);
    const container = document.getElementById('sections');
    container.replaceChildren(...data.sections.map(sectionCard), extracurricularCard());
    renderSummary(evaluations, extracurricularSatisfied());
  }

  /* ---------- 시작 ---------- */

  const data = await loadData();
  let state = loadState();

  document.getElementById('head-eyebrow').textContent =
    `${data.admissionYear}학년도 입학자 · ${data.major.name} · ${data.major.certType} · 표시과목 ${data.major.certSubject}`;
  document.getElementById('grade-note').textContent =
    `전공과목 평균 ${data.grade.major}/100 이상 · 교직과목 평균 ${data.grade.teaching}/100 이상`;
  document.getElementById('source-note').textContent = `근거: ${data.source}`;

  document.getElementById('reset').addEventListener('click', () => {
    if (!window.confirm('체크한 내용을 모두 지웁니다. 계속할까요?')) return;
    state = emptyState();
    saveState();
    render();
  });

  render();
})();
