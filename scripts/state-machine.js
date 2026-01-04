/**
 * SharedControl Movement State Machine
 * Manages the tap-to-move workflow states
 */

import * as utils from './utils.js';
import { debugLog } from './utils.js';

export const States = {
  IDLE: 'IDLE',
  AWAITING_DESTINATION: 'AWAITING_DESTINATION',
  PREVIEWING_PATH: 'PREVIEWING_PATH',
  EXECUTING_MOVEMENT: 'EXECUTING_MOVEMENT',
  ERROR: 'ERROR'
};

export class MovementStateMachine {
  constructor() {
    this.currentState = States.IDLE;
    this.selectedToken = null;
    this.previewDestination = null;
    this.lastTapPosition = null;
    this.lastTapTime = 0;
    this.errorTimeout = null;
    this.lockedTokens = new Set(); // Track tokens being moved by other users
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if currently in preview mode
   */
  isInPreviewMode() {
    return this.currentState === States.PREVIEWING_PATH;
  }

  /**
   * Select a token and transition to AWAITING_DESTINATION
   * @param {Token} token - The token to select
   * @param {RulerPreview} rulerPreview - The ruler preview handler for visual feedback
   * @returns {Boolean} - True if selection successful
   */
  selectToken(token, rulerPreview) {
    // Validate permissions
    if (!utils.canMoveToken(token)) {
      ui.notifications.warn(game.i18n.localize('shared-control.notifications.noPermission'));
      return false;
    }

    // Check if token is locked by another user
    if (this.lockedTokens.has(token.id)) {
      const lockingUser = game.users.find(u => u.id === this.lockedTokens.get(token.id));
      const userName = lockingUser?.name ?? 'another user';
      ui.notifications.info(
        game.i18n.format('shared-control.notifications.tokenLocked', { user: userName })
      );
      return false;
    }

    // Control the token
    token.control({ releaseOthers: true });

    // Show visual highlight
    if (rulerPreview) {
      rulerPreview.showSelectionHighlight(token);
    }

    this.selectedToken = token;
    this.currentState = States.AWAITING_DESTINATION;
    this.previewDestination = null;

    debugLog('Token selected, awaiting destination');
    return true;
  }

  /**
   * Preview movement to a destination
   * @param {Object} destination - Destination position {x, y}
   * @param {RulerPreview} rulerPreview - The ruler preview handler
   * @returns {Boolean} - True if preview successful
   */
  async previewMovement(destination, rulerPreview) {
    debugLog('previewMovement called', {
      currentState: this.currentState,
      destination,
      selectedToken: this.selectedToken?.name
    });

    if (this.currentState !== States.AWAITING_DESTINATION &&
        this.currentState !== States.PREVIEWING_PATH) {
      debugLog('Invalid state for preview movement');
      return false;
    }

    if (!this.selectedToken) {
      debugLog('No token selected');
      return false;
    }

    // Allow path plotting to any location, including areas hidden by fog of war
    debugLog('Path plotting allowed to any destination');

    // Snap destination to grid for consistent comparison
    const snappedDestination = utils.getGridPosition(destination.x, destination.y);

    // Update preview destination
    this.previewDestination = destination;
    this.lastTapPosition = snappedDestination;  // Store snapped position for comparison
    this.lastTapTime = Date.now();

    // Transition to previewing state
    this.currentState = States.PREVIEWING_PATH;

    debugLog('Calling rulerPreview.showPreview');

    try {
      // Show ruler preview via simulated drag
      await rulerPreview.showPreview(this.selectedToken, destination);
      debugLog('Previewing movement to', destination);
      return true;
    } catch (error) {
      console.error('SharedControl: Error showing preview:', error);
      return false;
    }
  }

  /**
   * Confirm and execute the movement
   * @param {RulerPreview} rulerPreview - The ruler preview handler
   * @returns {Boolean} - True if movement executed
   */
  async confirmMovement(rulerPreview) {
    if (this.currentState !== States.PREVIEWING_PATH) {
      debugLog('Invalid state for confirm movement');
      return false;
    }

    if (!this.selectedToken || !this.previewDestination) {
      debugLog('Missing token or destination');
      return false;
    }

    // Transition to executing state
    this.currentState = States.EXECUTING_MOVEMENT;

    try {
      // Execute the movement via ruler preview
      await rulerPreview.confirmMovement();

      // Success - return to idle
      this.reset(rulerPreview);
      debugLog('Movement executed successfully');
      return true;

    } catch (error) {
      console.error('SharedControl: Error executing movement', error);
      this.handleError('movementBlocked');
      return false;
    }
  }

  /**
   * Cancel the current movement operation
   * @param {RulerPreview} rulerPreview - The ruler preview handler
   */
  cancelMovement(rulerPreview) {
    debugLog('Canceling movement');

    // Clear ruler preview (which also clears notifications)
    if (rulerPreview) {
      rulerPreview.clearPreview();
    }

    // Release token control
    if (this.selectedToken) {
      this.selectedToken.release();
    }

    // Reset to idle
    this.reset(rulerPreview);
  }

  /**
   * Handle an error state
   * @param {String} errorType - Type of error
   */
  handleError(errorType) {
    this.currentState = States.ERROR;

    // Show error notification
    const messageKey = `shared-control.notifications.${errorType}`;
    const message = game.i18n.localize(messageKey);
    ui.notifications.error(message);

    // Clear any existing timeout
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
    }

    // Auto-return to awaiting destination after timeout
    this.errorTimeout = setTimeout(() => {
      if (this.currentState === States.ERROR) {
        this.currentState = States.AWAITING_DESTINATION;
        this.previewDestination = null;
        debugLog('Recovered from error state');
      }
    }, 2000);
  }

  /**
   * Lock a token to prevent race conditions
   * @param {String} tokenId - Token ID
   * @param {String} userId - User ID
   */
  lockToken(tokenId, userId) {
    this.lockedTokens.set(tokenId, userId);
  }

  /**
   * Unlock a token
   * @param {String} tokenId - Token ID
   */
  unlockToken(tokenId) {
    this.lockedTokens.delete(tokenId);
  }

  /**
   * Check if a tap is at the same location as the last tap
   * No timeout - user can cancel by tapping the token instead
   * @param {Object} position - Position to check {x, y}
   * @returns {Boolean} - True if same location
   */
  isSameTapLocation(position) {
    if (!this.lastTapPosition) return false;

    // No timeout check - just verify it's the same location
    // User can cancel by tapping the selected token
    return utils.isSameLocation(position, this.lastTapPosition);
  }

  /**
   * Reset the state machine to IDLE
   * @param {RulerPreview} rulerPreview - The ruler preview handler for clearing visual feedback
   */
  reset(rulerPreview) {
    // Clear visual highlight
    if (rulerPreview) {
      rulerPreview.clearSelectionHighlight();
    }

    this.currentState = States.IDLE;
    this.selectedToken = null;
    this.previewDestination = null;
    this.lastTapPosition = null;
    this.lastTapTime = 0;

    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = null;
    }

    debugLog('State machine reset to IDLE');
  }

  /**
   * Clean up when module is disabled
   * @param {RulerPreview} rulerPreview - The ruler preview handler
   */
  destroy(rulerPreview) {
    this.reset(rulerPreview);
    this.lockedTokens.clear();
  }
}
