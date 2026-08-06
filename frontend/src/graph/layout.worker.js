/**
 * Web Worker running d3-force simulation off the main thread.
 *
 * Receives graph topology from the main thread and posts position
 * snapshots at ~33ms intervals (30 fps) to keep rendering smooth.
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force';

const TICK_BATCH = 200;    // warm-up ticks on init
const TICK_INTERVAL = 33;  // ms between position snapshots

let sim = null;
let tickTimer = null;
let nodes = [];
let edges = [];

function init({ nodes: incomingNodes, edges: incomingEdges, width, height }) {
  stop();

  nodes = incomingNodes.map((n) => ({ ...n }));
  edges = incomingEdges.map((e) => ({
    ...e,
    source: typeof e.source === 'object' ? e.source.id : e.source,
    target: typeof e.target === 'object' ? e.target.id : e.target,
  }));

  sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink(edges)
        .id((d) => d.id)
        .distance(96)
        .strength(0.5)
    )
    .force('charge', forceManyBody().strength(-170))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collision', forceCollide(58))
    .stop();

  // Warm up: advance many ticks
  for (let i = 0; i < TICK_BATCH; i++) {
    sim.tick();
    clampNodes(width, height);
  }

  postPositions();

  // Start periodic updates
  tickTimer = setInterval(() => {
    if (!sim) return;
    sim.tick();
    clampNodes(width, height);
    postPositions();
  }, TICK_INTERVAL);
}

function stop() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (sim) {
    sim.stop();
    sim = null;
  }
}

function clampNodes(w, h) {
  for (const n of nodes) {
    if (n.fx == null) {
      n.x = Math.max(40, Math.min(w - 40, n.x));
      n.y = Math.max(40, Math.min(h - 40, n.y));
    }
  }
}

function postPositions() {
  const positions = nodes.map((n) => [n.id, { x: n.x, y: n.y }]);
  self.postMessage({ type: 'tick', positions });
}

function dragNode(nodeId, x, y) {
  if (!sim) return;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return;
  node.fx = x;
  node.fy = y;
  sim.alphaTarget(0.3).restart();
}

function releaseNode(nodeId) {
  if (!sim) return;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return;
  node.fx = null;
  node.fy = null;
  sim.alphaTarget(0);
}

function warmStart() {
  if (!sim) return;
  sim.alphaTarget(0.3).restart();
}

self.onmessage = (event) => {
  const { type, ...payload } = event.data || {};
  switch (type) {
    case 'init':
      init(payload);
      break;
    case 'drag':
      dragNode(payload.nodeId, payload.x, payload.y);
      break;
    case 'release':
      releaseNode(payload.nodeId);
      break;
    case 'warm':
      warmStart();
      break;
    case 'stop':
      stop();
      break;
  }
};
