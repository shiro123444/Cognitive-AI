/**
 * Canvas 2D renderer for large knowledge graphs.
 *
 * Replaces SVG DOM rendering with direct Canvas draw calls,
 * supporting viewport culling and level-of-detail for 10k+ nodes.
 */

import { SpatialIndex } from './spatialIndex';

const LOD = {
  /** Heatmap / density mode — no individual nodes rendered. */
  DOTS: 'dots',
  /** Simplified: small circles, no labels. */
  SIMPLE: 'simple',
  /** Full: circles + truncated labels. */
  FULL: 'full',
};

/** Thresholds are in screen-space pixels-per-logical-unit. */
function lodLevel(scale) {
  if (scale < 0.35) return LOD.DOTS;
  if (scale < 0.75) return LOD.SIMPLE;
  return LOD.FULL;
}

export class CanvasRenderer {
  constructor(canvasEl, { width = 800, height = 600, nodeRadius = 10, onSelectNode, onSelectEdge } = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.width = width;
    this.height = height;
    this.nodeRadius = nodeRadius;
    this.onSelectNode = onSelectNode || (() => {});
    this.onSelectEdge = onSelectEdge || (() => {});

    this.graph = { nodes: [], edges: [] };
    this.index = new SpatialIndex();
    this.transform = { x: 0, y: 0, k: 1 };

    // Interaction state
    this.hoverNode = null;
    this.hoverEdge = null;
    this.selectedNodeId = null;
    this.dragging = null;

    this._bound = false;
    this._animFrame = 0;
    this._needsRedraw = true;
  }

  // ---- public API ----

  setGraph(graph) {
    this.graph = graph;
    this._rebuildIndex();
    this._needsRedraw = true;
  }

  updatePositions(positions) {
    const byId = this.index.byId;
    for (const [id, pos] of positions) {
      const node = byId.get(id);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }
    this._rebuildIndex();
    this._needsRedraw = true;
  }

  setTransform(tx, ty, scale) {
    this.transform = { x: tx, y: ty, k: scale };
    this._needsRedraw = true;
  }

  requestDraw() {
    this._needsRedraw = true;
    if (!this._animFrame) {
      this._animFrame = requestAnimationFrame(() => this._draw());
    }
  }

  /** Screen coords → graph coords. */
  screenToGraph(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = sx - rect.left;
    const my = sy - rect.top;
    return {
      x: (mx - this.transform.x) / this.transform.k,
      y: (my - this.transform.y) / this.transform.k,
    };
  }

  /** Find node at screen position. Returns the node or null. */
  hitTestNode(sx, sy) {
    const pos = this.screenToGraph(sx, sy);
    const radius = (this.nodeRadius + 8) / this.transform.k;
    return this.index.find(pos.x, pos.y, radius) || null;
  }

  /** Find edge near screen position. Returns the edge or null. */
  hitTestEdge(sx, sy) {
    const pos = this.screenToGraph(sx, sy);
    const threshold = 10 / this.transform.k;
    const nodes = this.index.byId;
    for (const edge of this.graph.edges) {
      const srcNode = typeof edge.source === 'object' ? edge.source : nodes.get(edge.source);
      const tgtNode = typeof edge.target === 'object' ? edge.target : nodes.get(edge.target);
      if (!srcNode || !tgtNode) continue;
      if (this._pointToSegmentDist(pos.x, pos.y, srcNode.x, srcNode.y, tgtNode.x, tgtNode.y) < threshold) {
        return edge;
      }
    }
    return null;
  }

  destroy() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = 0;
    }
  }

  // ---- internal ----

  _rebuildIndex() {
    this.index.build(this.graph.nodes);
  }

  _draw() {
    this._animFrame = 0;
    this._needsRedraw = false;

    const ctx = this.ctx;
    const { nodes, edges } = this.graph;
    const { x: tx, y: ty, k } = this.transform;
    const level = lodLevel(k);

    // Clear
    ctx.clearRect(0, 0, this.width, this.height);

    if (!nodes.length) return;

    // Viewport in graph coordinates
    const vpLeft = -tx / k;
    const vpTop = -ty / k;
    const vpRight = (this.width - tx) / k;
    const vpBottom = (this.height - ty) / k;
    const pad = 80 / k;

    const visibleNodes = this.index.queryViewport(vpLeft, vpTop, vpRight - vpLeft, vpBottom - vpTop, pad);
    const visibleIds = new Set(visibleNodes.map((n) => n.id));

    // Edges
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = level === LOD.DOTS ? 0.3 : level === LOD.SIMPLE ? 0.6 : 1.0;
    for (const edge of edges) {
      const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      const srcNode = this.index.get(srcId);
      const tgtNode = this.index.get(tgtId);
      if (!srcNode || !tgtNode) continue;
      if (!visibleIds.has(srcId) && !visibleIds.has(tgtId)) continue;

      ctx.moveTo(srcNode.x * k + tx, srcNode.y * k + ty);
      ctx.lineTo(tgtNode.x * k + tx, tgtNode.y * k + ty);
    }
    ctx.stroke();
    ctx.restore();

    // Nodes
    if (level === LOD.DOTS) {
      this._drawDots(visibleNodes, k, tx, ty);
    } else if (level === LOD.SIMPLE) {
      this._drawSimple(visibleNodes, k, tx, ty);
    } else {
      this._drawFull(visibleNodes, k, tx, ty);
    }
  }

  _drawDots(nodes, k, tx, ty) {
    const ctx = this.ctx;
    const r = Math.max(1.5, 3 * k);
    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x * k + tx, node.y * k + ty, r, 0, Math.PI * 2);
      ctx.fillStyle = this._nodeColor(node);
      ctx.fill();
    }
  }

  _drawSimple(nodes, k, tx, ty) {
    const ctx = this.ctx;
    const r = Math.max(3, 7 * k);
    for (const node of nodes) {
      const sx = node.x * k + tx;
      const sy = node.y * k + ty;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = this._nodeColor(node);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  _drawFull(nodes, k, tx, ty) {
    const ctx = this.ctx;
    const r = Math.max(6, this.nodeRadius * k);
    const fontSize = Math.max(8, 10 * k);

    for (const node of nodes) {
      const sx = node.x * k + tx;
      const sy = node.y * k + ty;
      const isSelected = node.id === this.selectedNodeId;

      // Halo (selected)
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 34, 255, 0.1)';
        ctx.fill();
      }

      // Core circle
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#0022ff' : this._nodeColor(node);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      const label = (node.label || node.name || node.id || '').slice(0, 8);
      if (label) {
        ctx.font = `${fontSize}px var(--font-mono, monospace)`;
        ctx.fillStyle = '#20242d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // Text outline for readability
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(label, sx, sy + r + 3);
        ctx.fillText(label, sx, sy + r + 3);
      }
    }
  }

  _nodeColor(node) {
    const colors = {
      Course: '#4a6cf7',
      Department: '#22c55e',
      Teacher: '#f59e0b',
      Student: '#ec4899',
      School: '#8b5cf6',
      Outcome: '#0022ff',
      Signal: '#6366f1',
      Evidence: '#14b8a6',
      Assessment: '#f97316',
      Artifact: '#ef4444',
    };
    return colors[node.type] || '#64748b';
  }

  /** Distance from point (px,py) to segment (ax,ay)→(bx,by). */
  _pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
}
