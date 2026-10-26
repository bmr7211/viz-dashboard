/* =========================================================
 * finance.js — 금융 탭: 개인신용대출 연체 (계산 7개 + 차트 6개)
 * ========================================================= */

/* ---------------- 1) 계산 ----------------
 * 연체율 = 30일+ 연체잔액 ÷ 대출잔액 (상태가 '정상' 또는 '연체'인 계약의 월말 잔액 기준)
 * 등급(전체·A~D)별 결과를 미리 모두 계산해 두므로 등급을 바꿔도 다시 계산하지 않음 */

// 등급별 잔액·연체 (2026-06 말)
// 2026-06 말 정상·연체 계약의 대출잔액, 30일+ 연체잔액(억 원), 연체율(%), 전체 연체잔액 중 비중(%).
defineCalc('fin_grade', ['finance_loan_monthly', 'finance_loans'],
  (finance_loan_monthly, finance_loans) => {
    const g = new Map(finance_loans.map((l) => [l.계약ID, l.신용등급]));
    const acc = {};
    for (const r of finance_loan_monthly) {
      if (r.기준월 !== '2026-06' || !(r.상태 === '정상' || r.상태 === '연체')) continue;
      for (const k of ['전체', g.get(r.계약ID)]) {
        acc[k] ??= { bal: 0, dq: 0 };
        acc[k].bal += +r.잔액_만원;
        if (r.상태 === '연체') acc[k].dq += +r.잔액_만원;
      }
    }
    return ['A', 'B', 'C', 'D', '전체'].map((grade) => ({ grade,
      bal_eok: Math.round(acc[grade].bal / 1000) / 10, dq_eok: Math.round(acc[grade].dq / 1000) / 10,
      rate: Math.round(acc[grade].dq / acc[grade].bal * 10000) / 100,
      dq_share: Math.round(acc[grade].dq / acc['전체'].dq * 1000) / 10 }));
  }
);

// 등급별 연체율의 단순평균
// A~D 네 등급 연체율을 같은 무게로 평균한 값. 잔액 가중 전체 연체율과 비교하기 위한 값.
defineCalc('fin_avg', ['fin_grade'],
  (fin_grade) => [{ simple_avg: Math.round(d3.mean(fin_grade.filter((r) => r.grade !== '전체'), (r) => r.rate) * 100) / 100 }]
);

// 채널×등급 연체율과 구성비
// 2026-06 말 채널(대면·모바일)과 등급별 연체율(%), 그리고 채널 잔액 중 각 등급의 비중(%).
defineCalc('fin_channel', ['finance_loan_monthly', 'finance_loans'],
  (finance_loan_monthly, finance_loans) => {
    const info = new Map(finance_loans.map((l) => [l.계약ID, l]));
    const acc = {};
    for (const r of finance_loan_monthly) {
      if (r.기준월 !== '2026-06' || !(r.상태 === '정상' || r.상태 === '연체')) continue;
      const l = info.get(r.계약ID);
      for (const gr of ['전체', l.신용등급]) {
        const k = gr + '|' + l.채널;
        acc[k] ??= { bal: 0, dq: 0 };
        acc[k].bal += +r.잔액_만원;
        if (r.상태 === '연체') acc[k].dq += +r.잔액_만원;
      }
    }
    const out = [];
    for (const grade of ['전체', 'A', 'B', 'C', 'D']) for (const channel of ['대면', '모바일']) {
      const a = acc[grade + '|' + channel];
      out.push({ grade, channel, rate: Math.round(a.dq / a.bal * 10000) / 100,
        bal_share: Math.round(a.bal / acc['전체|' + channel].bal * 1000) / 10 });
    }
    return out;
  }
);

// 채널별 C·D등급 잔액 비중
// 채널 잔액 중 C등급과 D등급 비중의 합(%).
defineCalc('fin_cd', ['fin_channel'],
  (fin_channel) => ['대면', '모바일'].map((channel) => ({ channel,
    cd_share: Math.round(d3.sum(fin_channel.filter((r) => r.channel === channel && (r.grade === 'C' || r.grade === 'D')), (r) => r.bal_share) * 10) / 10 }))
);

// 취급월 코호트 누적 연체 진입률
// 등급(전체·A~D)×취급월×경과월(1~12)별로, 그 경과월까지 한 번이라도 30일+ 연체된 계약 ÷ 취급 계약(%). 2026-06 말까지 관찰되지 않은 칸은 빈 값.
defineCalc('fin_cohort', ['finance_loans'],
  (finance_loans) => {
    const out = [];
    const months = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];
    for (const grade of ['전체', 'A', 'B', 'C', 'D']) months.forEach((cohort, i) => {
      const g = finance_loans.filter((l) => l.취급월 === cohort && (grade === '전체' || l.신용등급 === grade));
      const first = g.map((l) => (l.최초30일연체_경과월 === '' || l.최초30일연체_경과월 == null ? Infinity : +l.최초30일연체_경과월));
      for (let mob = 1; mob <= 12; mob++) {
        const observed = mob <= 17 - i;
        out.push({ grade, cohort, mob, n: g.length,
          rate: observed ? Math.round(first.filter((m) => m <= mob).length / g.length * 10000) / 100 : null });
      }
    });
    return out;
  }
);

// 경과 6개월 누적 진입률: 1~3월 vs 10~12월 취급
// 1~3월 취급분과 10~12월 취급분을 합쳐 경과 6개월까지의 누적 30일+ 연체 진입률(%), 그리고 C·D등급 비중(%).
defineCalc('fin_mob6', ['finance_loans'],
  (finance_loans) => {
    const groups = [['1~3월 취급', ['2025-01', '2025-02', '2025-03']], ['10~12월 취급', ['2025-10', '2025-11', '2025-12']]];
    const out = [];
    for (const [group, ms] of groups) for (const grade of ['전체', 'A', 'B', 'C', 'D']) {
      const all = finance_loans.filter((l) => ms.includes(l.취급월));
      const g = all.filter((l) => grade === '전체' || l.신용등급 === grade);
      const hit = g.filter((l) => l.최초30일연체_경과월 !== '' && l.최초30일연체_경과월 != null && +l.최초30일연체_경과월 <= 6).length;
      out.push({ group, grade, n: g.length, rate: Math.round(hit / g.length * 10000) / 100,
        cd_share: Math.round(all.filter((l) => l.신용등급 === 'C' || l.신용등급 === 'D').length / all.length * 1000) / 10 });
    }
    return out;
  }
);

// 월말 연체율 추이
// 기준월 말마다 정상·연체 계약의 30일+ 연체잔액 ÷ 대출잔액(%), 전체와 등급별.
defineCalc('fin_trend', ['finance_loan_monthly', 'finance_loans'],
  (finance_loan_monthly, finance_loans) => {
    const g = new Map(finance_loans.map((l) => [l.계약ID, l.신용등급]));
    const acc = new Map();
    for (const r of finance_loan_monthly) {
      if (!(r.상태 === '정상' || r.상태 === '연체')) continue;
      for (const grade of ['전체', g.get(r.계약ID)]) {
        const k = r.기준월 + '|' + grade;
        const a = acc.get(k) || { bal: 0, dq: 0 };
        a.bal += +r.잔액_만원;
        if (r.상태 === '연체') a.dq += +r.잔액_만원;
        acc.set(k, a);
      }
    }
    return [...acc].map(([k, a]) => ({ month: k.split('|')[0], grade: k.split('|')[1], rate: Math.round(a.dq / a.bal * 10000) / 100 }))
      .sort((x, y) => d3.ascending(x.month, y.month));
  }
);

/* ---------------- 2) 차트 ---------------- */
(() => {
  const { frame, axis, tip, legend, CAPTION } = window.VZ;
  const GR = ['A', 'B', 'C', 'D'];
  const CH = ['대면', '모바일'];
  const chCol = (c) => COLORS[CH.indexOf(c)];
  const gradeCol = (g) => d3.interpolateRgb('#ffffff', COLORS[0])([0.3, 0.55, 0.8, 1][GR.indexOf(g)]);

  function bars(el, data, field, color, fmtLab, yFmt, ref) {
    const f = frame(el, 280, { t: 28, r: 16, b: 32, l: 52 });
    const x = d3.scaleBand(GR, [0, f.iw]).padding(0.4);
    const y = d3.scaleLinear([0, d3.max(data, (d) => d[field]) * 1.15], [f.ih, 0]).nice();
    axis(f.g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-f.iw).tickFormat(yFmt))).select('.domain').remove();
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).tickSizeOuter(0).tickFormat((g) => g + '등급')));
    const tp = tip(el);
    f.g.selectAll('rect').data(data).join('rect').attr('x', (d) => x(d.grade)).attr('width', x.bandwidth()).attr('y', (d) => y(d[field])).attr('height', (d) => f.ih - y(d[field])).attr('rx', 4).attr('fill', color)
      .on('mousemove', (ev, d) => tp.show(ev, [d.grade + '등급', `연체율 ${d.rate.toFixed(2)}%`, `대출잔액 ${d3.format(',.1f')(d.bal_eok)}억 원`, `연체잔액 ${d.dq_eok.toFixed(1)}억 원 (${d.dq_share.toFixed(1)}%)`])).on('mouseleave', tp.hide);
    f.g.selectAll('text.l').data(data).join('text').attr('class', 'l').attr('x', (d) => x(d.grade) + x.bandwidth() / 2).attr('y', (d) => y(d[field]) - 6).attr('text-anchor', 'middle')
      .attr('fill', 'var(--color-fg)').style('font-size', CAPTION).text(fmtLab);
    if (ref != null) {
      f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y(ref)).attr('y2', y(ref)).attr('stroke', 'var(--chart-reference)').attr('stroke-dasharray', '4 3');
      f.g.append('text').attr('x', 2).attr('y', y(ref) - 5).attr('fill', 'var(--color-fg-muted)').style('font-size', CAPTION).text(`전체 ${ref.toFixed(2)}%`);
    }
  }

  function gradeCharts() {
    const e1 = document.getElementById('c-rate'), e2 = document.getElementById('c-amt');
    const list = rows('fin_grade');
    const data = GR.map((g) => list.find((r) => r.grade === g));
    const all = list.find((r) => r.grade === '전체');
    bars(e1, data, 'rate', COLORS[0], (d) => d.rate.toFixed(2) + '%', (d) => d + '%', all.rate);
    bars(e2, data, 'dq_eok', COLORS[1], (d) => `${d.dq_eok.toFixed(1)}억 (${d.dq_share.toFixed(0)}%)`, (d) => d + '억', null);
  }

  function channel() {
    const el = document.getElementById('c-ch');
    const list = rows('fin_channel');
    const groups = ['전체', ...GR];
    const f = frame(el, 280, { t: 24, r: 12, b: 32, l: 44 });
    const x0 = d3.scaleBand(groups, [0, f.iw]).paddingInner(0.25).paddingOuter(0.1);
    const x1 = d3.scaleBand(CH, [0, x0.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear([0, d3.max(list, (d) => d.rate) * 1.15], [f.ih, 0]).nice();
    axis(f.g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-f.iw).tickFormat((d) => d + '%'))).select('.domain').remove();
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x0).tickSizeOuter(0).tickFormat((g) => (g === '전체' ? '전체' : g + '등급'))));
    f.g.append('line').attr('x1', x0('A') - x0.step() * 0.125).attr('x2', x0('A') - x0.step() * 0.125).attr('y1', 0).attr('y2', f.ih).attr('stroke', 'var(--chart-axis)');
    const tp = tip(el);
    const g = f.g.selectAll('g.gg').data(groups).join('g').attr('class', 'gg').attr('transform', (d) => `translate(${x0(d)},0)`);
    g.selectAll('rect').data((gr) => CH.map((c) => list.find((r) => r.grade === gr && r.channel === c))).join('rect')
      .attr('x', (d) => x1(d.channel)).attr('width', x1.bandwidth()).attr('y', (d) => y(d.rate)).attr('height', (d) => f.ih - y(d.rate)).attr('rx', 3).attr('fill', (d) => chCol(d.channel))
      .on('mousemove', (ev, d) => tp.show(ev, [`${d.grade === '전체' ? '전체' : d.grade + '등급'} · ${d.channel}`, `연체율 ${d.rate.toFixed(2)}%`])).on('mouseleave', tp.hide);
    g.selectAll('text').data((gr) => CH.map((c) => list.find((r) => r.grade === gr && r.channel === c))).join('text')
      .attr('x', (d) => x1(d.channel) + x1.bandwidth() / 2).attr('y', (d) => y(d.rate) - 4).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg)')
      .style('font-size', CAPTION).text((d) => d.rate.toFixed(1));
    legend(el, CH.map((c) => [c, chCol(c)]));
  }

  function mix() {
    const el = document.getElementById('c-mix');
    const list = rows('fin_channel').filter((r) => r.grade !== '전체');
    const f = frame(el, 200, { t: 8, r: 12, b: 32, l: 56 });
    const y = d3.scaleBand(CH, [0, f.ih]).padding(0.35);
    const x = d3.scaleLinear([0, 100], [0, f.iw]);
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).ticks(5).tickFormat((d) => d + '%'))).select('.domain').remove();
    axis(f.g.append('g').call(d3.axisLeft(y).tickSize(0))).select('.domain').remove();
    const tp = tip(el);
    CH.forEach((c) => {
      let acc = 0;
      GR.forEach((g) => {
        const d = list.find((r) => r.channel === c && r.grade === g);
        const x0 = acc; acc += d.bal_share;
        f.g.append('rect').attr('x', x(x0) + 1).attr('width', Math.max(0, x(acc) - x(x0) - 2)).attr('y', y(c)).attr('height', y.bandwidth()).attr('rx', 3).attr('fill', gradeCol(g))
          .on('mousemove', (ev) => tp.show(ev, [`${c} · ${g}등급`, `잔액 비중 ${d.bal_share.toFixed(1)}%`, `연체율 ${d.rate.toFixed(2)}%`])).on('mouseleave', tp.hide);
        if (x(acc) - x(x0) > 34) {
          f.g.append('text').attr('x', (x(x0) + x(acc)) / 2).attr('y', y(c) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'middle')
            .attr('fill', g === 'A' || g === 'B' ? 'var(--color-fg)' : 'var(--color-bg)').style('font-size', CAPTION).style('pointer-events', 'none')
            .text(`${g} ${d.bal_share.toFixed(0)}%`);
        }
      });
    });
    legend(el, GR.map((g) => [g + '등급', gradeCol(g)]));
  }

  function cohort() {
    const el = document.getElementById('c-cohort');
    const grade = state.grade;
    const list = rows('fin_cohort').filter((r) => r.grade === grade);
    const cohorts = [...new Set(list.map((r) => r.cohort))];
    const mobs = d3.range(1, 13);
    const w0 = el.clientWidth || 600;
    const small = w0 < 560;
    const f = frame(el, 26 * cohorts.length + 48, { t: 8, r: 8, b: 40, l: small ? 64 : 120 });
    const x = d3.scaleBand(mobs, [0, f.iw]).padding(0.06);
    const y = d3.scaleBand(cohorts, [0, f.ih]).padding(0.08);
    const vmax = d3.max(list, (r) => r.rate) || 1;
    const c = d3.interpolateRgb('#ffffff', COLORS[0]);
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).tickSize(0))).select('.domain').remove();
    axis(f.g.append('g').call(d3.axisLeft(y).tickSize(0).tickFormat((co) => small ? co.slice(2) : `${co} (n=${d3.format(',')(list.find((r) => r.cohort === co).n)})`))).select('.domain').remove();
    f.g.append('text').attr('x', f.iw / 2).attr('y', f.ih + 32).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').style('font-size', CAPTION).text('취급 후 경과 개월 (MOB)');
    const tp = tip(el);
    const cell = f.g.selectAll('g.c').data(list).join('g').attr('class', 'c').attr('transform', (d) => `translate(${x(d.mob)},${y(d.cohort)})`);
    cell.append('rect').attr('width', x.bandwidth()).attr('height', y.bandwidth()).attr('rx', 3)
      .attr('fill', (d) => (d.rate == null ? 'transparent' : c(0.08 + 0.92 * d.rate / vmax)))
      .attr('stroke', (d) => (d.rate == null ? 'var(--chart-grid)' : 'none'))
      .on('mousemove', (ev, d) => tp.show(ev, [`${d.cohort} 취급 · 경과 ${d.mob}개월`, d.rate == null ? '아직 관찰되지 않음' : `누적 진입률 ${d.rate.toFixed(2)}%`, `취급 ${d3.format(',')(d.n)}건`])).on('mouseleave', tp.hide);
    if (x.bandwidth() > 26) {
      cell.append('text').attr('x', x.bandwidth() / 2).attr('y', y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'middle').style('pointer-events', 'none')
        .style('font-size', CAPTION).attr('fill', (d) => (d.rate == null ? 'var(--color-fg-muted)' : d.rate / vmax > 0.55 ? 'var(--color-bg)' : 'var(--color-fg)'))
        .text((d) => (d.rate == null ? '—' : d.rate.toFixed(1)));
    }
  }

  function trend() {
    const el = document.getElementById('c-trend');
    const grade = state.grade;
    const list = rows('fin_trend').filter((r) => r.grade === grade);
    const parse = d3.utcParse('%Y-%m');
    const pts = list.map((r) => ({ d: parse(r.month), m: r.month, y: r.rate }));
    const f = frame(el, 280, { t: 20, r: 64, b: 36, l: 48 });
    const x = d3.scaleUtc(d3.extent(pts, (p) => p.d), [0, f.iw]);
    const y = d3.scaleLinear([0, d3.max(pts, (p) => p.y) * 1.15], [f.ih, 0]).nice();
    axis(f.g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-f.iw).tickFormat((d) => d + '%'))).select('.domain').remove();
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).ticks(d3.utcMonth.every(f.iw < 500 ? 4 : 2)).tickFormat(d3.utcFormat('%y-%m'))));
    const split = parse('2025-12');
    f.g.append('line').attr('x1', x(split)).attr('x2', x(split)).attr('y1', 0).attr('y2', f.ih).attr('stroke', 'var(--chart-reference)').attr('stroke-dasharray', '4 3');
    f.g.append('text').attr('x', x(split) + 6).attr('y', 10).attr('fill', 'var(--color-fg-muted)').style('font-size', CAPTION).text('이후 신규 취급 없음');
    f.g.append('path').attr('d', d3.line().x((p) => x(p.d)).y((p) => y(p.y))(pts)).attr('fill', 'none').attr('stroke', COLORS[0]).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    f.g.selectAll('circle').data(pts).join('circle').attr('cx', (p) => x(p.d)).attr('cy', (p) => y(p.y)).attr('r', 3).attr('fill', COLORS[0]);
    const last = pts.at(-1);
    f.g.append('text').attr('x', x(last.d) + 6).attr('y', y(last.y)).attr('dy', '0.35em').attr('fill', 'var(--color-fg)').style('font-size', CAPTION).text(last.y.toFixed(2) + '%');
    const tp = tip(el);
    const rule = f.g.append('line').attr('y1', 0).attr('y2', f.ih).attr('stroke', 'var(--chart-axis)').attr('opacity', 0);
    f.g.append('rect').attr('width', f.iw).attr('height', f.ih).attr('fill', 'transparent')
      .on('mousemove', (ev) => { const [mx] = d3.pointer(ev); const p = pts[d3.minIndex(pts, (q) => Math.abs(x(q.d) - mx))]; rule.attr('x1', x(p.d)).attr('x2', x(p.d)).attr('opacity', 1); tp.show(ev, [`${p.m} 말`, `연체율 ${p.y.toFixed(2)}%`]); })
      .on('mouseleave', () => { rule.attr('opacity', 0); tp.hide(); });
  }

  // 금융 탭에 그리기 함수 등록
  [gradeCharts, channel, mix, cohort, trend].forEach((fn) => onDraw('finance', fn));
})();