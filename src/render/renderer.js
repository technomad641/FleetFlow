// Canvas renderer. A pure drawing pass over simulation state: given the current
// state and a fractional tick (for smooth interpolation between sim steps), it
// paints the network, the load on every node and lane, and every packet in
// flight. It never mutates the simulation.
//
// The render loop runs at the display's refresh rate (~60fps) while the sim
// advances at a fixed, slower tick. `tickFloat` = integer tick + interpolation
// alpha, so a packet that entered a lane at tick T slides smoothly from 0 to 1
// across its transit time instead of jumping once per tick.
//
// Everything is themed through the passed `theme`: the grayscale load ramp runs
// from `theme.calm` to `theme.high` (white on dark, near-black on light), and
// congestion always tips into red, the one alert color in both themes.
import { networkLoad } from "../sim/metrics.js";

const MAX_QUEUE_DOTS = 10;
const CONGESTION = 0.6;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function loadColor(theme, load, alpha = 1) {
  const t = Math.min(1, Math.max(0, load));
  if (t < CONGESTION) {
    const v = Math.round(lerp(theme.calm, theme.high, t / CONGESTION));
    return `rgba(${v}, ${v}, ${v}, ${alpha})`;
  }
  const k = (t - CONGESTION) / (1 - CONGESTION);
  const r = Math.round(lerp(theme.high, 235, k));
  const g = Math.round(lerp(theme.high, 70, k));
  const b = Math.round(lerp(theme.high, 78, k));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function computeLayout(network, width, height) {
  const padX = Math.max(54, width * 0.09);
  const padY = Math.max(48, height * 0.12);
  const layout = new Map();
  for (const node of network.nodes) {
    layout.set(node.id, {
      x: padX + node.x * (width - padX * 2),
      y: padY + node.y * (height - padY * 2),
      r: 10 + node.capacity * 0.7,
      node,
    });
  }
  return layout;
}

export function drawScene(ctx, state, { width, height, tickFloat, theme }) {
  const { network } = state;
  const load = networkLoad(state);
  const layout = computeLayout(network, width, height);

  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, width, height, theme);

  for (const lane of network.lanes) {
    const a = layout.get(lane.from);
    const b = layout.get(lane.to);
    drawLane(ctx, a, b, load.lanes.get(lane.id), lane, tickFloat, theme);
  }

  for (const lane of network.lanes) {
    const a = layout.get(lane.from);
    const b = layout.get(lane.to);
    for (const item of state.lanes.get(lane.id).contents) {
      const progress = Math.min(1, Math.max(0, (tickFloat - item.enterTick) / lane.transit));
      drawPacket(ctx, lerp(a.x, b.x, progress), lerp(a.y, b.y, progress), theme);
    }
  }

  const outage = state.scenario.outage > 0 ? state.scenario.outageNode : null;
  for (const node of network.nodes) {
    const point = layout.get(node.id);
    drawNode(ctx, point, load.nodes.get(node.id), node, theme, node.id === outage);
    drawQueue(ctx, point, state.nodes.get(node.id).queue.length, theme);
  }
}

function drawBackdrop(ctx, width, height, theme) {
  const gap = 34;
  ctx.fillStyle = theme.grid;
  for (let x = gap; x < width; x += gap) {
    for (let y = gap; y < height; y += gap) ctx.fillRect(x, y, 1, 1);
  }
}

function drawLane(ctx, a, b, laneLoad, lane, tickFloat, theme) {
  const width = 1.4 + lane.capacity * 0.28;

  ctx.strokeStyle = loadColor(theme, laneLoad, 0.18 + Math.min(0.6, laneLoad) * 0.5);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  if (laneLoad > 0.55) {
    ctx.save();
    ctx.setLineDash([2, 10]);
    ctx.lineDashOffset = -(tickFloat * 14) % 12;
    ctx.strokeStyle = loadColor(theme, laneLoad, 0.85);
    ctx.lineWidth = width * 0.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPacket(ctx, x, y, theme) {
  ctx.beginPath();
  ctx.fillStyle = theme.fg;
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawNode(ctx, point, nodeLoad, node, theme, isDown) {
  const { x, y, r } = point;
  const hot = Math.min(1, nodeLoad);

  ctx.save();
  ctx.shadowColor = isDown ? "rgba(235,70,78,0.9)" : loadColor(theme, nodeLoad, 0.9);
  ctx.shadowBlur = 14 + hot * 26;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = theme.nodeFill;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = isDown ? "rgba(235,70,78,0.95)" : loadColor(theme, nodeLoad, 0.95);
  ctx.stroke();

  ctx.fillStyle = theme.label;
  ctx.font = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(node.name, x, y + r + 6);
}

function drawQueue(ctx, point, queueLength, theme) {
  if (queueLength === 0) return;
  const { x, y, r } = point;
  const shown = Math.min(MAX_QUEUE_DOTS, queueLength);
  const startX = x - r - 10;
  for (let i = 0; i < shown; i += 1) {
    ctx.beginPath();
    ctx.fillStyle = theme.queue;
    ctx.arc(startX - (i % 5) * 6, y - 12 + Math.floor(i / 5) * 8, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (queueLength > MAX_QUEUE_DOTS) {
    ctx.fillStyle = theme.queue;
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${queueLength}`, startX + 2, y + 4);
  }
}
