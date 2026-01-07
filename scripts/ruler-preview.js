/**
 * SharedControl Ruler Preview Handler
 * Manages TokenRuler integration via simulated drag workflow
 */

import * as utils from './utils.js';
import { debugLog, lineSegmentsIntersect } from './utils.js';

// Constants for A* pathfinding
const DIAGONAL_COST = 1.41; // √2 ≈ 1.414
const MAX_PATHFINDING_ITERATIONS = 5000; // Prevent infinite loops on large maps

export class RulerPreview {
  constructor() {
    this.activeToken = null;
    this.targetDestination = null;
    this.simulatedDragActive = false;
    this.graphics = null; // PIXI.Graphics for drawing path
    this.distanceText = null; // PIXI.Text for displaying distance
    this.currentPath = []; // Store the current grid path for movement
    this.debugGraphics = null; // PIXI.Graphics for debug visualization
    this.selectionGraphics = null; // PIXI.Graphics for token selection highlight
    this.selectionAnimation = null; // Animation frame ID for pulsing effect
  }

  /**
   * Show selection highlight around a token
   * @param {Token} token - The token to highlight
   */
  showSelectionHighlight(token) {
    this.clearSelectionHighlight();

    if (!token) return;

    // Create graphics for selection highlight
    this.selectionGraphics = new PIXI.Graphics();
    canvas.controls.addChild(this.selectionGraphics);

    // Store token reference for animation
    this._highlightedToken = token;

    // Start pulsing animation
    let pulsePhase = 0;
    const animate = () => {
      // Safety checks to prevent memory leaks if token is destroyed
      if (!this.selectionGraphics || !this._highlightedToken) return;
      if (this._highlightedToken.destroyed || !this._highlightedToken.scene) {
        this.clearSelectionHighlight();
        return;
      }

      this.selectionGraphics.clear();

      // Get token bounds
      const tokenX = this._highlightedToken.x;
      const tokenY = this._highlightedToken.y;
      const tokenW = this._highlightedToken.w || this._highlightedToken.width;
      const tokenH = this._highlightedToken.h || this._highlightedToken.height;

      // Calculate pulse effect (oscillates between 0.6 and 1.0)
      pulsePhase += 0.05;
      const pulse = 0.8 + 0.2 * Math.sin(pulsePhase);
      const glowSize = 8 + 4 * Math.sin(pulsePhase);

      // Draw outer glow
      this.selectionGraphics.lineStyle(glowSize, 0x00FFFF, 0.3 * pulse);
      this.selectionGraphics.drawRoundedRect(
        tokenX - glowSize/2,
        tokenY - glowSize/2,
        tokenW + glowSize,
        tokenH + glowSize,
        8
      );

      // Draw inner border
      this.selectionGraphics.lineStyle(3, 0x00FFFF, 0.8 * pulse);
      this.selectionGraphics.drawRoundedRect(tokenX - 2, tokenY - 2, tokenW + 4, tokenH + 4, 4);

      this.selectionAnimation = requestAnimationFrame(animate);
    };

    animate();
    debugLog('Selection highlight shown for', token.name);
  }

  /**
   * Clear selection highlight
   */
  clearSelectionHighlight() {
    if (this.selectionAnimation) {
      cancelAnimationFrame(this.selectionAnimation);
      this.selectionAnimation = null;
    }

    if (this.selectionGraphics) {
      this.selectionGraphics.destroy();
      this.selectionGraphics = null;
    }

    this._highlightedToken = null;
  }

  /**
   * Toggle debug visualization showing blocked cells and walls
   * Call from console: game.sharedControl.rulerPreview.toggleDebugView()
   */
  toggleDebugView() {
    if (this.debugGraphics) {
      this.clearDebugView();
      ui.notifications.info('SharedControl: Debug view disabled');
      return;
    }

    this.showDebugView();
    ui.notifications.info('SharedControl: Debug view enabled - red = blocked, green = passable');
  }

  /**
   * Show debug visualization of blocked/passable cells
   */
  showDebugView() {
    if (!canvas.grid) return;

    // Create debug graphics layer
    this.debugGraphics = new PIXI.Graphics();
    canvas.controls.addChild(this.debugGraphics);

    const gridSize = canvas.grid.size;
    const bounds = this.getSceneBounds();

    if (!bounds) {
      console.warn('SharedControl: Could not get scene bounds');
      return;
    }

    debugLog('Drawing debug view, bounds:', bounds);

    // Calculate grid range using Foundry's grid API for proper alignment
    const startOffset = canvas.grid.getOffset({ x: bounds.x, y: bounds.y });
    const endOffset = canvas.grid.getOffset({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });

    const startI = startOffset.i;
    const startJ = startOffset.j;
    const endI = endOffset.i;
    const endJ = endOffset.j;

    debugLog('Grid range:', { startI, startJ, endI, endJ });

    let outOfBoundsCount = 0;
    let passableCount = 0;

    // First pass: draw all cells as green (passable) or gray (out of bounds)
    for (let i = startI; i <= endI; i++) {
      for (let j = startJ; j <= endJ; j++) {
        const offset = { i, j };
        const topLeft = canvas.grid.getTopLeftPoint(offset);

        // Use the same 50% bounds check as pathfinding
        if (!this.isGridOffsetWithinBounds(offset)) {
          // Out of bounds (less than 50% in scene) - draw gray
          this.debugGraphics.beginFill(0x888888, 0.3);
          this.debugGraphics.drawRect(topLeft.x, topLeft.y, gridSize, gridSize);
          this.debugGraphics.endFill();
          outOfBoundsCount++;
        } else {
          // In bounds (at least 50% in scene) - draw green
          this.debugGraphics.beginFill(0x00FF00, 0.2);
          this.debugGraphics.drawRect(topLeft.x + 2, topLeft.y + 2, gridSize - 4, gridSize - 4);
          this.debugGraphics.endFill();
          passableCount++;
        }
      }
    }

    // Draw walls on top (these are what actually block movement)
    this.debugGraphics.lineStyle(4, 0x0000FF, 1);
    const walls = canvas.walls?.placeables || [];
    for (const wall of walls) {
      const doc = wall.document || wall;
      const moveType = doc.move;
      if (moveType === CONST.WALL_MOVEMENT_TYPES.NONE) continue;
      if (doc.ds === CONST.WALL_DOOR_STATES.OPEN) continue;

      const c = doc.c;
      if (!c || c.length < 4) continue;

      this.debugGraphics.moveTo(c[0], c[1]);
      this.debugGraphics.lineTo(c[2], c[3]);
    }

    console.log(`SharedControl Debug: ${passableCount} in-bounds cells, ${outOfBoundsCount} out-of-bounds cells`);
    console.log('Blue lines = walls that block movement between cells');
  }

  /**
   * Clear debug visualization
   */
  clearDebugView() {
    if (this.debugGraphics) {
      this.debugGraphics.destroy();
      this.debugGraphics = null;
    }
  }

  /**
   * Show movement preview by simulating a drag workflow
   * @param {Token} token - The token to preview movement for
   * @param {Object} destination - Destination position {x, y}
   */
  async showPreview(token, destination) {
    debugLog('RulerPreview.showPreview called', { token: token?.name, destination });

    if (!token || !destination) {
      console.warn('SharedControl: Missing token or destination');
      return;
    }

    this.activeToken = token;
    this.targetDestination = destination;

    // Get token's current position - use grid center for visualization
    const origin = utils.getGridPosition(token.x, token.y);
    debugLog('Token origin', origin);

    // Snap destination to grid
    const snappedDest = utils.getGridPosition(destination.x, destination.y);
    debugLog('Snapped destination', snappedDest);

    // Check if destination is within map bounds
    if (!this.isWithinBounds(snappedDest)) {
      debugLog('Destination is outside map bounds');
      ui.notifications.warn(game.i18n.localize('shared-control.notifications.outOfBounds'));
      return;
    }

    // Try to find a path using A* pathfinding (routes around walls)
    debugLog('Finding path with A* pathfinding');
    const gridPath = this.getGridPath(origin, snappedDest);

    // If no path found, destination is unreachable
    if (!gridPath || gridPath.length === 0) {
      // Check if we're already at the destination
      const startOffset = canvas.grid.getOffset(origin);
      const endOffset = canvas.grid.getOffset(snappedDest);
      if (startOffset.i === endOffset.i && startOffset.j === endOffset.j) {
        debugLog('Already at destination');
        this.clearPreview();
        return;
      }

      console.warn('SharedControl: No path found to destination');
      ui.notifications.error(game.i18n.localize('shared-control.notifications.movementBlocked'));
      this.clearPreview();
      return;
    }

    debugLog('Path found with', gridPath.length, 'waypoints');

    // Calculate distance along the actual path (not straight line)
    let distance = 0;
    let prevPos = origin;
    for (const waypoint of gridPath) {
      distance += utils.calculateDistance(prevPos, waypoint);
      prevPos = waypoint;
    }
    debugLog('Path distance calculated', distance);

    // Get available movement for color-coding (no restrictions)
    const availableMovement = utils.getAvailableMovement(token);
    debugLog('Available movement', availableMovement);

    debugLog('Calling simulateDrag');
    // Simulate drag to show ruler with distance text (pass pre-calculated path)
    await this.simulateDrag(token, origin, snappedDest, distance, availableMovement, gridPath);
  }

  /**
   * Check if movement between two grid positions is blocked by walls
   * @param {Object} from - From position {x, y}
   * @param {Object} to - To position {x, y}
   * @returns {Boolean} - True if blocked
   */
  isBlockedByWalls(from, to) {
    // Always check walls manually for reliability
    try {
      // Get all walls - try multiple sources
      let walls = canvas.walls?.placeables || [];
      if (walls.length === 0 && canvas.walls?.objects?.children) {
        walls = canvas.walls.objects.children;
      }

      for (const wall of walls) {
        // Get wall document - handle both placeables and raw objects
        const doc = wall.document || wall;

        // Skip doors that are open
        const doorState = doc.ds;
        if (doorState === CONST.WALL_DOOR_STATES.OPEN) continue;

        // Skip walls that don't block movement (NONE = 0)
        const moveType = doc.move;
        if (moveType === CONST.WALL_MOVEMENT_TYPES.NONE) continue;

        // Get wall coordinates
        const c = doc.c;
        if (!c || c.length < 4) continue;

        // Check for line segment intersection using our robust algorithm
        if (lineSegmentsIntersect(from.x, from.y, to.x, to.y, c[0], c[1], c[2], c[3])) {
          debugLog('Wall blocks path from', from, 'to', to);
          return true;
        }
      }

      return false;
    } catch (error) {
      debugLog('Error checking wall collision', error);
      // On error, assume blocked to be safe
      return true;
    }
  }

  /**
   * Check if a grid cell is blocked - only if a wall cuts through the interior
   * Walls on cell edges don't block the cell itself, only movement across that edge
   * @param {Object} offset - Grid offset {i, j}
   * @returns {Boolean} - True if wall cuts through cell interior
   */
  isGridCellBlocked(offset) {
    try {
      const topLeft = canvas.grid.getTopLeftPoint(offset);
      const gridSize = canvas.grid.size;

      // Check interior of cell (inset from edges to ignore edge-aligned walls)
      // 15% inset means we only check the center 70% of the cell
      const inset = gridSize * 0.15;
      const minX = topLeft.x + inset;
      const minY = topLeft.y + inset;
      const maxX = topLeft.x + gridSize - inset;
      const maxY = topLeft.y + gridSize - inset;

      // Get all walls
      let walls = canvas.walls?.placeables || [];
      if (walls.length === 0 && canvas.walls?.objects?.children) {
        walls = canvas.walls.objects.children;
      }

      for (const wall of walls) {
        const doc = wall.document || wall;

        // Skip doors that are open
        if (doc.ds === CONST.WALL_DOOR_STATES.OPEN) continue;

        // Skip walls that don't block movement
        if (doc.move === CONST.WALL_MOVEMENT_TYPES.NONE) continue;

        const c = doc.c;
        if (!c || c.length < 4) continue;

        // Check if wall passes through the interior of the cell
        if (this.lineIntersectsRect(c[0], c[1], c[2], c[3], minX, minY, maxX, maxY)) {
          debugLog('BLOCKED: Wall cuts through interior of cell', offset);
          return true;
        }
      }

      return false;
    } catch (error) {
      debugLog('Error checking grid cell blocked', error);
      return false; // Allow movement on error (walls between cells will still block)
    }
  }

  /**
   * Calculate the length of a wall segment that falls within a cell
   * @returns {Number} - Length of wall inside the cell in pixels
   */
  getWallLengthInCell(x1, y1, x2, y2, minX, minY, maxX, maxY) {
    // Clip the line segment to the rectangle using Cohen-Sutherland algorithm
    const clipped = this.clipLineToRect(x1, y1, x2, y2, minX, minY, maxX, maxY);

    if (!clipped) return 0;

    // Calculate length of clipped segment
    const dx = clipped.x2 - clipped.x1;
    const dy = clipped.y2 - clipped.y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Clip a line segment to a rectangle (Cohen-Sutherland algorithm)
   * @returns {Object|null} - Clipped line {x1, y1, x2, y2} or null if outside
   */
  clipLineToRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
    // Region codes
    const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;

    const computeCode = (x, y) => {
      let code = INSIDE;
      if (x < minX) code |= LEFT;
      else if (x > maxX) code |= RIGHT;
      if (y < minY) code |= TOP;
      else if (y > maxY) code |= BOTTOM;
      return code;
    };

    let code1 = computeCode(x1, y1);
    let code2 = computeCode(x2, y2);

    while (true) {
      if (!(code1 | code2)) {
        // Both inside
        return { x1, y1, x2, y2 };
      } else if (code1 & code2) {
        // Both outside same region
        return null;
      } else {
        // Line crosses rectangle - clip it
        const codeOut = code1 ? code1 : code2;
        let x, y;

        if (codeOut & BOTTOM) {
          x = x1 + (x2 - x1) * (maxY - y1) / (y2 - y1);
          y = maxY;
        } else if (codeOut & TOP) {
          x = x1 + (x2 - x1) * (minY - y1) / (y2 - y1);
          y = minY;
        } else if (codeOut & RIGHT) {
          y = y1 + (y2 - y1) * (maxX - x1) / (x2 - x1);
          x = maxX;
        } else if (codeOut & LEFT) {
          y = y1 + (y2 - y1) * (minX - x1) / (x2 - x1);
          x = minX;
        }

        if (codeOut === code1) {
          x1 = x;
          y1 = y;
          code1 = computeCode(x1, y1);
        } else {
          x2 = x;
          y2 = y;
          code2 = computeCode(x2, y2);
        }
      }
    }
  }

  /**
   * Check if a line segment intersects a rectangle (Cohen-Sutherland inspired)
   * @param {Number} x1, y1 - Line start point
   * @param {Number} x2, y2 - Line end point
   * @param {Number} minX, minY, maxX, maxY - Rectangle bounds
   * @returns {Boolean} - True if line intersects rectangle
   */
  lineIntersectsRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
    // Check if either endpoint is inside the rectangle
    const p1Inside = x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY;
    const p2Inside = x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY;

    if (p1Inside || p2Inside) {
      return true;
    }

    // Check if line is completely outside on one side
    if ((x1 < minX && x2 < minX) || (x1 > maxX && x2 > maxX) ||
        (y1 < minY && y2 < minY) || (y1 > maxY && y2 > maxY)) {
      return false;
    }

    // Check intersection with each edge of the rectangle
    // Left edge
    if (lineSegmentsIntersect(x1, y1, x2, y2, minX, minY, minX, maxY)) return true;
    // Right edge
    if (lineSegmentsIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY)) return true;
    // Top edge
    if (lineSegmentsIntersect(x1, y1, x2, y2, minX, minY, maxX, minY)) return true;
    // Bottom edge
    if (lineSegmentsIntersect(x1, y1, x2, y2, minX, maxY, maxX, maxY)) return true;

    return false;
  }

  /**
   * Get the scene bounds rectangle
   * @returns {Object} - Bounds {x, y, width, height} or null
   */
  getSceneBounds() {
    // Try multiple approaches for v13 compatibility
    if (canvas.dimensions?.sceneRect) {
      return canvas.dimensions.sceneRect;
    }

    if (canvas.dimensions?.rect) {
      return canvas.dimensions.rect;
    }

    // Fallback: use scene dimensions directly
    if (canvas.scene) {
      const scene = canvas.scene;
      const padding = canvas.dimensions?.padding || 0;
      return {
        x: padding,
        y: padding,
        width: scene.width || canvas.dimensions?.width || 0,
        height: scene.height || canvas.dimensions?.height || 0
      };
    }

    // Last resort: use sceneX/sceneY/sceneWidth/sceneHeight
    if (canvas.dimensions) {
      const d = canvas.dimensions;
      if (d.sceneWidth && d.sceneHeight) {
        return {
          x: d.sceneX || 0,
          y: d.sceneY || 0,
          width: d.sceneWidth,
          height: d.sceneHeight
        };
      }
    }

    return null;
  }

  /**
   * Check if a position is within the scene/map bounds
   * @param {Object} position - Position {x, y} in canvas coordinates
   * @returns {Boolean} - True if within bounds
   */
  isWithinBounds(position) {
    const bounds = this.getSceneBounds();
    if (!bounds) return true; // Can't determine bounds, allow movement

    const inBounds = position.x >= bounds.x &&
                     position.x <= bounds.x + bounds.width &&
                     position.y >= bounds.y &&
                     position.y <= bounds.y + bounds.height;

    if (!inBounds) {
      debugLog('Position out of bounds:', position, 'Bounds:', bounds);
    }

    return inBounds;
  }

  /**
   * Check if a grid offset is within the scene/map bounds
   * @param {Object} offset - Grid offset {i, j}
   * @param {Boolean} lenient - If true, only require any overlap (for destinations)
   * @returns {Boolean} - True if within bounds
   */
  isGridOffsetWithinBounds(offset, lenient = false) {
    if (!canvas.grid) return true;

    try {
      const topLeft = canvas.grid.getTopLeftPoint(offset);
      const gridSize = canvas.grid.size;
      const bounds = this.getSceneBounds();

      if (!bounds) return true;

      // Calculate cell rectangle
      const cellMinX = topLeft.x;
      const cellMinY = topLeft.y;
      const cellMaxX = topLeft.x + gridSize;
      const cellMaxY = topLeft.y + gridSize;

      // Calculate scene bounds
      const sceneMinX = bounds.x;
      const sceneMinY = bounds.y;
      const sceneMaxX = bounds.x + bounds.width;
      const sceneMaxY = bounds.y + bounds.height;

      // Calculate overlap rectangle
      const overlapMinX = Math.max(cellMinX, sceneMinX);
      const overlapMinY = Math.max(cellMinY, sceneMinY);
      const overlapMaxX = Math.min(cellMaxX, sceneMaxX);
      const overlapMaxY = Math.min(cellMaxY, sceneMaxY);

      // No overlap at all - completely out of bounds
      if (overlapMinX >= overlapMaxX || overlapMinY >= overlapMaxY) {
        return false;
      }

      // For lenient mode (destinations), any overlap is fine
      if (lenient) {
        return true;
      }

      // Check if cell CENTER is within bounds (with edge tolerance)
      // Allow cells whose center is within 1/3 grid size of the boundary
      const centerX = topLeft.x + gridSize / 2;
      const centerY = topLeft.y + gridSize / 2;
      const edgeTolerance = gridSize / 3;

      const centerInBounds = centerX >= (sceneMinX - edgeTolerance) &&
                             centerX <= (sceneMaxX + edgeTolerance) &&
                             centerY >= (sceneMinY - edgeTolerance) &&
                             centerY <= (sceneMaxY + edgeTolerance);

      if (!centerInBounds) {
        debugLog('Cell', offset, 'center is too far outside bounds, skipping');
        return false;
      }

      return true;
    } catch (error) {
      debugLog('Error checking grid offset bounds:', error);
      return true;
    }
  }

  /**
   * Get all grid squares along the path from origin to destination using A* pathfinding
   * @param {Object} origin - Origin position
   * @param {Object} destination - Destination position
   * @returns {Array} - Array of grid positions
   */
  getGridPath(origin, destination) {
    const gridSize = canvas.grid.size;

    // Convert positions to grid coordinates
    const startOffset = canvas.grid.getOffset(origin);
    const endOffset = canvas.grid.getOffset(destination);

    // Try A* pathfinding first to avoid walls
    const pathfindingResult = this.findPathAStar(startOffset, endOffset);

    if (pathfindingResult && pathfindingResult.length > 0) {
      debugLog('Using A* pathfinding with', pathfindingResult.length, 'nodes');
      // Convert grid offsets to center positions, excluding the starting square
      return pathfindingResult.slice(1).map(offset => {
        const topLeft = canvas.grid.getTopLeftPoint(offset);
        return { x: topLeft.x + gridSize / 2, y: topLeft.y + gridSize / 2 };
      });
    }

    // No valid path found - return null to trigger error
    debugLog('Pathfinding failed - no valid path exists');
    return null;
  }

  /**
   * A* pathfinding algorithm to find path around obstacles
   * @param {Object} startOffset - Start grid offset {i, j}
   * @param {Object} endOffset - End grid offset {i, j}
   * @returns {Array|null} - Array of grid offsets or null if no path
   */
  findPathAStar(startOffset, endOffset) {
    const gridSize = canvas.grid.size;

    debugLog('A* pathfinding from', startOffset, 'to', endOffset);

    // Check if destination has any overlap with bounds (lenient check for destination)
    if (!this.isGridOffsetWithinBounds(endOffset, true)) {
      debugLog('A* pathfinding: destination out of bounds');
      return null;
    }

    // Helper to get unique key for grid position
    const getKey = (offset) => `${offset.i},${offset.j}`;

    // Helper to calculate heuristic - use octile distance for square grids with diagonals
    const heuristic = (a, b) => {
      const dx = Math.abs(a.i - b.i);
      const dy = Math.abs(a.j - b.j);
      const gridType = canvas.grid.type;

      // For hex grids, use Manhattan distance
      if (gridType >= CONST.GRID_TYPES.HEXODDR) {
        return dx + dy;
      }

      // For square grids with diagonals, use octile distance (D + (√2-1) * min(dx,dy))
      // Approximated as D + 0.41 * min(dx, dy) for efficiency
      return dx + dy - 0.59 * Math.min(dx, dy);
    };

    // Helper to calculate movement cost between adjacent cells
    const getMoveCost = (from, to) => {
      const dx = Math.abs(from.i - to.i);
      const dy = Math.abs(from.j - to.j);

      // Diagonal movement costs √2 ≈ 1.41 (or 1.5 in some systems)
      if (dx === 1 && dy === 1) {
        return DIAGONAL_COST;
      }
      return 1;
    };

    // Helper to get neighbors based on grid type
    const getNeighbors = (offset) => {
      const gridType = canvas.grid.type;

      // Hex grids (columns or rows)
      if (gridType === CONST.GRID_TYPES.HEXODDR || gridType === CONST.GRID_TYPES.HEXEVENR) {
        // Hex rows (pointy-top) - neighbors depend on row parity
        const isOddRow = offset.j % 2 !== 0;
        if (isOddRow) {
          return [
            { i: offset.i + 1, j: offset.j },     // right
            { i: offset.i - 1, j: offset.j },     // left
            { i: offset.i, j: offset.j - 1 },     // upper-left
            { i: offset.i + 1, j: offset.j - 1 }, // upper-right
            { i: offset.i, j: offset.j + 1 },     // lower-left
            { i: offset.i + 1, j: offset.j + 1 }, // lower-right
          ];
        } else {
          return [
            { i: offset.i + 1, j: offset.j },     // right
            { i: offset.i - 1, j: offset.j },     // left
            { i: offset.i - 1, j: offset.j - 1 }, // upper-left
            { i: offset.i, j: offset.j - 1 },     // upper-right
            { i: offset.i - 1, j: offset.j + 1 }, // lower-left
            { i: offset.i, j: offset.j + 1 },     // lower-right
          ];
        }
      } else if (gridType === CONST.GRID_TYPES.HEXODDC || gridType === CONST.GRID_TYPES.HEXEVENC) {
        // Hex columns (flat-top) - neighbors depend on column parity
        const isOddCol = offset.i % 2 !== 0;
        if (isOddCol) {
          return [
            { i: offset.i, j: offset.j - 1 },     // up
            { i: offset.i, j: offset.j + 1 },     // down
            { i: offset.i - 1, j: offset.j },     // upper-left
            { i: offset.i - 1, j: offset.j + 1 }, // lower-left
            { i: offset.i + 1, j: offset.j },     // upper-right
            { i: offset.i + 1, j: offset.j + 1 }, // lower-right
          ];
        } else {
          return [
            { i: offset.i, j: offset.j - 1 },     // up
            { i: offset.i, j: offset.j + 1 },     // down
            { i: offset.i - 1, j: offset.j - 1 }, // upper-left
            { i: offset.i - 1, j: offset.j },     // lower-left
            { i: offset.i + 1, j: offset.j - 1 }, // upper-right
            { i: offset.i + 1, j: offset.j },     // lower-right
          ];
        }
      }

      // Square grid - 8-directional movement with diagonals
      return [
        { i: offset.i + 1, j: offset.j },     // right
        { i: offset.i - 1, j: offset.j },     // left
        { i: offset.i, j: offset.j + 1 },     // down
        { i: offset.i, j: offset.j - 1 },     // up
        { i: offset.i + 1, j: offset.j - 1 }, // up-right (diagonal)
        { i: offset.i - 1, j: offset.j - 1 }, // up-left (diagonal)
        { i: offset.i + 1, j: offset.j + 1 }, // down-right (diagonal)
        { i: offset.i - 1, j: offset.j + 1 }, // down-left (diagonal)
      ];
    };

    // Initialize open and closed sets
    const openSet = [startOffset];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    gScore.set(getKey(startOffset), 0);
    fScore.set(getKey(startOffset), heuristic(startOffset, endOffset));

    let iterations = 0;
    const maxIterations = MAX_PATHFINDING_ITERATIONS;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Get node with lowest fScore
      openSet.sort((a, b) => fScore.get(getKey(a)) - fScore.get(getKey(b)));
      const current = openSet.shift();
      const currentKey = getKey(current);

      // Check if we reached the destination
      if (current.i === endOffset.i && current.j === endOffset.j) {
        // Reconstruct path
        const path = [current];
        let temp = current;
        while (cameFrom.has(getKey(temp))) {
          temp = cameFrom.get(getKey(temp));
          path.unshift(temp);
        }
        debugLog('A* found path with', path.length, 'nodes in', iterations, 'iterations');
        return path;
      }

      closedSet.add(currentKey);

      // Check all neighbors
      for (const neighbor of getNeighbors(current)) {
        const neighborKey = getKey(neighbor);

        if (closedSet.has(neighborKey)) continue;

        // Skip neighbors outside map bounds
        if (!this.isGridOffsetWithinBounds(neighbor)) {
          closedSet.add(neighborKey);
          continue;
        }

        // Check if movement to this neighbor is blocked by walls
        const currentCenter = canvas.grid.getTopLeftPoint(current);
        currentCenter.x += gridSize / 2;
        currentCenter.y += gridSize / 2;

        const neighborCenter = canvas.grid.getTopLeftPoint(neighbor);
        neighborCenter.x += gridSize / 2;
        neighborCenter.y += gridSize / 2;

        if (this.isBlockedByWalls(currentCenter, neighborCenter)) {
          // Don't add to closedSet - cell might be reachable from another direction
          continue;
        }

        // Calculate tentative gScore (account for diagonal cost)
        const moveCost = getMoveCost(current, neighbor);
        const tentativeGScore = gScore.get(currentKey) + moveCost;

        if (!openSet.find(n => getKey(n) === neighborKey)) {
          openSet.push(neighbor);
        } else if (tentativeGScore >= (gScore.get(neighborKey) || Infinity)) {
          continue;
        }

        // This path is the best so far
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeGScore);
        fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, endOffset));
      }
    }

    debugLog('A* pathfinding failed - no path found after', iterations, 'iterations. Explored', closedSet.size, 'cells');
    return null; // No path found
  }

  /**
   * Simulate a drag workflow to trigger TokenRuler
   * @param {Token} token - The token
   * @param {Object} origin - Origin position
   * @param {Object} destination - Destination position
   * @param {Number} distance - Movement distance
   * @param {Number|null} availableMovement - Available movement
   * @param {Array} gridPath - Pre-calculated grid path from A* pathfinding
   */
  async simulateDrag(token, origin, destination, distance, availableMovement, gridPath) {
    this.simulatedDragActive = true;

    try {
      debugLog('Drawing movement path with color-coding from', origin, 'to', destination);

      // Determine color based on movement range
      let color;
      if (availableMovement === null) {
        // No movement limit - use cyan
        color = 0x00CCCC;
      } else {
        // Color-code based on movement distance
        if (distance <= availableMovement) {
          // Green - within movement range
          color = 0x00FF00;
        } else if (distance <= availableMovement * 2) {
          // Yellow - within double movement range
          color = 0xFFFF00;
        } else {
          // Red - beyond double movement range
          color = 0xFF0000;
        }
      }

      debugLog('Movement color determined', {
        distance,
        availableMovement,
        color: color.toString(16)
      });

      // Draw graphics with appropriate color
      if (!this.graphics) {
        this.graphics = new PIXI.Graphics();
        canvas.controls.addChild(this.graphics);
      }

      this.graphics.clear();

      // Use the pre-calculated path
      const gridSquares = gridPath;
      this.currentPath = gridSquares; // Store for later use during movement
      debugLog('Grid squares in path:', gridSquares.length);

      // Draw filled rectangles for each grid square
      const gridSize = canvas.grid.size;
      this.graphics.beginFill(color, 0.4); // Translucent fill

      for (const gridPos of gridSquares) {
        // Get top-left corner of this grid square
        const offset = canvas.grid.getOffset(gridPos);
        const topLeft = canvas.grid.getTopLeftPoint(offset);

        // Draw filled rectangle for this grid square
        this.graphics.drawRect(topLeft.x, topLeft.y, gridSize, gridSize);
      }

      this.graphics.endFill();

      // Add distance text at midpoint of the path
      const midX = (origin.x + destination.x) / 2;
      const midY = (origin.y + destination.y) / 2;

      if (!this.distanceText) {
        this.distanceText = new PIXI.Text('', {
          fontSize: 24,
          fill: 0xFFFFFF,
          stroke: 0x000000,
          strokeThickness: 4,
          fontWeight: 'bold'
        });
        canvas.controls.addChild(this.distanceText);
      }

      const units = canvas.grid.units || 'units';
      this.distanceText.text = `${Math.round(distance)} ${units}`;
      this.distanceText.x = midX - (this.distanceText.width / 2);
      this.distanceText.y = midY - (this.distanceText.height / 2);
      this.distanceText.visible = true;

      debugLog('Path overlay drawn with color-coding and distance text');

    } catch (error) {
      console.error('SharedControl: Error drawing path', error);
      this.clearPreview();
    }
  }

  /**
   * Confirm and execute the movement
   */
  async confirmMovement() {
    if (!this.activeToken || !this.targetDestination) {
      console.warn('SharedControl: No active preview to confirm');
      return;
    }

    const token = this.activeToken;

    // Calculate distance for chat message
    const origin = utils.getGridPosition(token.x, token.y);
    const destCenter = utils.getGridPosition(this.targetDestination.x, this.targetDestination.y);
    const distance = utils.calculateDistance(origin, destCenter);
    const units = canvas.grid.units || 'units';

    // Use getTokenPosition (top-left) for actual token placement
    // since token x,y represents the top-left corner
    const destination = utils.getTokenPosition(
      this.targetDestination.x,
      this.targetDestination.y
    );

    try {
      // Clear path highlighting before movement starts
      if (this.graphics) {
        this.graphics.clear();
      }
      if (this.distanceText) {
        this.distanceText.visible = false;
      }

      // Animate token through each waypoint in the path
      if (this.currentPath && this.currentPath.length > 0) {
        debugLog('Animating through path with', this.currentPath.length, 'waypoints');

        // Get animation speed from settings
        const animationSpeed = game.settings.get('shared-control', 'animationSpeed');

        for (let i = 0; i < this.currentPath.length; i++) {
          const waypoint = this.currentPath[i];

          // Convert waypoint center to top-left position for token placement
          const waypointTopLeft = utils.getTokenPosition(waypoint.x, waypoint.y);

          // Move to this waypoint with animation
          await token.document.update(
            { x: waypointTopLeft.x, y: waypointTopLeft.y },
            {
              animate: true,
              animation: {
                duration: animationSpeed,
                easing: 'linear'
              }
            }
          );

          // Small delay to ensure animation completes
          await new Promise(resolve => setTimeout(resolve, animationSpeed));
        }
      } else {
        // Fallback: direct movement if no path calculated
        await token.document.update(
          { x: destination.x, y: destination.y },
          {
            animate: true,
            animation: {
              movementSpeed: 10,
              easing: 'linear'
            }
          }
        );
      }

      // Send chat message about the movement with cost info
      const roundedDistance = Math.round(distance);
      const availableMovement = utils.getAvailableMovement(token);

      let chatMessage = `<strong>${token.name}</strong> moved <strong>${roundedDistance} ${units}</strong>`;

      // Add movement cost info if tracking is enabled and we have movement data
      if (availableMovement !== null) {
        const movementUsedPercent = Math.round((distance / availableMovement) * 100);
        const remaining = Math.max(0, availableMovement - distance);

        if (distance <= availableMovement) {
          chatMessage += ` <span style="color: #00aa00;">(${Math.round(remaining)} ${units} remaining)</span>`;
        } else if (distance <= availableMovement * 2) {
          const extraUsed = Math.round(distance - availableMovement);
          chatMessage += ` <span style="color: #aaaa00;">(used ${extraUsed} ${units} extra movement)</span>`;
        } else {
          const extraUsed = Math.round(distance - availableMovement);
          chatMessage += ` <span style="color: #aa0000;">(exceeded by ${extraUsed} ${units})</span>`;
        }
      }

      ChatMessage.create({
        content: chatMessage,
        speaker: ChatMessage.getSpeaker({ token: token.document }),
        style: CONST.CHAT_MESSAGE_STYLES.EMOTE
      });

      debugLog('Movement confirmed and executed');

    } catch (error) {
      console.error('SharedControl: Error executing movement', error);
      throw error;

    } finally {
      // Clear preview regardless of success/failure
      this.clearPreview();
    }
  }

  /**
   * Clear the current preview
   */
  clearPreview() {
    debugLog('Clearing preview');

    // Clear the native ruler (use reset() instead of deprecated clear())
    try {
      if (canvas.controls?.ruler) {
        canvas.controls.ruler.reset();
      }
    } catch (error) {
      console.warn('SharedControl: Error clearing ruler', error);
    }

    // Clear graphics fallback
    if (this.graphics) {
      this.graphics.clear();
    }

    // Clear distance text
    if (this.distanceText) {
      this.distanceText.visible = false;
    }

    // Reset state
    this.activeToken = null;
    this.targetDestination = null;
    this.simulatedDragActive = false;
    this.currentPath = [];
  }

  /**
   * Check if a drag is currently active
   */
  isDragActive() {
    return this.simulatedDragActive;
  }

  /**
   * Clean up on module disable
   */
  destroy() {
    this.clearPreview();
    this.clearDebugView();
    this.clearSelectionHighlight();

    // Destroy graphics object
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }

    // Destroy distance text
    if (this.distanceText) {
      this.distanceText.destroy();
      this.distanceText = null;
    }
  }
}
