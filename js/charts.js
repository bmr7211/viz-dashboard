/* =========================================================
 * charts.js — 여러 차트가 같이 쓰는 도구
 *   VZ.frame(el, 높이, 여백)  : 차트 영역에 SVG를 새로 깔고 안쪽 크기를 돌려줌
 *   VZ.axis(선택)             : D3 축을 대시보드 스타일로 다듬음
 *   VZ.tip(el)                : 마우스 툴팁
 *   VZ.legend(el, 항목들)      : 색 범례
 *   VZ.lineChart(...)         : 공공 탭의 선그래프 2개가 같이 쓰는 함수
 * ========================================================= */
window.VZ = (() => {
  const CAPTION = 'var(--fs-caption)';

  /* SVG 틀 만들기
   * m = 여백 {t, r, b, l}. iw/ih = 여백을 뺀 실제 그림 영역 크기 */
  function frame(el, h, m) {
    el.replaceChildren();                              // 이전 그림 지우기
    const w = Math.max(280, el.clientWidth || 600);    // 카드 너비에 맞춤
    const svg = d3.select(el).append('svg')
      .attr('width', '100%').attr('height', h)
      .attr('viewBox', `0 0 ${w} ${h}`);
    return {
      svg, w, h,
      iw: w - m.l - m.r,
      ih: h - m.t - m.b,
      g: svg.append('g').attr('transform', `translate(${m.l},${m.t})`),
    };
  }

  /* 축 스타일: 글자는 회색, 눈금선은 연한 회색 */
  function axis(sel) {
    sel.attr('font-size', null).attr('font-family', null);
    sel.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', CAPTION);
    sel.selectAll('line').attr('stroke', 'var(--chart-grid)');
    sel.select('.domain').attr('stroke', 'var(--chart-axis)');
    return sel;
  }

  /* 툴팁: show(이벤트, [제목, 줄1, 줄2…]) / hide() */
  function tip(el) {
    let t = el.querySelector('.vz-tip');
    if (!t) {
      t = document.createElement('div');
      t.className = 'vz-tip';
      t.hidden = true;
      el.appendChild(t);
    }
    return {
      show(ev, lines) {
        t.replaceChildren(...lines.map((text, i) => {
          const d = document.createElement('div');
          if (i === 0) d.className = 'h';
          d.textContent = text;
          return d;
        }));
        t.hidden = false;
        const [x, y] = d3.pointer(ev, el);
        // 카드 밖으로 나가지 않게 위치 조정
        t.style.left = Math.max(0, Math.min(el.clientWidth - t.offsetWidth, x + 12)) + 'px';
        t.style.top = Math.max(0, y - t.offsetHeight - 8) + 'px';
      },
      hide() { t.hidden = true; },
    };
  }

  /* 범례: items = [[이름, 색], …] */
  function legend(el, items) {
    const lg = document.createElement('div');
    lg.className = 'vz-legend';
    for (const [name, color] of items) {
      const s = document.createElement('span');
      const i = document.createElement('i');
      i.style.background = color;
      s.append(i, document.createTextNode(name));
      lg.appendChild(s);
    }
    el.appendChild(lg);
  }

  /* 선그래프 (여러 계열)
   * series : [{name, color, pts: [{x, y}, …]}, …]
   * xDom   : [x최소, x최대]
   * xFmt   : x값 표시 함수
   * yMax   : y축 최대값 (y는 %)
   * mark   : 세로 점선 위치 (없으면 null)
   * opts   : {ticks: x눈금 배열, bands: [[시작,끝],…] 회색 띠, dec: 툴팁 소수 자리} */
  function lineChart(el, series, xDom, xFmt, yMax, mark, opts = {}) {
    const f = frame(el, 300, { t: 16, r: 56, b: 40, l: 44 });
    const x = d3.scaleLinear(xDom, [0, f.iw]);
    const y = d3.scaleLinear([0, yMax], [f.ih, 0]);

    // 회색 띠 (예: 출퇴근 시간대)
    (opts.bands || []).forEach(([a, b]) => {
      f.g.append('rect')
        .attr('x', x(a - 0.5)).attr('width', x(b + 0.5) - x(a - 0.5))
        .attr('y', 0).attr('height', f.ih)
        .attr('fill', 'var(--chart-grid)').attr('opacity', 0.6);
    });

    // 축
    axis(f.g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-f.iw).tickFormat((d) => d + '%')))
      .select('.domain').remove();
    axis(f.g.append('g').attr('transform', `translate(0,${f.ih})`)
      .call(d3.axisBottom(x).tickValues(opts.ticks).tickFormat(xFmt)));

    // 기준 점선
    if (mark != null) {
      f.g.append('line')
        .attr('x1', x(mark)).attr('x2', x(mark)).attr('y1', 0).attr('y2', f.ih)
        .attr('stroke', 'var(--chart-reference)').attr('stroke-dasharray', '4 3');
    }

    // 선과 점
    const ln = d3.line().defined((d) => d.y != null).x((d) => x(d.x)).y((d) => y(d.y));
    series.forEach((s) => {
      f.g.append('path').attr('d', ln(s.pts))
        .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
      f.g.selectAll(null).data(s.pts.filter((p) => p.y != null)).join('circle')
        .attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', 2.5).attr('fill', s.color);
    });

    // 선 끝에 계열 이름 (겹치면 14px씩 밀어냄)
    const ends = series.map((s) => {
      const last = s.pts.filter((p) => p.y != null).at(-1);
      return { name: s.name, x: x(last.x) + 6, y: y(last.y) };
    }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) {
      if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    }
    ends.forEach((e) => {
      f.g.append('text').attr('x', e.x).attr('y', e.y).attr('dy', '0.35em')
        .attr('fill', 'var(--color-fg)').style('font-size', CAPTION).text(e.name);
    });

    // 마우스를 올리면 가장 가까운 x의 값들을 툴팁으로
    const tp = tip(el);
    const xs = series[0].pts.map((p) => p.x);
    const rule = f.g.append('line').attr('y1', 0).attr('y2', f.ih)
      .attr('stroke', 'var(--chart-axis)').attr('opacity', 0);
    f.g.append('rect').attr('width', f.iw).attr('height', f.ih).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev);
        const xv = xs[d3.minIndex(xs, (v) => Math.abs(x(v) - mx))];
        rule.attr('x1', x(xv)).attr('x2', x(xv)).attr('opacity', 1);
        tp.show(ev, [xFmt(xv), ...series.map((s) => {
          const p = s.pts.find((q) => q.x === xv);
          return `${s.name} ${p.y == null ? '—' : p.y.toFixed(opts.dec ?? 1) + '%'}`;
        })]);
      })
      .on('mouseleave', () => { rule.attr('opacity', 0); tp.hide(); });
  }

  return { frame, axis, tip, legend, lineChart, CAPTION };
})();