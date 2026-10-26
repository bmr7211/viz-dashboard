/* =========================================================
 * ui.js — 탭 전환, 기준선 슬라이더, 등급 선택
 * ========================================================= */
(() => {
  /* ---------- 탭 ---------- */
  const tabs = [...document.querySelectorAll('.vz-tab')];

  function showPage(id) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.page === id)));
    document.getElementById('public').hidden = id !== 'public';
    document.getElementById('finance').hidden = id !== 'finance';
    history.replaceState(null, '', '#' + id);   // 주소 끝에 #public / #finance
    setState({ page: id });                     // 보이는 탭의 차트를 다시 그림
  }

  tabs.forEach((t) => t.addEventListener('click', () => showPage(t.dataset.page)));

  // 주소가 …#finance 로 열리면 금융 탭부터 보여줌
  if (location.hash === '#finance') {
    state.page = 'finance';
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.page === 'finance')));
    document.getElementById('public').hidden = true;
    document.getElementById('finance').hidden = false;
  }

  /* ---------- 기준선 슬라이더 (공공) ---------- */
  const range = document.getElementById('th-range');
  const thv = document.getElementById('th-val');
  range.addEventListener('input', () => { thv.textContent = range.value + '분'; });   // 끄는 중: 글자만
  range.addEventListener('change', () => setState({ th: +range.value }));           // 놓으면: 다시 계산·그리기

  /* ---------- 등급 선택 (금융) ---------- */
  const sel = document.getElementById('grade-sel');
  sel.addEventListener('change', () => setState({ grade: sel.value }));
})();