/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const svg = $("#svg"), panel = $("#panel"), body = $("#panelBody"), stage = $("#stage"), tip = $("#tip");
let current = "main", selected = null;
const geo = {}; // node boxes

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fn = s => esc(s).replace(/\{(\d+)\}/g, (_, n) => `<sup><a href="#src-${n}" data-src="${n}">${n}</a></sup>`);
const plain = s => s.replace(/\{\d+\}/g, "");
function paras(list) {
  return list.map(p => p.startsWith("> ") ? `<blockquote>“${fn(p.slice(2)).replace(/(<sup>)/, "”$1")}</blockquote>` : `<p>${fn(p)}</p>`).join("")
    .replace(/”<\/blockquote>/g, "</blockquote>");
}
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const qpt = (p0, p1, p2, t) => lerp(lerp(p0, p1, t), lerp(p1, p2, t), t);
const inBox = (p, b, pad) => Math.abs(p.x - b.x) <= b.w / 2 + pad && Math.abs(p.y - b.y) <= b.h / 2 + pad;

/* ---------- Draw ---------- */
const narrow = matchMedia("(width < 640px)");
function draw() {
  const M = MAPS[current], mob = narrow.matches;
  for (const n of Object.values(M.nodes)) { [n.x, n.y] = mob ? n.m : (n.d ||= [n.x, n.y]); }
  for (const l of M.loops) { l.d ||= [l.x, l.y, l.dir]; [l.x, l.y, l.dir] = mob ? [...l.m, l.mdir] : l.d; }
  svg.innerHTML = "";
  svg.setAttribute("aria-label", M.title);
  svg.setAttribute("viewBox", mob ? M.mViewBox : M.viewBox);
  const defs = el("defs", {}, svg);
  ["r1", "r2", "r3"].forEach(id => {
    const m = el("marker", { id: "ah-" + id, viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" }, defs);
    m.setAttribute("markerWidth", "16"); m.setAttribute("markerHeight", "16");
    el("path", { d: "M0,0 L10,5 L0,10 z", style: `fill:${LOOPCOLOR[id]}` }, m);
  });

  // node geometry
  for (const [id, n] of Object.entries(M.nodes)) {
    const cw = n.hub ? 9.6 : 8.2;
    const w = Math.max(...n.label.map(l => l.length)) * cw + (n.hub ? 44 : 34);
    const h = n.label.length * (n.hub ? 22 : 20) + (n.hub ? 30 : 22);
    geo[id] = { x: n.x, y: n.y, w, h };
  }

  const gEdges = el("g", {}, svg), gLoops = el("g", {}, svg), gNodes = el("g", {}, svg);

  // edges
  M.edges.forEach(e => {
    const a = geo[e.from], b = geo[e.to], loop = M.loops.find(l => l.id === e.loop);
    const p0 = { x: a.x, y: a.y }, p2 = { x: b.x, y: b.y };
    const mid = lerp(p0, p2, 0.5), dx = p2.x - p0.x, dy = p2.y - p0.y, len = Math.hypot(dx, dy);
    let nx = -dy / len, ny = dx / len;
    if ((mid.x - loop.x) * nx + (mid.y - loop.y) * ny < 0) { nx = -nx; ny = -ny; }
    const bend = len * 0.2;
    const p1 = { x: mid.x + nx * bend, y: mid.y + ny * bend };
    let t0 = 0, t1 = 1;
    for (let t = 0; t <= 1; t += 0.005) if (inBox(qpt(p0, p1, p2, t), a, 8)) t0 = t;
    for (let t = 1; t >= 0; t -= 0.005) if (inBox(qpt(p0, p1, p2, t), b, 12)) t1 = t;
    const s = qpt(p0, p1, p2, t0), f = qpt(p0, p1, p2, t1);
    // sub-curve control point (blossom)
    const c = {
      x: (1 - t0) * (1 - t1) * p0.x + ((1 - t0) * t1 + t0 * (1 - t1)) * p1.x + t0 * t1 * p2.x,
      y: (1 - t0) * (1 - t1) * p0.y + ((1 - t0) * t1 + t0 * (1 - t1)) * p1.y + t0 * t1 * p2.y
    };
    const d = `M${s.x},${s.y} Q${c.x},${c.y} ${f.x},${f.y}`;
    const col = LOOPCOLOR[e.loop];
    const g = el("g", { class: `edge dimmable ${e.solid ? "" : "dotted"}`, tabindex: "0", role: "button", "data-id": e.id,
      "aria-label": `${M.nodes[e.from].name} ${e.sign === "+" ? "increases" : "decreases"} ${M.nodes[e.to].name}. ${plain(e.claim)}` }, gEdges);
    el("path", { class: "hit", d }, g);
    el("path", { class: "vis", d, style: `stroke:${col}`, "marker-end": `url(#ah-${e.loop})` }, g);
    const sp = qpt(s, c, f, 0.72);
    const sg = el("g", { class: "sign" }, g);
    el("circle", { cx: sp.x + nx * 18, cy: sp.y + ny * 18, r: 12, style: `stroke:${col}` }, sg);
    const tx = el("text", { x: sp.x + nx * 18, y: sp.y + ny * 18 + 1, style: `fill:${col}` }, sg);
    tx.textContent = e.sign === "+" ? "+" : "−";
  });

  // loop markers
  M.loops.forEach(l => {
    const col = LOOPCOLOR[l.id];
    const g = el("g", { class: "loopmark dimmable", tabindex: "0", role: "button", "data-loop": l.id, "aria-label": `${l.name} loop: read the story` }, gLoops);
    el("circle", { class: "hitc", cx: l.x, cy: l.y, r: 46 }, g);
    const r = 27, a0 = l.dir > 0 ? -60 : 240, a1 = l.dir > 0 ? 230 : -50;
    const pt = a => ({ x: l.x + r * Math.cos(a * Math.PI / 180), y: l.y - 8 + r * Math.sin(a * Math.PI / 180) });
    const ps = pt(a0), pe = pt(a1);
    el("path", { d: `M${ps.x},${ps.y} A${r},${r} 0 1 ${l.dir > 0 ? 1 : 0} ${pe.x},${pe.y}`, fill: "none", style: `stroke:${col}`, "stroke-width": 2, "marker-end": `url(#ah-${l.id})` }, g);
    const t = el("text", { class: "lid", x: l.x, y: l.y - 8, style: `fill:${col}` }, g);
    t.textContent = "R" + (l.id === "r3" ? "" : l.id.slice(1));
    const n = el("text", { class: "lname", x: l.x, y: l.y + 38 }, g);
    n.textContent = l.name;
  });

  // nodes
  for (const [id, n] of Object.entries(M.nodes)) {
    const b = geo[id];
    const g = el("g", { class: `node dimmable ${n.hub ? "hub" : ""}`, tabindex: "0", role: "button", "data-node": id, "aria-label": `${n.name}: see details` }, gNodes);
    el("rect", { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h, rx: n.hub ? 18 : 12 }, g);
    const lh = n.hub ? 22 : 20;
    n.label.forEach((line, i) => {
      const t = el("text", { x: b.x, y: b.y + (i - (n.label.length - 1) / 2) * lh + 1 }, g);
      t.textContent = line;
    });
  }
  buildEvidenceList();
}

/* ---------- Selection & panel ---------- */
function highlight(ids) {
  svg.classList.toggle("has-sel", !!ids);
  svg.querySelectorAll(".dimmable").forEach(x => x.classList.remove("on", "sel"));
  if (!ids) return;
  ids.forEach(sel => svg.querySelectorAll(sel).forEach(x => x.classList.add("on")));
}

function open(html, c) {
  body.innerHTML = html;
  panel.style.setProperty("--c", c);
  panel.hidden = false;
  stage.classList.add("open");
  $("#hint").style.visibility = "hidden";
  panel.scrollTop = 0;
}
function closePanel() {
  panel.hidden = true; stage.classList.remove("open"); selected = null; highlight(null);
  $("#hint").style.visibility = "";
}

const loopLabel = id => { const l = MAPS[current].loops.find(x => x.id === id); return l ? l.name.toLowerCase() + " loop" : "both loops"; };

function showEdge(id) {
  const M = MAPS[current], e = M.edges.find(x => x.id === id), loop = M.loops.find(l => l.id === e.loop);
  const i = loop.order.indexOf(id), A = M.nodes[e.from], B = M.nodes[e.to];
  selected = { type: "edge", id };
  highlight([`[data-id="${id}"]`, `[data-node="${e.from}"]`, `[data-node="${e.to}"]`]);
  svg.querySelector(`[data-id="${id}"]`).classList.add("sel");
  const col = LOOPCOLOR[e.loop];
  open(`
    <p class="kicker" style="--c:${col}"><i></i>${loop.name} loop, step ${i + 1} of ${loop.order.length}</p>
    <h2>${fn(e.claim)}</h2>
    <p class="rule">More <b>${A.short}</b> means ${e.sign === "+" ? "more" : "less"} <b>${B.short}</b>.</p>
    <h3>What the research found</h3>
    <div class="found">${paras(e.found)}</div>
    <p class="how">How we know: <span class="tag ${e.how[0]}">${e.how[1]}</span></p>
    <h3>Keep in mind</h3>
    <p class="caveat">${fn(e.caveat)}</p>
    <nav class="pnav" aria-label="Walk the loop">
      <button type="button" data-go="${loop.order[i - 1] || ""}" ${i ? "" : "disabled"}>Previous step</button>
      <button type="button" data-go="${loop.order[(i + 1) % loop.order.length]}">${i === loop.order.length - 1 ? "Back to start" : "Next step"}</button>
    </nav>`, col);
}

function showNode(id) {
  const M = MAPS[current], n = M.nodes[id];
  selected = { type: "node", id };
  const touching = M.edges.filter(e => e.from === id || e.to === id);
  highlight([`[data-node="${id}"]`, ...touching.map(e => `[data-id="${e.id}"]`), ...touching.map(e => `[data-node="${e.from === id ? e.to : e.from}"]`)]);
  svg.querySelector(`[data-node="${id}"]`).classList.add("sel");
  const col = LOOPCOLOR[n.loop];
  let bars = "";
  if (n.bars) bars = `<div class="bars">${n.bars.map(([l, v, s]) => `<div class="bar"><span>${l}${fn(s)}</span><span><i style="--w:${v / n.barMax * 100}%"></i></span><span>${v}${n.unit}</span></div>`).join("")}</div>`;
  open(`
    <p class="kicker" style="--c:${col}"><i></i>${n.loop === "both" ? "Factor in both loops" : "Factor in the " + loopLabel(n.loop)}</p>
    <h2>${n.name}</h2>
    <p>${fn(n.means)}</p>
    ${n.hubNote ? `<p class="rule">${n.hubNote}</p>` : ""}
    <h3>What the numbers say</h3>
    ${n.stat ? `<div class="stat"><strong>${n.stat.big}</strong><p>${fn(n.stat.text)}</p></div>` : `<p class="caveat">${n.statNote}</p>`}
    ${bars}
    ${n.extra ? `<p>${fn(n.extra)}</p>` : ""}
    ${n.caveat ? `<h3>Keep in mind</h3><p class="caveat">${fn(n.caveat)}</p>` : ""}
    <h3>Arrows in and out</h3>
    <ul class="links">${touching.map(e => `<li><button type="button" data-go="${e.id}">${e.sign === "+" ? "+" : "−"}&ensp;${plain(e.claim)}</button></li>`).join("")}</ul>`, col);
}

function showLoop(id) {
  const M = MAPS[current], l = M.loops.find(x => x.id === id);
  selected = { type: "loop", id };
  const es = M.edges.filter(e => e.loop === id);
  highlight([`[data-loop="${id}"]`, ...es.map(e => `[data-id="${e.id}"]`), ...es.map(e => `[data-node="${e.from}"]`)]);
  const col = LOOPCOLOR[id];
  open(`
    <p class="kicker" style="--c:${col}"><i></i>A loop that feeds itself</p>
    <h2>The ${l.name.toLowerCase()} loop</h2>
    <div class="found">${paras(l.story)}</div>
    <nav class="pnav"><span></span><button type="button" data-go="${l.order[0]}">Walk through it, step by step</button></nav>`, col);
}

/* ---------- Evidence list (layer 3, also used for print) ---------- */
function buildEvidenceList() {
  const out = [];
  for (const [key, M] of Object.entries(MAPS)) {
    M.loops.forEach(l => {
      out.push(`<h3 style="--c:${LOOPCOLOR[l.id]}"><i></i>${key === "bedia" ? "Bedia households: " : ""}${l.name} loop</h3><p>${fn(l.story[0])}</p>`);
      l.order.forEach((eid, i) => {
        const e = M.edges.find(x => x.id === eid);
        out.push(`<div class="ev" style="--c:${LOOPCOLOR[l.id]}"><h4>${i + 1}. ${fn(e.claim)}</h4>${paras(e.found)}<p class="how">How we know: <span class="tag ${e.how[0]}">${e.how[1]}</span></p><p class="caveat"><b>Keep in mind:</b> ${fn(e.caveat)}</p></div>`);
      });
    });
  }
  $("#evList").innerHTML = out.join("");
}

/* ---------- Events ---------- */
function activate(t) {
  const g = t.closest(".edge, .node, .loopmark");
  if (!g) return;
  hideTip();
  if (g.dataset.id) showEdge(g.dataset.id);
  else if (g.dataset.node) showNode(g.dataset.node);
  else showLoop(g.dataset.loop);
}
svg.addEventListener("click", e => { if (e.target.closest(".edge, .node, .loopmark")) activate(e.target); else if (selected) closePanel(); });
svg.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.closest(".edge, .node, .loopmark")) { e.preventDefault(); activate(e.target); } });
panel.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go && go.dataset.go) { showEdge(go.dataset.go); return; }
  if (e.target.closest(".close")) closePanel();
});
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-src]");
  if (a) { $("#sources").open = true; }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) closePanel(); });

document.querySelectorAll(".switch button").forEach(b => b.addEventListener("click", () => {
  current = b.dataset.map;
  document.querySelectorAll(".switch button").forEach(x => x.setAttribute("aria-pressed", x === b));
  $("#title").textContent = MAPS[current].title;
  $("#subtitle").textContent = MAPS[current].subtitle;
  $("#bediaNote").hidden = current !== "bedia";
  closePanel(); draw();
}));

/* Hover tooltip: one-line preview */
const hoverable = matchMedia("(hover: hover) and (pointer: fine)");
function hideTip() { tip.classList.remove("show"); }
svg.addEventListener("pointermove", e => {
  if (!hoverable.matches) return;
  const g = e.target.closest(".edge, .node, .loopmark");
  if (!g) return hideTip();
  const M = MAPS[current];
  let text;
  if (g.dataset.id) text = plain(M.edges.find(x => x.id === g.dataset.id).claim);
  else if (g.dataset.node) text = M.nodes[g.dataset.node].name;
  else text = `The ${M.loops.find(x => x.id === g.dataset.loop).name.toLowerCase()} loop`;
  tip.innerHTML = `${esc(text)}<small>Click for the evidence</small>`;
  const x = Math.min(e.clientX + 16, innerWidth - tip.offsetWidth - 10);
  tip.style.left = x + "px"; tip.style.top = (e.clientY + 18) + "px";
  tip.classList.add("show");
});
svg.addEventListener("pointerleave", hideTip);

/* Sources */
$("#srcList").innerHTML = SOURCES.map(([n, t, u, note]) =>
  `<li id="src-${n}">${u ? `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}${note ? `<small>${esc(note)}</small>` : ""}</li>`).join("");

narrow.addEventListener("change", () => {
  const sel = selected; draw();
  if (sel) ({ edge: showEdge, node: showNode, loop: showLoop })[sel.type](sel.id);
});

window.addEventListener("beforeprint", () => document.querySelectorAll("details").forEach(d => d.open = true));

draw();
/* Deep links for testing / sharing, e.g. #e1, #n-C, #bedia */
(function () {
  const h = location.hash.slice(1);
  if (!h) return;
  if (h.startsWith("bedia")) document.querySelector('[data-map="bedia"]').click();
  const k = h.replace(/^bedia-?/, "");
  if (!k) return;
  if (k.startsWith("n-")) showNode(k.slice(2));
  else if (k.startsWith("r")) showLoop(k);
  else showEdge(k);
})();
