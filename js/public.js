/* =========================================================
 * public.js — 공공 탭: 119 구급 현장도착 (계산 7개 + 차트 7개)
 * ========================================================= */

/* ---------------- 1) 계산 ----------------
 * defineCalc(id, [입력 데이터], 함수)
 * 결과는 행(객체) 배열. 본문 숫자(data-source)와 차트가 이 결과를 읽음
 * 기준선(th) 6~15분 전부를 미리 계산해 두므로 슬라이더를 움직여도 다시 계산하지 않음 */

// 현장도착시간 요약 통계
// 전체와 지역유형별 출동 건수, 평균, 분위수(10·25·50·75·90), 20분 초과 비율, 65세 이상 환자 비중.
defineCalc('ems_summary', ['ems_calls'],
  (ems_calls) => {
    const groups = [['전체', ems_calls], ...['도심', '주거', '외곽'].map((t) => [t, ems_calls.filter((r) => r.지역유형 === t)])];
    const r1 = (x) => Math.round(x * 10) / 10;
    return groups.map(([scope, rs]) => {
      const a = rs.map((r) => +r.현장도착시간_분).sort((x, y) => x - y);
      const q = (p) => r1(d3.quantileSorted(a, p));
      return { scope, n: a.length, mean: r1(d3.mean(a)), p10: q(0.1), q1: q(0.25), median: q(0.5), q3: q(0.75), p90: q(0.9),
        over20: r1(a.filter((v) => v > 20).length / a.length * 100),
        old_share: r1(rs.filter((r) => r.환자연령대 === '65세이상').length / rs.length * 100) };
    });
  }
);

// 기준 이내 도착률
// 기준 6~15분마다 전체·지역유형·자치구별로 현장도착시간이 기준 이하인 출동의 비율(%).
defineCalc('ems_within', ['ems_calls'],
  (ems_calls) => {
    const t = ems_calls.map((r) => ({ v: +r.현장도착시간_분, type: r.지역유형, gu: r.자치구 }));
    const scopes = [['전체', () => true],
      ...['도심', '주거', '외곽'].map((s) => [s, (r) => r.type === s]),
      ...['가온구', '나래구', '다솜구', '라온구', '마루구'].map((s) => [s, (r) => r.gu === s])];
    const out = [];
    for (let th = 6; th <= 15; th++) for (const [scope, f] of scopes) {
      const g = t.filter(f);
      out.push({ th, scope, n: g.length, within: Math.round(g.filter((r) => r.v <= th).length / g.length * 1000) / 10 });
    }
    return out;
  }
);

// 도심과 외곽의 도착률 격차
// 기준마다 도심 도착률에서 외곽 도착률을 뺀 값(%p).
defineCalc('ems_gap', ['ems_within'],
  (ems_within) => d3.range(6, 16).map((th) => {
    const g = (s) => ems_within.find((r) => r.th === th && r.scope === s).within;
    return { th, gap: Math.round((g('도심') - g('외곽')) * 10) / 10 };
  })
);

// 1분 구간별 출동 건수
// 현장도착시간을 1분 구간으로 나눈 출동 건수. 40분 이상은 마지막 구간에 합산.
defineCalc('ems_hist', ['ems_calls'],
  (ems_calls) => {
    const c = new Array(41).fill(0);
    for (const r of ems_calls) c[Math.min(40, Math.floor(+r.현장도착시간_분))]++;
    return c.map((n, bin) => ({ bin, n }));
  }
);

// 행정동별 거리와 도착률
// 기준 6~15분마다 행정동 40곳의 최근접 119안전센터 거리, 출동 건수, 기준 이내 도착률(%).
defineCalc('ems_dong', ['ems_calls', 'ems_dongs'],
  (ems_calls, ems_dongs) => {
    const by = d3.group(ems_calls, (r) => r.동코드);
    const out = [];
    for (let th = 6; th <= 15; th++) for (const d of ems_dongs) {
      const code = d.동코드;
      const g = by.get(code) || [];
      out.push({ th, code, name: d.자치구 + ' ' + d.행정동, type: d.지역유형, dist: +d.최근접119안전센터거리_km,
        n: g.length, within: Math.round(g.filter((r) => +r.현장도착시간_분 <= th).length / g.length * 1000) / 10 });
    }
    return out;
  }
);

// 거리와 도착률의 상관계수
// 기준마다 행정동 40곳의 센터 거리와 기준 이내 도착률 사이 피어슨 상관계수.
defineCalc('ems_dong_r', ['ems_dong'],
  (ems_dong) => d3.range(6, 16).map((th) => {
    const g = ems_dong.filter((r) => r.th === th);
    const mx = d3.mean(g, (r) => r.dist), my = d3.mean(g, (r) => r.within);
    const sxy = d3.sum(g, (r) => (r.dist - mx) * (r.within - my));
    const sx = Math.sqrt(d3.sum(g, (r) => (r.dist - mx) ** 2)), sy = Math.sqrt(d3.sum(g, (r) => (r.within - my) ** 2));
    return { th, r: Math.round(sxy / (sx * sy) * 100) / 100 };
  })
);

// 접수 시간대별 도착률
// 기준 6~15분마다 지역유형·접수 시각(0~23시)별 기준 이내 도착률(%)과 출동 건수.
defineCalc('ems_hour', ['ems_calls'],
  (ems_calls) => {
    const by = d3.group(ems_calls, (r) => r.지역유형, (r) => +r.접수시);
    const out = [];
    for (let th = 6; th <= 15; th++) for (const type of ['도심', '주거', '외곽']) for (let hour = 0; hour < 24; hour++) {
      const g = by.get(type)?.get(hour) || [];
      out.push({ th, type, hour, n: g.length, within: g.length ? Math.round(g.filter((r) => +r.현장도착시간_분 <= th).length / g.length * 1000) / 10 : null });
    }
    return out;
  }
);

/* ---------------- 2) 차트 ---------------- */
(() => {
  const { frame, axis, tip, legend, lineChart, CAPTION } = window.VZ;
  const TYPES = ['도심', '주거', '외곽'];
  const col = (t) => COLORS[TYPES.indexOf(t)];

  function typeBars() {
    const el = document.getElementById('c-type');
    const th = state.th;
    const list = rows('ems_within').filter((r) => r.th === th);
    const all = list.find((r) => r.scope === '전체');
    const data = TYPES.map((t) => list.find((r) => r.scope === t));
    const f = frame(el, 300, { t: 24, r: 16, b: 44, l: 44 });
    const x = d3.scaleBand(TYPES, [0, f.iw]).padding(0.38);
    const y = d3.scaleLinear([0, 100], [f.ih, 0]);
    axis(f.g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-f.iw).tickFormat((d) => d + '%'))).select('.domain').remove();
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).tickSizeOuter(0).tickFormat((t) => `${t} (n=${d3.format(',')(data[TYPES.indexOf(t)].n)})`)));
    const tp = tip(el);
    f.g.selectAll('rect.b').data(data).join('rect').attr('class', 'b').attr('x', (d) => x(d.scope)).attr('width', x.bandwidth())
      .attr('y', (d) => y(d.within)).attr('height', (d) => f.ih - y(d.within)).attr('rx', 4).attr('fill', (d) => col(d.scope))
      .on('mousemove', (ev, d) => tp.show(ev, [d.scope, `${th}분 이내 ${d.within.toFixed(1)}%`, `출동 ${d3.format(',')(d.n)}건`])).on('mouseleave', tp.hide);
    f.g.selectAll('text.l').data(data).join('text').attr('class', 'l').attr('x', (d) => x(d.scope) + x.bandwidth() / 2).attr('y', (d) => y(d.within) - 6)
      .attr('text-anchor', 'middle').attr('fill', 'var(--color-fg)').style('font-size', CAPTION).text((d) => d.within.toFixed(1) + '%');
    f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y(all.within)).attr('y2', y(all.within)).attr('stroke', 'var(--chart-reference)').attr('stroke-dasharray', '4 3');
    f.g.append('text').attr('x', f.iw).attr('y', y(all.within) - 5).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').style('font-size', CAPTION).text(`전체 ${all.within.toFixed(1)}%`);
  }

  function guBars() {
    const el = document.getElementById('c-gu');
    const th = state.th;
    const list = rows('ems_within').filter((r) => r.th === th);
    const all = list.find((r) => r.scope === '전체');
    const data = list.filter((r) => r.scope.endsWith('구')).sort((a, b) => a.within - b.within);
    const f = frame(el, 300, { t: 8, r: 56, b: 40, l: 56 });
    const y = d3.scaleBand(data.map((d) => d.scope), [0, f.ih]).padding(0.35);
    const x = d3.scaleLinear([0, 100], [0, f.iw]);
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).ticks(5).tickSize(-f.ih).tickFormat((d) => d + '%'))).select('.domain').remove();
    axis(f.g.append('g').call(d3.axisLeft(y).tickSize(0))).select('.domain').remove();
    const tp = tip(el);
    f.g.selectAll('rect').data(data).join('rect').attr('y', (d) => y(d.scope)).attr('height', y.bandwidth()).attr('x', 0).attr('width', (d) => x(d.within)).attr('rx', 4)
      .attr('fill', COLORS[0]).on('mousemove', (ev, d) => tp.show(ev, [d.scope, `${th}분 이내 ${d.within.toFixed(1)}%`, `출동 ${d3.format(',')(d.n)}건`])).on('mouseleave', tp.hide);
    f.g.selectAll('text.l').data(data).join('text').attr('class', 'l').attr('x', (d) => x(d.within) + 6).attr('y', (d) => y(d.scope) + y.bandwidth() / 2).attr('dy', '0.35em')
      .attr('fill', 'var(--color-fg)').style('font-size', CAPTION).text((d) => d.within.toFixed(1) + '%');
    f.g.append('line').attr('x1', x(all.within)).attr('x2', x(all.within)).attr('y1', -4).attr('y2', f.ih).attr('stroke', 'var(--chart-reference)').attr('stroke-dasharray', '4 3');
    f.g.append('text').attr('x', x(all.within)).attr('y', f.ih + 32).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').style('font-size', CAPTION).text(`전체 ${all.within.toFixed(1)}%`);
  }

  function hist() {
    const el = document.getElementById('c-hist');
    const th = state.th;
    const bins = rows('ems_hist');
    const s = rows('ems_summary').find((r) => r.scope === '전체');
    const f = frame(el, 300, { t: 28, r: 16, b: 40, l: 52 });
    const x = d3.scaleLinear([0, 41], [0, f.iw]);
    const y = d3.scaleLinear([0, d3.max(bins, (d) => d.n) * 1.08], [f.ih, 0]).nice();
    f.g.append('rect').attr('x', 0).attr('y', 0).attr('width', x(th)).attr('height', f.ih).attr('fill', COLORS[0]).attr('opacity', 0.08);
    axis(f.g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-f.iw).tickFormat(d3.format(',')))).select('.domain').remove();
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).tickValues([0, 5, 10, 15, 20, 25, 30, 35, 40]).tickFormat((d) => (d === 40 ? '40+' : d) + '분')));
    const tp = tip(el);
    f.g.selectAll('rect.b').data(bins).join('rect').attr('class', 'b').attr('x', (d) => x(d.bin) + 1).attr('width', Math.max(1, x(1) - x(0) - 2))
      .attr('y', (d) => y(d.n)).attr('height', (d) => f.ih - y(d.n)).attr('rx', 2).attr('fill', COLORS[0])
      .on('mousemove', (ev, d) => tp.show(ev, [d.bin === 40 ? '40분 이상' : `${d.bin}~${d.bin + 1}분`, `출동 ${d3.format(',')(d.n)}건`])).on('mouseleave', tp.hide);
    const lines = [[s.median, `중앙값 ${s.median.toFixed(1)}분`, 0], [s.mean, `평균 ${s.mean.toFixed(1)}분`, 1], [s.p90, `90백분위 ${s.p90.toFixed(1)}분`, 0]];
    lines.forEach(([v, lab, k]) => {
      f.g.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', -6).attr('y2', f.ih).attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.2);
      f.g.append('text').attr('x', x(v) + 4).attr('y', k ? 10 : -10).attr('fill', 'var(--color-fg)').style('font-size', CAPTION).text(lab);
    });
    f.g.append('text').attr('x', f.iw).attr('y', 30).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').style('font-size', CAPTION).text(`음영 = ${th}분 이내`);
  }

  function box() {
    const el = document.getElementById('c-box');
    const th = state.th;
    const data = TYPES.map((t) => rows('ems_summary').find((r) => r.scope === t));
    const f = frame(el, 300, { t: 12, r: 24, b: 40, l: 92 });
    const y = d3.scaleBand(TYPES, [0, f.ih]).padding(0.4);
    const x = d3.scaleLinear([0, Math.ceil(d3.max(data, (d) => d.p90) / 5) * 5 + 5], [0, f.iw]);
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).ticks(6).tickSize(-f.ih).tickFormat((d) => d + '분'))).select('.domain').remove();
    axis(f.g.append('g').call(d3.axisLeft(y).tickSize(0).tickFormat((t) => `${t} (n=${d3.format(',')(data[TYPES.indexOf(t)].n)})`))).select('.domain').remove();
    const tp = tip(el);
    const g = f.g.selectAll('g.bx').data(data).join('g').attr('class', 'bx').attr('transform', (d) => `translate(0,${y(d.scope)})`);
    const bh = y.bandwidth();
    g.append('line').attr('x1', (d) => x(d.p10)).attr('x2', (d) => x(d.p90)).attr('y1', bh / 2).attr('y2', bh / 2).attr('stroke', 'var(--color-fg-muted)');
    g.append('line').attr('x1', (d) => x(d.p10)).attr('x2', (d) => x(d.p10)).attr('y1', bh * 0.25).attr('y2', bh * 0.75).attr('stroke', 'var(--color-fg-muted)');
    g.append('line').attr('x1', (d) => x(d.p90)).attr('x2', (d) => x(d.p90)).attr('y1', bh * 0.25).attr('y2', bh * 0.75).attr('stroke', 'var(--color-fg-muted)');
    g.append('rect').attr('x', (d) => x(d.q1)).attr('width', (d) => x(d.q3) - x(d.q1)).attr('height', bh).attr('rx', 4)
      .attr('fill', (d) => col(d.scope)).attr('fill-opacity', 0.35).attr('stroke', (d) => col(d.scope))
      .on('mousemove', (ev, d) => tp.show(ev, [d.scope, `10백분위 ${d.p10}분 · Q1 ${d.q1}분`, `중앙값 ${d.median}분`, `Q3 ${d.q3}분 · 90백분위 ${d.p90}분`])).on('mouseleave', tp.hide);
    g.append('line').attr('x1', (d) => x(d.median)).attr('x2', (d) => x(d.median)).attr('y1', 0).attr('y2', bh).attr('stroke', 'var(--color-fg)').attr('stroke-width', 2.5);
    f.g.append('line').attr('x1', x(th)).attr('x2', x(th)).attr('y1', -4).attr('y2', f.ih).attr('stroke', 'var(--chart-reference)').attr('stroke-dasharray', '4 3');
    f.g.append('text').attr('x', x(th) + 4).attr('y', 4).attr('fill', 'var(--color-fg-muted)').style('font-size', CAPTION).text(`${th}분`);
  }

  function sens() {
    const el = document.getElementById('c-sens');
    const list = rows('ems_within');
    const series = TYPES.map((t) => ({ name: t, color: col(t), pts: list.filter((r) => r.scope === t).map((r) => ({ x: r.th, y: r.within })) }));
    lineChart(el, series, [6, 15], (d) => d + '분', 100, state.th, { ticks: d3.range(6, 16) });
  }

  function hour() {
    const el = document.getElementById('c-hour');
    const th = state.th;
    const list = rows('ems_hour').filter((r) => r.th === th);
    const series = TYPES.map((t) => ({ name: t, color: col(t), pts: list.filter((r) => r.type === t).map((r) => ({ x: r.hour, y: r.within })) }));
    lineChart(el, series, [0, 23], (d) => d + '시', 100, null, { ticks: d3.range(0, 24, 3), bands: [[7, 9], [17, 19]] });
  }

  function scatter() {
    const el = document.getElementById('c-scatter');
    const th = state.th;
    const data = rows('ems_dong').filter((r) => r.th === th);
    const f = frame(el, 300, { t: 12, r: 16, b: 40, l: 44 });
    const x = d3.scaleLinear([0, Math.ceil(d3.max(data, (d) => d.dist))], [0, f.iw]);
    const y = d3.scaleLinear([0, 100], [f.ih, 0]);
    const r = d3.scaleSqrt([0, d3.max(data, (d) => d.n)], [0, 11]);
    axis(f.g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-f.iw).tickFormat((d) => d + '%'))).select('.domain').remove();
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`).call(d3.axisBottom(x).ticks(8).tickSize(-f.ih).tickFormat((d) => d + 'km'))).select('.domain').remove();
    const tp = tip(el);
    f.g.selectAll('circle').data(data.sort((a, b) => b.n - a.n)).join('circle').attr('cx', (d) => x(d.dist)).attr('cy', (d) => y(d.within)).attr('r', (d) => Math.max(4, r(d.n)))
      .attr('fill', (d) => col(d.type)).attr('fill-opacity', 0.8).attr('stroke', 'var(--color-panel)').attr('stroke-width', 2)
      .on('mousemove', (ev, d) => tp.show(ev, [`${d.name} (${d.type})`, `센터 거리 ${d.dist.toFixed(2)}km`, `${th}분 이내 ${d.within.toFixed(1)}%`, `출동 ${d3.format(',')(d.n)}건`])).on('mouseleave', tp.hide);
    legend(el, TYPES.map((t) => [t, col(t)]));
  }

  // 공공 탭에 그리기 함수 등록
  [typeBars, guBars, hist, box, sens, hour, scatter].forEach((fn) => onDraw('public', fn));
})();