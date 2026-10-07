const SVG_NS = 'http://www.w3.org/2000/svg';
const shortNames = { transport: '交通' };
let nextId = 0;

// Missing ratings retain their own outside-ring placeholders. Only rated axes
// participate in lines; an area exists only after every dimension is rated.
export function createRadar(host, dimensions) {
  if (!host?.ownerDocument || !Array.isArray(dimensions) || dimensions.length < 3) {
    throw new TypeError('A radar host and at least three dimensions are required.');
  }
  const doc = host.ownerDocument;
  const dimensionsCopy = dimensions.map(d => ({
    key: String(d.key), label: String(d.label),
    shortLabel: String(d.shortLabel || shortNames[d.key] || d.label)
  }));
  const id = `island-radar-${++nextId}`;
  const center = { x: 220, y: 190 }, radius = 124, count = dimensionsCopy.length;
  const make = (tag, attributes = {}, content) => {
    const element = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (content !== undefined) element.textContent = content;
    return element;
  };
  const point = (index, r) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
  };
  const coords = points => points.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
  const summary = doc.createElement('p');
  summary.className = 'radar-count';
  summary.id = `${id}-count`;
  const svg = make('svg', { viewBox: '0 0 440 390', class: 'radar-svg', role: 'img', 'aria-labelledby': `${id}-title ${id}-description` });
  const title = make('title', { id: `${id}-title` }, '海岛八维评分');
  const description = make('desc', { id: `${id}-description` });
  svg.append(title, description);
  for (let level = 1; level <= 5; level++) {
    svg.append(make('polygon', { points: coords(dimensionsCopy.map((_, index) => point(index, radius * level / 5))), class: `radar-ring${level === 5 ? ' outer' : ''}` }));
    svg.append(make('text', { x: center.x + 8, y: center.y - radius * level / 5 + 3, class: 'radar-level' }, level));
  }
  for (let i = 0; i < count; i++) {
    const endpoint = point(i, radius);
    svg.append(make('line', { x1: center.x, y1: center.y, x2: endpoint.x, y2: endpoint.y, class: 'radar-axis' }));
  }
  const area = make('polygon', { class: 'radar-area', points: '', visibility: 'hidden' });
  const partial = make('g', { class: 'radar-partial-segments' });
  const points = make('g', { class: 'radar-points' });
  const labels = make('g', { class: 'radar-labels' });
  svg.append(area, partial, points, labels);
  const markers = [], valueLabels = [];
  dimensionsCopy.forEach((dimension, index) => {
    const marker = make('circle', { class: 'radar-point', 'data-key': dimension.key, r: 4 });
    points.append(marker);
    markers.push(marker);
    const anchor = point(index, radius + 42);
    const label = make('text', { x: anchor.x, y: anchor.y - 3, class: 'radar-label', 'text-anchor': 'middle' });
    const name = make('tspan', { x: anchor.x }, dimension.shortLabel);
    const value = make('tspan', { x: anchor.x, dy: 17, class: 'radar-value', 'data-key': dimension.key });
    label.append(name, value);
    labels.append(label);
    valueLabels.push(value);
  });
  const note = doc.createElement('p');
  note.className = 'radar-note';
  note.textContent = '外圈空心虚点表示未评；中心的 0 星表示已评。';
  host.replaceChildren(summary, svg, note);
  host.dataset.totalCount = String(count);
  function update(values = {}) {
    const ratings = dimensionsCopy.map(({ key }) => {
      const value = values[key];
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
    });
    const ratedCount = ratings.filter(value => value !== null).length;
    const locations = ratings.map((value, index) => point(index, value === null ? radius + 1 : radius * value / 5));
    host.dataset.ratedCount = String(ratedCount);
    summary.textContent = `已评 ${ratedCount} / ${count} 项`;
    description.textContent = dimensionsCopy.map((dimension, index) => `${dimension.label}：${ratings[index] === null ? '未评' : `${ratings[index]} 星`}`).join('；') + '。';
    markers.forEach((marker, index) => {
      const value = ratings[index], position = locations[index];
      marker.setAttribute('cx', position.x);
      marker.setAttribute('cy', position.y);
      marker.setAttribute('data-state', value === null ? 'unrated' : 'rated');
      marker.setAttribute('data-value', value === null ? '' : value);
      marker.setAttribute('r', value === null ? 4.5 : 4);
      valueLabels[index].textContent = value === null ? '未评' : `${value} 星`;
    });
    const complete = ratedCount === count;
    area.setAttribute('visibility', complete ? 'visible' : 'hidden');
    area.setAttribute('data-complete', String(complete));
    area.setAttribute('points', complete ? coords(locations) : '');
    partial.replaceChildren();
    if (!complete) {
      ratings.forEach((value, index) => {
        const next = (index + 1) % count;
        if (value !== null && ratings[next] !== null) {
          partial.append(make('polyline', { class: 'radar-partial', points: coords([locations[index], locations[next]]) }));
        }
      });
    }
  }
  update();
  return { update };
}
