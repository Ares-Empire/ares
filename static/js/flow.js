// A calm line of light drifting behind every page, in the look's colours (--flow-a, --flow-b, --flow-c and
// --flow-alpha in site.css, read again when the look changes). It steers toward a goal moving along a slow path that
// never quite repeats: it turns at most 20° a second and never goes slower or faster than a set range, so it draws
// clean arcs and never stops, jerks or spins. It does not react to the pointer (Patrik, 2026-10-26: calm and clean).
//
// A page can keep it beside its content: an element marked data-flow-column (the apps' cards) makes it travel down
// one side and up the other, crossing above and below the window, with a longer trail, whenever there is room beside
// that element. Off with prefers-reduced-motion.

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
if (!reduce.matches) start();

function start() {
  const canvas = Object.assign(document.createElement('canvas'), { className: 'flow' });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  const column = document.querySelector('[data-flow-column]');

  const STEP = 3;             // px between two points of the trail
  const CHUNK = 10;           // points drawn as one path in one colour (joins inside a path stay clean)
  const FPS = 30;             // it moves slowly, 30 frames a second are plenty
  const MAX_TURN = 0.35;      // radians a second (20°): the sharpest it ever turns
  const TURN_GAIN = 0.8;      // how readily it turns toward its goal (per second, up to MAX_TURN)
  const WIDTH = 2.4;          // the line itself; the glow around it is wider and faint
  // Speed range in px a second, a little slower on small screens (38 at most, on a laptop and larger).
  const maxSpeed = () => Math.max(20, Math.min(38, 0.026 * Math.hypot(W, H)));

  // The window, and the room beside the column (null when there is none, or no column).
  let W = 0, H = 0, beside = null;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    beside = null;
    if (column) {
      const r = column.getBoundingClientRect(), gutter = Math.min(r.left, W - r.right);
      if (gutter >= 90) beside = { left: r.left, right: r.right, gutter };
    }
  }
  const trailMax = () => (beside ? 560 : 300);    // about 1700 px beside a column, 900 px otherwise

  // The look's colours: three stops from the tail to the head, and how strong the line is.
  let stops = [[255, 255, 255], [255, 255, 255], [255, 255, 255]], strength = 0.4;
  const rgb = value => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
    const n = m ? parseInt(m[1], 16) : 0xffffff;
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  function readColors() {
    const cs = getComputedStyle(root);
    stops = ['--flow-a', '--flow-b', '--flow-c'].map(name => rgb(cs.getPropertyValue(name)));
    strength = parseFloat(cs.getPropertyValue('--flow-alpha')) || 0.4;
  }
  function colorAt(f) {       // f: 0 at the tail, 1 at the head
    const x = f * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), k = x - i;
    return stops[i].map((c, j) => Math.round(c + (stops[i + 1][j] - c) * k));
  }

  // Where the head is heading.
  const seed = Math.random() * 1000;
  // Anywhere in the window: sums of slow sine waves at unrelated speeds, so the path never quite repeats.
  function wander(t) {
    const x = 0.5 + 0.30 * Math.sin(0.071 * t + seed) + 0.14 * Math.sin(0.043 * t + seed * 1.7 + 1.3);
    const y = 0.5 + 0.28 * Math.sin(0.057 * t + seed * 0.6 + 2.1) + 0.13 * Math.sin(0.031 * t + seed * 2.3);
    return [x * W, y * H];
  }
  // Around the column: a loop that keeps to the room on either side (the cosine flattened, so it stays out there
  // most of the time) and crosses over beyond the top and bottom of the window. About two minutes per loop.
  function around(t) {
    const { left, right, gutter } = beside, a = 0.05 * t + seed, c = Math.cos(a);
    const x = (left + right) / 2 + ((right - left) / 2 + gutter * 0.5) * Math.sign(c) * Math.abs(c) ** 0.4
      + gutter * 0.16 * Math.sin(0.043 * t + seed);
    const y = H * 0.5 + H * 0.66 * Math.sin(a) + H * 0.04 * Math.sin(0.031 * t + seed);
    return [x, y];
  }
  const goal = t => (beside ? around(t) : wander(t));

  resize();
  readColors();
  addEventListener('resize', resize);
  new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // The head keeps a heading and a speed. Each step it turns toward the goal (never more than MAX_TURN) and eases its
  // speed toward one that suits the distance, kept within the range: no stops, no jumps, no sharp turns.
  let t = 0, head = goal(0), speed = maxSpeed() * 0.5;
  let heading = (([gx, gy]) => Math.atan2(gy - head[1], gx - head[0]))(goal(1));
  const trail = [head.slice()];
  function advance(dt) {
    t += dt;
    const [gx, gy] = goal(t), dx = gx - head[0], dy = gy - head[1], d = Math.hypot(dx, dy);
    let diff = Math.atan2(dy, dx) - heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    heading += Math.max(-MAX_TURN, Math.min(MAX_TURN, diff * TURN_GAIN)) * dt;
    const top = maxSpeed(), target = Math.max(top * 0.37, Math.min(top, d * 0.5));
    speed += (target - speed) * (1 - Math.exp(-dt * 0.5));
    head = [head[0] + Math.cos(heading) * speed * dt, head[1] + Math.sin(heading) * speed * dt];
    const tip = trail[trail.length - 1];
    if (Math.hypot(head[0] - tip[0], head[1] - tip[1]) >= STEP) {
      trail.push(head.slice());
      while (trail.length > trailMax()) trail.shift();
    }
  }
  // Start as if it had been drifting for a while, so the whole line is there from the first frame (it fades in).
  for (let i = 0; i < 90 * FPS; i++) advance(1 / FPS);

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    const n = trail.length;
    if (n < 2) return;
    const fadeIn = Math.min(1, (now - born) / 2500);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    // A wide faint pass for the glow, then the line itself; each in chunks that fade and change colour toward the head.
    for (const [width, pass] of [[WIDTH * 4.2, 0.14], [WIDTH, 1]]) {
      ctx.lineWidth = width;
      for (let i = 0; i < n - 1; i += CHUNK) {
        const end = Math.min(n - 1, i + CHUNK), f = end / (n - 1), [r, g, b] = colorAt(f);
        ctx.strokeStyle = `rgba(${r},${g},${b},${(strength * pass * fadeIn * f ** 1.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(trail[i][0], trail[i][1]);
        for (let k = i + 1; k <= end; k++) ctx.lineTo(trail[k][0], trail[k][1]);
        ctx.stroke();
      }
    }
    // A soft light at the head.
    const [r, g, b] = colorAt(1), [hx, hy] = trail[n - 1];
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 15);
    glow.addColorStop(0, `rgba(${r},${g},${b},${(strength * 0.9 * fadeIn).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(hx - 15, hy - 15, 30, 30);
  }

  let last = performance.now(), lastDraw = 0, running = true;
  const born = last;
  reduce.addEventListener('change', () => { if (reduce.matches) { running = false; canvas.remove(); } });
  function frame(now) {
    if (!running) return;
    advance(Math.min(0.05, (now - last) / 1000));      // after a hidden tab it simply carries on
    last = now;
    if (now - lastDraw >= 1000 / FPS) { draw(now); lastDraw = now; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
