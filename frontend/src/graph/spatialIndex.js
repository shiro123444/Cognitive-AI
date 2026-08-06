/** O(log n) spatial index for graph nodes using d3-quadtree. */

import { quadtree } from 'd3-quadtree';

export class SpatialIndex {
  constructor() {
    this.tree = null;
    this.nodes = [];
    this.byId = new Map();
  }

  build(nodes) {
    this.nodes = nodes;
    this.byId.clear();
    for (const node of nodes) {
      this.byId.set(node.id, node);
    }
    this.tree = quadtree()
      .x((d) => d.x)
      .y((d) => d.y)
      .addAll(nodes);
  }

  /** Find the closest node to (x, y) within search radius. */
  find(x, y, radius = 24) {
    if (!this.tree) return null;
    return this.tree.find(x, y, radius);
  }

  /** Return all nodes within radius of (x, y). */
  findInRadius(x, y, radius) {
    if (!this.tree) return [];
    const results = [];
    this.tree.visit((node, x0, y0, x1, y1) => {
      if (node.length) {
        // internal node — check if quadrant overlaps search circle
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const hw = (x1 - x0) / 2;
        const hh = (y1 - y0) / 2;
        const dx = Math.abs(x - cx) - hw;
        const dy = Math.abs(y - cy) - hh;
        if (dx < radius && dy < radius && dx * dx + dy * dy < radius * radius) {
          return false; // descend
        }
        return true; // skip this quadrant
      }
      // leaf node
      const leaf = node.data;
      if (!leaf) return true;
      const dx = leaf.x - x;
      const dy = leaf.y - y;
      if (dx * dx + dy * dy <= radius * radius) {
        results.push(leaf);
      }
      return true;
    });
    return results;
  }

  /** Return nodes whose bbox overlaps the given viewport with padding. */
  queryViewport(x, y, w, h, pad = 50) {
    if (!this.tree) return this.nodes;
    const results = [];
    const x0 = x - pad;
    const y0 = y - pad;
    const x1 = x + w + pad;
    const y1 = y + h + pad;
    this.tree.visit((node, nx0, ny0, nx1, ny1) => {
      // quadrant does not overlap viewport → skip
      if (nx1 < x0 || nx0 > x1 || ny1 < y0 || ny0 > y1) return true;
      if (!node.length) {
        const leaf = node.data;
        if (leaf) results.push(leaf);
      }
      return false; // descend
    });
    return results;
  }

  get(id) {
    return this.byId.get(id);
  }
}
