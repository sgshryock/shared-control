/**
 * SharedControl Utility Functions
 * Helper functions for grid calculations, distance checking, and validation
 */

/**
 * Debug logging utility - only logs when debug mode is enabled
 * @param {...any} args - Arguments to log
 */
export function debugLog(...args) {
  try {
    if (game.settings.get('shared-control', 'debugMode')) {
      console.log('SharedControl:', ...args);
    }
  } catch {
    // Settings not yet registered, skip logging
  }
}

/**
 * Check if two positions are within tolerance distance of each other
 * @param {Object} pos1 - First position {x, y}
 * @param {Object} pos2 - Second position {x, y}
 * @param {Number} tolerance - Distance tolerance in pixels
 * @returns {Boolean} - True if positions are within tolerance
 */
export function isSameLocation(pos1, pos2, tolerance = null) {
  if (!pos1 || !pos2) return false;

  const tol = tolerance ?? game.settings.get('shared-control', 'tapTolerance');
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance <= tol;
}

/**
 * Check if a destination is visible to the token
 * @param {Token} token - The token object
 * @param {Object} destination - Destination position {x, y}
 * @returns {Boolean} - True if destination is visible
 */
export function isDestinationVisible(token, destination) {
  if (!canvas.visibility) return true; // No visibility system active

  try {
    return canvas.visibility.testVisibility(destination, { object: token });
  } catch (error) {
    console.warn('SharedControl: Error testing visibility', error);
    return true; // Default to allowing movement if test fails
  }
}

/**
 * Check if user has permission to move the token
 * @param {Token} token - The token object
 * @returns {Boolean} - True if user can move the token
 */
export function canMoveToken(token) {
  if (!token) return false;
  return token.isOwner || game.user.isGM;
}

/**
 * Get available movement distance for a token (system-specific)
 * @param {Token} token - The token object
 * @returns {Number|null} - Available movement in scene distance units (feet), or null if unlimited
 */
export function getAvailableMovement(token) {
  // Check if movement tracking is enabled in settings
  const trackMovement = game.settings.get('shared-control', 'trackMovement');
  debugLog('Movement tracking enabled?', trackMovement);

  if (!trackMovement) {
    debugLog('Movement tracking disabled in settings');
    return null;
  }

  const systemId = game.system.id;
  debugLog('Game system ID:', systemId);

  if (!token.actor) {
    console.warn('SharedControl: Token has no actor');
    return null;
  }

  try {
    let movement = null;

    switch(systemId) {
      case 'dnd5e':
        movement = token.actor?.system?.attributes?.movement?.walk ?? null;
        debugLog('DND5e movement path check:', {
          hasSystem: !!token.actor.system,
          hasAttributes: !!token.actor.system?.attributes,
          hasMovement: !!token.actor.system?.attributes?.movement,
          walk: token.actor.system?.attributes?.movement?.walk
        });
        break;

      case 'cosmere-rpg':
        // Cosmere RPG stores movement in system.movement.walk.rate
        const cosmereMovement = token.actor.system?.movement;
        debugLog('Cosmere movement.walk:', cosmereMovement?.walk);

        // Extract the actual number from walk.rate.derived
        const walkRate = cosmereMovement?.walk?.rate;
        movement = walkRate?.derived ?? (typeof walkRate === 'number' ? walkRate : null);

        debugLog('Cosmere extracted movement:', movement);
        break;

      case 'pf2e':
        movement = token.actor?.system?.attributes?.speed?.total ?? null;
        break;

      case 'swade':
        movement = token.actor?.system?.stats?.speed?.value ?? null;
        break;

      default:
        // Try generic approach - look for common movement attributes
        movement = token.actor?.system?.attributes?.movement?.value
                || token.actor?.system?.attributes?.speed?.value
                || token.actor?.system?.movement?.value
                || null;
        debugLog('Generic system movement check');
    }

    debugLog('Available movement for', token.name, ':', movement);
    return movement;
  } catch (error) {
    console.warn('SharedControl: Error getting available movement', error);
    return null;
  }
}

/**
 * Calculate distance between two points using grid measurement
 * @param {Object} origin - Origin position {x, y}
 * @param {Object} destination - Destination position {x, y}
 * @returns {Number} - Distance in scene distance units (e.g., feet)
 */
export function calculateDistance(origin, destination) {
  if (!canvas.grid) return 0;

  try {
    const gridType = canvas.grid.type;

    if (gridType === CONST.GRID_TYPES.GRIDLESS) {
      // Gridless: use pixel-based distance
      const dx = destination.x - origin.x;
      const dy = destination.y - origin.y;
      const pixels = Math.sqrt(dx * dx + dy * dy);
      // Convert pixels to scene distance units
      return (pixels / canvas.grid.size) * canvas.grid.distance;
    } else {
      // Grid-based: use Foundry's v13 measurement system
      // measurePath returns distance already in scene units (feet)
      const result = canvas.grid.measurePath([origin, destination]);
      return result.distance;
    }
  } catch (error) {
    console.warn('SharedControl: Error calculating distance', error);
    // Fallback to simple distance calculation
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const pixels = Math.sqrt(dx * dx + dy * dy);
    return (pixels / canvas.grid.size) * canvas.grid.distance;
  }
}

/**
 * Check if movement path is blocked by walls or terrain
 * @param {Token} token - The token object
 * @param {Array} waypoints - Array of waypoint positions
 * @returns {Boolean} - True if path is clear
 */
export function isPathClear(token, waypoints) {
  if (!canvas.walls || waypoints.length < 2) return true;

  try {
    // Check each segment of the path for wall collisions
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];

      // Check each wall segment for intersection
      const walls = canvas.walls?.placeables || [];
      for (const wall of walls) {
        // Skip doors that are open
        if (wall.document.ds === CONST.WALL_DOOR_STATES.OPEN) continue;

        // Skip walls that don't block movement (NONE = 0)
        const moveType = wall.document.move;
        if (moveType === CONST.WALL_MOVEMENT_TYPES.NONE) continue;

        // Get wall coordinates
        const c = wall.document.c;

        // Check for line segment intersection using robust algorithm
        if (lineSegmentsIntersect(from.x, from.y, to.x, to.y, c[0], c[1], c[2], c[3])) {
          debugLog('Path blocked by wall between', from, 'and', to);
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.warn('SharedControl: Error checking wall collision', error);
    // Default to blocked if collision check fails (safer)
    return false;
  }
}

/**
 * Check if two line segments intersect
 * @returns {Boolean} - True if segments intersect
 */
function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = ((y4 - y3) * (x2 - x1)) - ((x4 - x3) * (y2 - y1));

  if (Math.abs(denom) < 0.0001) {
    // Lines are parallel
    return false;
  }

  const ua = (((x4 - x3) * (y1 - y3)) - ((y4 - y3) * (x1 - x3))) / denom;
  const ub = (((x2 - x1) * (y1 - y3)) - ((y2 - y1) * (x1 - x3))) / denom;

  // Check if intersection point is within both line segments
  return (ua >= 0 && ua <= 1) && (ub >= 0 && ub <= 1);
}

/**
 * Convert screen coordinates to canvas coordinates
 * @param {Number} clientX - Screen X coordinate
 * @param {Number} clientY - Screen Y coordinate
 * @returns {Object} - Canvas position {x, y}
 */
export function screenToCanvas(clientX, clientY) {
  const transform = canvas.stage.worldTransform;
  const canvasX = (clientX - transform.tx) / transform.a;
  const canvasY = (clientY - transform.ty) / transform.d;

  return { x: canvasX, y: canvasY };
}

/**
 * Get the grid position (snapped to grid) for canvas coordinates
 * Returns the CENTER of the grid space for visualization
 * @param {Number} x - Canvas X coordinate
 * @param {Number} y - Canvas Y coordinate
 * @returns {Object} - Grid-snapped position {x, y}
 */
export function getGridPosition(x, y) {
  if (!canvas.grid) return { x, y };

  try {
    // v13 API: Use getTopLeftPoint to get the top-left of the grid space,
    // then offset to the center
    const offset = canvas.grid.getOffset({x, y});
    const topLeft = canvas.grid.getTopLeftPoint(offset);

    // Add half grid size to get to center
    const gridSize = canvas.grid.size;
    const centerX = topLeft.x + (gridSize / 2);
    const centerY = topLeft.y + (gridSize / 2);

    debugLog('Grid snap debug', {
      input: {x, y},
      offset,
      topLeft,
      gridSize,
      center: {x: centerX, y: centerY}
    });

    return { x: centerX, y: centerY };
  } catch (error) {
    console.warn('SharedControl: Error snapping to grid, using raw position', error);
    return { x, y };
  }
}

/**
 * Get the token position for a click (top-left of grid space)
 * This is for placing tokens, since token x,y represents top-left corner
 * @param {Number} x - Canvas X coordinate
 * @param {Number} y - Canvas Y coordinate
 * @returns {Object} - Token position {x, y} at top-left of grid
 */
export function getTokenPosition(x, y) {
  if (!canvas.grid) return { x, y };

  try {
    // Get the top-left corner of the grid space
    const offset = canvas.grid.getOffset({x, y});
    const topLeft = canvas.grid.getTopLeftPoint(offset);

    return { x: topLeft.x, y: topLeft.y };
  } catch (error) {
    console.warn('SharedControl: Error getting token position', error);
    return { x, y };
  }
}

/**
 * Debounce function to prevent rapid repeated calls
 * @param {Function} func - Function to debounce
 * @param {Number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
