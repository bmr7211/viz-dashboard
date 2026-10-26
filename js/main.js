/* =========================================================
 * main.js — 데이터 불러오기 · 계산 실행 · 숫자 채우기 · 다시 그리기
 * 다른 js 파일들은 여기 있는 함수(defineCalc, onDraw, rows, setState…)를 사용함
 * ========================================================= */

// 1) 데이터 파일 경로
const FILES = {
  ems_calls: 'data/public_ems_calls.csv',
  ems_dongs: 'data/public_ems_dongs.csv',
  finance_loans: 'data/finance_loans.csv',
  finance_loan_monthly: 'data/finance_loan_monthly.csv',
};

// 2) 저장소
const DATA = {};    // 원본 CSV 행들
const CALC = {};    // 계산 결과 행들
const CALCS = [];   // 계산 정의 목록 (정의한 순서대로 실행)
const DRAWERS = { public: [], finance: [] };  // 탭별 그리기 함수 목록

// 3) 필터 상태 (기준선 분, 신용등급, 현재 탭)
const state = { th: 10, grade: '전체', page: 'public' };

// 4) 차트 색상 (0: 도심, 1: 주거, 2: 외곽 … 순서로 사용)
const COLORS = ['#2f6fd0', '#e0892b', '#2e9b6a', '#c4496d', '#7a5bc4', '#8c6d3f', '#3a9fb0', '#8a8a8a'];

/* ---------- 등록 함수 ---------- */
// 계산 하나 등록: inputs는 데이터 id 또는 앞서 등록한 계산 id
function defineCalc(id, inputs, fn) { CALCS.push({ id, inputs, fn }); }

// 탭(page)에 그리기 함수 등록
function onDraw(page, fn) { DRAWERS[page].push(fn); }

// 데이터 또는 계산 결과 꺼내기
function rows(id) { return DATA[id] ?? CALC[id] ?? []; }

// 필터 바꾸고 다시 그리기
function setState(patch) { Object.assign(state, patch); redraw(); }

/* ---------- 숫자 표시 형식 ---------- */
const fmt = {
  pct1: (v) => v.toFixed(1) + '%',
  pct2: (v) => v.toFixed(2) + '%',
  pp: (v) => v.toFixed(1) + '%p',
  min: (v) => v.toFixed(1) + '분',
  eok: (v) => d3.format(',.1f')(v) + '억 원',
  r: (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2),
};

/* ---------- 불러오기 ---------- */
async function loadAll() {
  const ids = Object.keys(FILES);
  const tables = await Promise.all(ids.map((id) => d3.csv(FILES[id])));
  ids.forEach((id, i) => {
    // 엑셀에서 저장한 CSV는 첫 열 이름 앞에 BOM(\uFEFF)이 붙을 수 있어서 제거
    DATA[id] = tables[i].map((r) => {
      const o = {};
      for (const k in r) o[k.replace(/^\uFEFF/, '')] = r[k];
      return o;
    });
  });
}

function runCalcs() {
  for (const c of CALCS) {
    try {
      CALC[c.id] = c.fn(...c.inputs.map(rows));
    } catch (e) {
      console.error('계산 실패:', c.id, e);
      CALC[c.id] = [];
    }
  }
}

/* ---------- 본문 숫자 채우기 ----------
 * HTML 예: <b class="v" data-source="ems_within" data-field="within"
 *            data-tpl="th={th}&scope=외곽" data-fmt="pct1">—</b>
 * → ems_within 결과에서 th=현재기준, scope=외곽 인 행의 within 값을 pct1 형식으로 표시
 */
function fillValues() {
  document.querySelectorAll('.v[data-source]').forEach((el) => {
    const data = rows(el.dataset.source);
    let row;
    if (el.dataset.row != null) {
      row = data[+el.dataset.row];
    } else {
      const where = el.dataset.tpl.replace('{th}', state.th).replace('{grade}', state.grade);
      const conds = where.split('&').map((s) => s.split('='));
      row = data.find((r) => conds.every(([k, v]) => String(r[k]) === v));
    }
    const v = row ? row[el.dataset.field] : null;
    el.textContent = v == null ? '—' : fmt[el.dataset.fmt](v);
  });
  document.querySelectorAll('.grade-name').forEach((e) => { e.textContent = state.grade; });
}

/* ---------- 다시 그리기 ---------- */
function redraw() {
  fillValues();
  for (const fn of DRAWERS[state.page]) {
    try { fn(); } catch (e) { console.error('차트 그리기 실패:', e); }
  }
}

/* ---------- 시작 ---------- */
async function start() {
  const status = document.getElementById('status');
  try {
    await loadAll();
    runCalcs();
    status.hidden = true;
    redraw();
    // 창 크기가 바뀌면 0.2초 뒤 다시 그림
    let timer;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(redraw, 200); });
  } catch (e) {
    status.textContent = '데이터를 불러오지 못했습니다: ' + e.message;
    status.classList.add('error');
    console.error(e);
  }
}

// 모든 <script>가 읽힌 뒤 시작 → 다른 파일의 defineCalc/onDraw 등록이 먼저 끝남
document.addEventListener('DOMContentLoaded', start);