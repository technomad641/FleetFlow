// Canvas renderer. It is a pure drawing pass over simulation state: given the
// current state and a fractional tick (for smooth interpolation between sim
// steps), it paints the network, the load on every node and lane, and every
// packet in flight. It never mutates the simulation.
//
// The render loop runs at the display's refresh rate (~60fps) while the sim
// advances at a fixed, slower tick. `tickFloat` = integer tick + interpolation
// alpha, so a packet that entered a lane at tick T slides smoothly from 0 to 1
// across its transit time instead of jumping once per tick.
import { networkLoad } from "../sim/metrics.js";

const MAX_QUEUE_DOTS = 10;

// Cool-to-hot ramp for load: calm blue when healthy, amber as it fills, red when
// it chokes. Input is a 0..1+ load fraction.
function loadColor(load, alpha = 1) {
  const t = Math.min(1, Math.max(0, load));
  let r;
  let g;
  let b;
  if (t < 0.5) {
    const k = t / 0.5; // blue -> amber
    r = lerp(90, 245, k);
    g = lerp(170, 190, k);
    b = lerp(255, 70, k);
  } else {
    const k = (t - 0.5) / 0.5; // amber -> red
    r = lerp(245, 255, k);
    g = lerp(190, 70, k);
    b = lerp(70, 70, k);
  }
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Map normalized node coordinates to canvas pixels, leaving room for labels.
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

  // Lanes first, under the nodes.
  for (const lane of network.lanes) {
    const a = layout.get(lane.from);
    const b = layout.get(lane.to);
    const laneLoad = load.lanes.get(lane.id);
    drawLane(ctx, a, b, laneLoad, lane, tickFloat);
  }

  // Packets in transit, riding their lanes.
  for (const lane of network.lanes) {
    const a = layout.get(lane.from);
    const b = layout.get(lane.to);
    const contents = state.lanes.get(lane.id).contents;
    for (const item of contents) {
      const progress = Math.min(1, Math.max(0, (tickFloat - item.enterTick) / lane.transit));
      const px = lerp(a.x, b.x, progress);
      const py = lerp(a.y, b.y, progress);
      drawPacket(ctx, px, py);
    }
  }

  // Nodes and their queued backlog on top.
  const outage = state.scenario.outage > 0 ? state.scenario.outageNode : null;
  for (const node of network.nodes) {
    const point = layout.get(node.id);
    const nodeLoad = load.nodes.get(node.id);
    drawNode(ctx, point, nodeLoad, node, theme, node.id === outage);
    drawQueue(ctx, point, state.nodes.get(node.id).queue.length);
  }
}

function drawBackdrop(ctx, width, height, theme) {
  // A faint dot grid for depth. Kept cheap: one pass, no shadows.
  const gap = 34;
  ctx.fillStyle = theme.grid;
  for (let x = gap; x < width; x += gap) {
    for (let y = gap; y < height; y += gap) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawLane(ctx, a, b, laneLoad, lane, tickFloat) {
  const width = 1.4 + lane.capacity * 0.28;

  // Base lane.
  ctx.strokeStyle = loadColor(laneLoad, 0.18 + Math.min(0.6, laneLoad) * 0.5);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // A flowing highlight when the lane is hot, to read as pressure.
  if (laneLoad > 0.55) {
    ctx.save();
    ctx.setLineDash([2, 10]);
    ctx.lineDashOffset = -(tickFloat * 14) % 12;
    ctx.strokeStyle = loadColor(laneLoad, 0.85);
    ctx.lineWidth = width * 0.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPacket(ctx, x, y) {
  ctx.beginPath();
  ctx.fillStyle = "rgba(226, 240, 255, 0.95)";
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawNode(ctx, point, nodeLoad, node, theme, isDown) {
  const { x, y, r } = point;
  const hot = Math.min(1, nodeLoad);

  // Soft glow that intensifies with load (the only shadowed draw, kept to the
  // handful of nodes so it stays cheap).
  ctx.save();
  ctx.shadowColor = isDown ? "rgba(255,80,80,0.9)" : loadColor(nodeLoad, 0.9);
  ctx.shadowBlur = 14 + hot * 26;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = theme.nodeFill;
  ctx.fill();
  ctx.restore();

  // Capacity ring, colored by load.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = isDown ? "rgba(255,90,90,0.95)" : loadColor(nodeLoad, 0.95);
  ctx.stroke();

  // Label.
  ctx.fillStyle = theme.label;
  ctx.font = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(node.name, x, y + r + 6);
}

function drawQueue(ctx, point, queueLength) {
  if (queueLength === 0) return;
  const { x, y, r } = point;
  const shown = Math.min(MAX_QUEUE_DOTS, queueLength);
  const startX = x - r - 10;
  for (let i = 0; i < shown; i += 1) {
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 196, 120, 0.9)";
    ctx.arc(startX - (i % 5) * 6, y - 12 + Math.floor(i / 5) * 8, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (queueLength > MAX_QUEUE_DOTS) {
    ctx.fillStyle = "rgba(255, 196, 120, 0.95)";
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${queueLength}`, startX + 2, y + 4);
  }
}
