// A calm line of light drifting behind every page. It wanders on its own along a slow path that never quite repeats,
// leans a little toward the pointer while the pointer moves, and takes its colours from the look (--flow-a, --flow-b,
// --flow-c and --flow-alpha in site.css, read again when the look changes). Behind the glass cards it shows blurred.
// With prefers-reduced-motion there is no line at all.

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
if (!reduce.matches) start();

function start() {
  const canvas = Object.assign(document.createElement('canvas'), { className: 'flow' });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;

  const TRAIL = 270;          // points kept behind the head
  const STEP = 3;             // px between two points: the line is about TRAIL * STEP long
  const CHUNK = 10;           // points drawn as one path in one colour (joins inside a path stay clean)
  const FPS = 30;             // it moves slowly, 30 frames a second are plenty

  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

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

  // Where the head is heading: a point moving along sums of slow sine waves at unrelated speeds, so the path covers
  // the whole window and never quite repeats. About 40 px a second on a wide screen.
  const seed = Math.random() * 1000;
  function goal(t) {
    const x = 0.5 + 0.30 * Math.sin(0.071 * t + seed) + 0.14 * Math.sin(0.043 * t + seed * 1.7 + 1.3);
    const y = 0.5 + 0.28 * Math.sin(0.057 * t + seed * 0.6 + 2.1) + 0.13 * Math.sin(0.031 * t + seed * 2.3);
    return [x * W, y * H];
  }

  // The pointer pulls the goal toward itself while it moves, less and less over 3 seconds after it stops.
  let pointer = null, pointerAt = -Infinity;
  addEventListener('pointermove', e => { pointer = [e.clientX, e.clientY]; pointerAt = performance.now(); }, { passive: true });

  resize();
  readColors();
  addEventListener('resize', resize);
  new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  let t = 0, last = performance.now(), lastDraw = 0, born = last, running = true;
  let head = goal(0);
  const trail = [head.slice()];
  reduce.addEventListener('change', () => { if (reduce.matches) { running = false; canvas.remove(); } });

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    const n = trail.length;
    if (n < 2) return;
    const fadeIn = Math.min(1, (now - born) / 2500);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    // A wide faint pass for the glow, then the line itself; each in chunks that fade and change colour toward the head.
    for (const [width, pass] of [[9, 0.14], [1.9, 1]]) {
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
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 14);
    glow.addColorStop(0, `rgba(${r},${g},${b},${(strength * 0.9 * fadeIn).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(hx - 14, hy - 14, 28, 28);
  }

  // One step of the head toward its goal (pulled toward the pointer if it moved lately), adding to the trail.
  function advance(dt, now) {
    t += dt;
    let [gx, gy] = goal(t);
    const since = now - pointerAt;
    if (pointer && since < 3000) {
      const pull = 0.35 * (1 - since / 3000);
      gx += (pointer[0] - gx) * pull; gy += (pointer[1] - gy) * pull;
    }
    const ease = 1 - Math.exp(-dt * 0.9);
    head = [head[0] + (gx - head[0]) * ease, head[1] + (gy - head[1]) * ease];
    const tip = trail[trail.length - 1];
    if (Math.hypot(head[0] - tip[0], head[1] - tip[1]) >= STEP) {
      trail.push(head.slice());
      if (trail.length > TRAIL) trail.shift();
    }
  }

  // Start as if it had been drifting for a while, so the whole line is there from the first frame (it fades in).
  for (let i = 0; i < 40 * FPS; i++) advance(1 / FPS, -Infinity);

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);     // after a hidden tab it simply carries on
    last = now;
    advance(dt, now);
    if (now - lastDraw >= 1000 / FPS) { draw(now); lastDraw = now; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
