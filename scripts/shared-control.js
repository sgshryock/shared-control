/**
 * SharedControl - Touch Screen Token Movement for Foundry VTT v13
 * Main module entry point
 *
 * @author Gordon Shryock
 * @version 1.3.0
 */

import { registerSettings } from './settings.js';
import { MovementStateMachine } from './state-machine.js';
import { RulerPreview } from './ruler-preview.js';
import { TouchWorkflowHandler } from './touch-workflow.js';
import { OverlayControls } from './overlay-controls.js';
import { checkCompatibility } from './compat.js';
import { debugLog } from './utils.js';

/**
 * Module namespace
 */
class SharedControl {
  constructor() {
    this.stateMachine = null;
    this.rulerPreview = null;
    this.touchWorkflow = null;
    this.overlayControls = null;
    this.compatibility = null;
    this.socket = null;
  }

  /**
   * Initialize the module
   */
  async initialize() {
    debugLog('Initializing module');

    try {
      // Check if module is enabled
      const enabled = game.settings.get('shared-control', 'enabled');
      debugLog('Module enabled setting:', enabled);

      if (!enabled) {
        debugLog('Module is disabled in settings');
        return;
      }

      // Create core components
      debugLog('Creating core components');
      this.stateMachine = new MovementStateMachine();
      this.rulerPreview = new RulerPreview();
      this.touchWorkflow = new TouchWorkflowHandler(this.stateMachine, this.rulerPreview);

      // Initialize touch workflow
      debugLog('Initializing touch workflow');
      this.touchWorkflow.initialize();

      // Initialize overlay controls
      debugLog('Initializing overlay controls');
      this.overlayControls = new OverlayControls();
      this.overlayControls.initialize();

      // Setup socket for broadcast functionality
      this.setupSocket();

      // Attach canvas listener if canvas is already ready
      if (canvas?.stage) {
        debugLog('Canvas already ready, attaching listener now');
        this.setupCanvas();
      }

      debugLog('Module initialized successfully');
    } catch (error) {
      console.error('SharedControl | Error during initialization:', error);
      // Clean up on error
      this.destroy();
    }
  }

  /**
   * Setup socket for GM broadcast and token locking functionality
   */
  setupSocket() {
    this.socket = game.socket;
    console.log('SharedControl: Setting up socket listener');

    // Listen for socket messages
    this.socket.on('module.shared-control', (data) => {
      console.log('SharedControl: Socket message received:', data);

      // Handle token lock/unlock from any user
      if (data.action === 'lockToken') {
        // Don't process our own lock messages
        if (data.userId === game.user.id) {
          console.log('SharedControl: Ignoring our own lock message');
          return;
        }

        console.log('SharedControl: Processing remote lock for token:', data.tokenId, 'by user:', data.userId);
        this.stateMachine?.lockToken(data.tokenId, data.userId);
        console.log('SharedControl: Lock applied, current locks:', Array.from(this.stateMachine?.lockedTokens?.entries() || []));
        return;
      }

      if (data.action === 'unlockToken') {
        // Don't process our own unlock messages
        if (data.userId === game.user.id) {
          console.log('SharedControl: Ignoring our own unlock message');
          return;
        }

        console.log('SharedControl: Processing remote unlock for token:', data.tokenId);
        this.stateMachine?.unlockToken(data.tokenId);
        return;
      }

      // Pan broadcasts are GM-only
      if (game.user.isGM) return;

      if (data.action === 'pan') {
        canvas.animatePan({
          x: data.x,
          y: data.y,
          scale: data.scale,
          duration: data.duration || 250
        });
      }
    });

    debugLog('Socket listener registered');
  }

  /**
   * Broadcast token lock to all clients
   * @param {String} tokenId - Token ID to lock
   */
  broadcastLock(tokenId) {
    const message = {
      action: 'lockToken',
      tokenId: tokenId,
      userId: game.user.id
    };
    console.log('SharedControl: Broadcasting lock message:', message);
    game.socket.emit('module.shared-control', message);
  }

  /**
   * Broadcast token unlock to all clients
   * @param {String} tokenId - Token ID to unlock
   */
  broadcastUnlock(tokenId) {
    console.log('SharedControl: Broadcasting unlock for token:', tokenId);
    game.socket.emit('module.shared-control', {
      action: 'unlockToken',
      tokenId: tokenId,
      userId: game.user.id
    });
  }

  /**
   * Broadcast pan/zoom to all players (GM only)
   * @param {Object} panData - Pan data {x, y, scale, duration}
   */
  broadcastPan(panData) {
    if (!game.user.isGM) return;

    game.socket.emit('module.shared-control', {
      action: 'pan',
      x: panData.x,
      y: panData.y,
      scale: panData.scale,
      duration: panData.duration || 250
    });

    debugLog('Broadcast pan:', panData);
  }

  /**
   * Setup when canvas is ready
   */
  setupCanvas() {
    if (!game.settings.get('shared-control', 'enabled')) return;

    // Check if touch workflow was initialized
    if (!this.touchWorkflow) {
      debugLog('Touch workflow not initialized, skipping canvas setup');
      return;
    }

    debugLog('Setting up canvas');

    // Attach canvas listener
    this.touchWorkflow.attachCanvasListener();
  }

  /**
   * Clean up and destroy the module
   */
  destroy() {
    debugLog('Destroying module');

    if (this.touchWorkflow) {
      this.touchWorkflow.destroy();
      this.touchWorkflow = null;
    }

    if (this.overlayControls) {
      this.overlayControls.destroy();
      this.overlayControls = null;
    }

    // Destroy stateMachine first (needs rulerPreview for cleanup)
    if (this.stateMachine) {
      this.stateMachine.destroy(this.rulerPreview);
      this.stateMachine = null;
    }

    if (this.rulerPreview) {
      this.rulerPreview.destroy();
      this.rulerPreview = null;
    }
  }
}

/**
 * Foundry VTT Hooks
 */

// Initialize on Foundry init
Hooks.once('init', async () => {
  // Register module settings
  registerSettings();

  // Create global module instance
  game.sharedControl = new SharedControl();

  // CRITICAL: Wrap Token methods NOW, before any tokens are created
  // This must happen in 'init' before 'canvasReady' fires
  wrapTokenMethodsEarly();
});

// Debug: Check socket availability at different hooks
Hooks.once('setup', () => {
  console.log('SharedControl [setup]: game.socket exists?', !!game.socket);
});

Hooks.once('ready', () => {
  console.log('SharedControl [ready]: game.socket exists?', !!game.socket);
  console.log('SharedControl [ready]: game.socket.connected?', game.socket?.connected);

  if (!game.socket) {
    console.error('SharedControl: game.socket is not available!');
    return;
  }

  console.log('SharedControl: Registering socket listener in ready hook');

  game.socket.on('module.shared-control', (data) => {
    console.log('SharedControl: Socket message received from user', data.userId, ':', data);

    // Handle test ping
    if (data.action === 'test') {
      console.log('SharedControl: TEST PING received from', data.userName, '- Socket is working!');
      ui.notifications.info(`Socket test from ${data.userName} received!`);
      return;
    }

    // Handle token lock/unlock from any user
    if (data.action === 'lockToken') {
      if (data.userId === game.user.id) {
        console.log('SharedControl: Ignoring our own lock message');
        return;
      }
      console.log('SharedControl: Processing remote lock for token:', data.tokenId, 'by user:', data.userId);
      game.sharedControl?.stateMachine?.lockToken(data.tokenId, data.userId);
      console.log('SharedControl: Lock applied, current locks:',
        Array.from(game.sharedControl?.stateMachine?.lockedTokens?.entries() || []));
      return;
    }

    if (data.action === 'unlockToken') {
      if (data.userId === game.user.id) {
        console.log('SharedControl: Ignoring our own unlock message');
        return;
      }
      console.log('SharedControl: Processing remote unlock for token:', data.tokenId);
      game.sharedControl?.stateMachine?.unlockToken(data.tokenId);
      return;
    }

    // Pan broadcasts - only non-GMs respond
    if (game.user.isGM) return;

    if (data.action === 'pan') {
      canvas.animatePan({
        x: data.x,
        y: data.y,
        scale: data.scale,
        duration: data.duration || 250
      });
    }
  });

  console.log('SharedControl: Socket listener registered');

  // Add a test function to verify socket works
  window.testSharedControlSocket = () => {
    console.log('SharedControl: Sending test ping via game.socket...');
    console.log('SharedControl: game.socket =', game.socket);
    game.socket.emit('module.shared-control', {
      action: 'test',
      userId: game.user.id,
      userName: game.user.name,
      timestamp: Date.now()
    });
  };
  console.log('SharedControl: Run testSharedControlSocket() in console to test socket');
});

/**
 * Wrap Token methods early (before tokens are created on canvas)
 */
function wrapTokenMethodsEarly() {
  const TokenClass = CONFIG.Token.objectClass;

  // Store original methods
  const originalClickLeft = TokenClass.prototype._onClickLeft;
  const originalDragLeftStart = TokenClass.prototype._onDragLeftStart;

  // Inject tap handler onto Token prototype
  TokenClass.prototype._sharedControlHandleTokenTap = function(wrapped, event) {
    const token = this;
    const stateMachine = game.sharedControl?.stateMachine;
    const rulerPreview = game.sharedControl?.rulerPreview;
    const currentState = stateMachine?.getState() || 'IDLE';

    debugLog('Token tap, current state:', currentState, 'token:', token.name);

    // If we're in AWAITING_DESTINATION or PREVIEWING_PATH
    if (currentState === 'AWAITING_DESTINATION' || currentState === 'PREVIEWING_PATH') {
      const selectedToken = stateMachine.selectedToken;

      // If user taps the SAME token that's selected, cancel the movement
      if (selectedToken?.id === token.id) {
        debugLog('Same token re-tapped, canceling movement');
        stateMachine.cancelMovement(rulerPreview);
        return false; // Prevent default behavior
      }

      // If user taps a DIFFERENT token, cancel current workflow and select new token
      debugLog('Different token tapped, switching to new token:', token.name);
      stateMachine.cancelMovement(rulerPreview);
      // Fall through to select the new token
    }

    // Select this token (either from IDLE or after canceling previous workflow)
    debugLog('Selecting token:', token.name);
    if (stateMachine) {
      stateMachine.selectToken(token, rulerPreview);
    }
    return wrapped.call(this, event); // Allow default control behavior
  };

  // Wrap click handler
  TokenClass.prototype._onClickLeft = function(event) {
    debugLog('Token click intercepted');

    if (!game.settings.get('shared-control', 'enabled')) {
      debugLog('Module disabled, using original behavior');
      return originalClickLeft.call(this, event);
    }

    debugLog('Module enabled, using tap workflow');
    return this._sharedControlHandleTokenTap(originalClickLeft.bind(this), event);
  };

  // Wrap drag start
  TokenClass.prototype._onDragLeftStart = function(event) {
    debugLog('Drag start intercepted');

    if (game.settings.get('shared-control', 'enabled')) {
      debugLog('Preventing drag (using tap workflow)');
      event.stopPropagation();
      event.preventDefault();
      return false;
    }

    debugLog('Module disabled, allowing drag');
    return originalDragLeftStart.call(this, event);
  };

  debugLog('Token methods wrapped early (before canvas creation)');
}

// Setup on Foundry ready
Hooks.once('ready', async () => {
  // Check compatibility with other modules
  game.sharedControl.compatibility = checkCompatibility();

  // Initialize the module
  await game.sharedControl.initialize();

  debugLog('Module ready');
});

// Setup canvas when it's ready
Hooks.on('canvasReady', async () => {
  if (!game.sharedControl) return;

  debugLog('Canvas ready hook');
  game.sharedControl.setupCanvas();
});

// Clean up on window unload
Hooks.once('closeSettingsConfig', () => {
  // Settings may have changed, reinitialize if needed
  const enabled = game.settings.get('shared-control', 'enabled');

  if (enabled && !game.sharedControl.touchWorkflow) {
    // Module was just enabled
    game.sharedControl.initialize();
  } else if (!enabled && game.sharedControl.touchWorkflow) {
    // Module was just disabled
    game.sharedControl.destroy();
  }
});

/**
 * Export for debugging purposes
 */
export default SharedControl;
