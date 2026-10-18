// Canvas renderer for the Dispatch (CVRP / VRPTW) view. Draws the depot, the
// customers (sized by demand), and each vehicle's route as a loop out of and
// back to the depot, with a marker travelling along it for a sense of motion.
// Pure: it reads the instance and the solved routes and draws, never mutating
// either.
//
// Coordinates are normalized by the instance's bounding box, so both the random
// instances (laid out in [0,1]) and the real benchmarks (0..100) render the
// same way. Routes are distinguished by brightness, not hue, to stay inside the
// monochrome-plus-one-alert palette; the one alert color (red) marks a stop
// served after its time window closed.

const ROUTE_SHADES = [0.95, 0.55, 0.8, 0.42, 0.68, 0.5, 0.88, 0.6];
const ALERT = "235,70,78"; // the one alert color, shared with the network renderer

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dispatchLayout(instance, width, height) {
  const padX = Math.max(48, width * 0.08);
  const padY = Math.max(44, height * 0.1);

  const all = [instance.depot, ...instance.customers];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of all) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const toPx = (p) => ({
    x: padX + ((p.x - minX) / spanX) * (width - padX * 2),
    y: padY + ((p.y - minY) / spanY) * (height - padY * 2),
  });

  return {
    depot: toPx(instance.depot),
    customers: instance.customers.map(toPx),
  };
}

export function drawDispatch(ctx, { instance, solution, width, height, t, theme, lateCustomers }) {
  const layout = dispatchLayout(instance, width, height);
  // Point index -> pixel coord (index 0 is the depot).
  const px = (idx) => (idx === 0 ? layout.depot : layout.customers[idx - 1]);
  const late = lateCustomers || new Set();
  const maxDemand = Math.max(1, ...instance.customers.map((c) => c.demand));

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, theme);

  // Routes.
  solution.routes.forEach((route, i) => {
    const shade = ROUTE_SHADES[i % ROUTE_SHADES.length];
    const path = [layout.depot, ...route.map((idx) => px(idx)), layout.depot];

    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let k = 1; k < path.length; k += 1) ctx.lineTo(path[k].x, path[k].y);
    ctx.strokeStyle = `rgba(${theme.routeRGB}, ${shade * 0.5})`;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.stroke();

    drawVehicle(ctx, path, t + i * 0.37, theme);
  });

  // Customers, sized by demand. A stop served late is ringed in the alert color.
  for (let i = 0; i < instance.customers.length; i += 1) {
    const c = layout.customers[i];
    const r = 3 + (instance.customers[i].demand / maxDemand) * 6;
    const isLate = late.has(i + 1);
    ctx.beginPath();
    ctx.fillStyle = isLate ? `rgba(${ALERT}, 0.95)` : theme.fg;
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (isLate) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${ALERT}, 0.9)`;
      ctx.lineWidth = 2;
      ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Depot on top.
  drawDepot(ctx, layout.depot, theme);
}

// A marker travelling the route loop, length-normalized so it moves at a steady
// speed regardless of segment lengths. `phase` offsets each vehicle.
function drawVehicle(ctx, path, phase, theme) {
  let total = 0;
  const segLen = [];
  for (let k = 1; k < path.length; k += 1) {
    const l = Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
    segLen.push(l);
    total += l;
  }
  if (total === 0) return;

  let target = ((phase % 1) + 1) % 1; // 0..1
  target *= total;
  let acc = 0;
  for (let k = 0; k < segLen.length; k += 1) {
    if (acc + segLen[k] >= target) {
      const f = segLen[k] === 0 ? 0 : (target - acc) / segLen[k];
      const x = lerp(path[k].x, path[k + 1].x, f);
      const y = lerp(path[k].y, path[k + 1].y, f);
      ctx.beginPath();
      ctx.fillStyle = theme.inkStroke;
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    acc += segLen[k];
  }
}

function drawDepot(ctx, p, theme) {
  const s = 9;
  ctx.save();
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 20;
  ctx.fillStyle = theme.nodeFill;
  ctx.strokeStyle = theme.inkStroke;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.rect(p.x - s, p.y - s, s * 2, s * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = theme.label;
  ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Depot", p.x, p.y + s + 6);
}

function drawGrid(ctx, width, height, theme) {
  const gap = 34;
  ctx.fillStyle = theme.grid;
  for (let x = gap; x < width; x += gap) {
    for (let y = gap; y < height; y += gap) ctx.fillRect(x, y, 1, 1);
  }
}
