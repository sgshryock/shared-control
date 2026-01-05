/**
 * SharedControl Settings Registration
 * Registers module settings for Foundry VTT v13
 */

export function registerSettings() {
  // World setting: Master toggle
  game.settings.register('shared-control', 'enabled', {
    name: game.i18n.localize('shared-control.settings.enabled.name'),
    hint: game.i18n.localize('shared-control.settings.enabled.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  // User setting: Touch-only mode (now just controls cursor visibility)
  game.settings.register('shared-control', 'touchOnlyMode', {
    name: game.i18n.localize('shared-control.settings.touchOnlyMode.name'),
    hint: game.i18n.localize('shared-control.settings.touchOnlyMode.hint'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: value => {
      // Notify the touch workflow handler to update cursor visibility
      if (game.sharedControl?.touchWorkflow) {
        game.sharedControl.touchWorkflow.updateTouchOnlyMode(value);
      }
    }
  });

  // World setting: Tap timeout (how long the path preview stays active)
  game.settings.register('shared-control', 'tapTimeout', {
    name: game.i18n.localize('shared-control.settings.tapTimeout.name'),
    hint: game.i18n.localize('shared-control.settings.tapTimeout.hint'),
    scope: 'world',
    config: true,
    type: Number,
    default: 300000,  // 5 minutes
    range: {
      min: 10000,     // 10 seconds minimum
      max: 600000,    // 10 minutes maximum
      step: 10000     // 10 second increments
    }
  });

  // World setting: Tap tolerance
  game.settings.register('shared-control', 'tapTolerance', {
    name: game.i18n.localize('shared-control.settings.tapTolerance.name'),
    hint: game.i18n.localize('shared-control.settings.tapTolerance.hint'),
    scope: 'world',
    config: true,
    type: Number,
    default: 25,
    range: {
      min: 10,
      max: 100,
      step: 5
    }
  });

  // World setting: Track movement distance
  game.settings.register('shared-control', 'trackMovement', {
    name: 'Track Movement Distance',
    hint: 'Color-code movement paths based on character speed (green = allowed, yellow = slightly over, red = too far). Reads movement speed from character sheet.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  // World setting: Animation speed
  game.settings.register('shared-control', 'animationSpeed', {
    name: game.i18n.localize('shared-control.settings.animationSpeed.name'),
    hint: game.i18n.localize('shared-control.settings.animationSpeed.hint'),
    scope: 'world',
    config: true,
    type: Number,
    default: 200,
    range: {
      min: 50,
      max: 500,
      step: 25
    }
  });

  // World setting: Debug mode
  game.settings.register('shared-control', 'debugMode', {
    name: game.i18n.localize('shared-control.settings.debugMode.name'),
    hint: game.i18n.localize('shared-control.settings.debugMode.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  // World setting: Enable touch gestures for pan/zoom
  game.settings.register('shared-control', 'enableGestures', {
    name: game.i18n.localize('shared-control.settings.enableGestures.name'),
    hint: game.i18n.localize('shared-control.settings.enableGestures.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  // World setting: Controls locked state
  game.settings.register('shared-control', 'controlsLocked', {
    name: 'Controls Locked',
    hint: 'Internal setting to track lock state',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    onChange: value => {
      if (game.sharedControl?.overlayControls) {
        game.sharedControl.overlayControls.updateLockState(value);
      }
    }
  });

  // World setting: Roles that can see the lock button
  game.settings.register('shared-control', 'lockButtonRoles', {
    name: game.i18n.localize('shared-control.settings.lockButtonRoles.name'),
    hint: game.i18n.localize('shared-control.settings.lockButtonRoles.hint'),
    scope: 'world',
    config: true,
    type: Number,
    default: CONST.USER_ROLES.GAMEMASTER,
    choices: {
      [CONST.USER_ROLES.PLAYER]: game.i18n.localize('shared-control.settings.lockButtonRoles.player'),
      [CONST.USER_ROLES.TRUSTED]: game.i18n.localize('shared-control.settings.lockButtonRoles.trusted'),
      [CONST.USER_ROLES.ASSISTANT]: game.i18n.localize('shared-control.settings.lockButtonRoles.assistant'),
      [CONST.USER_ROLES.GAMEMASTER]: game.i18n.localize('shared-control.settings.lockButtonRoles.gm')
    }
  });

  // User setting: Show overlay controls (zoom/pan buttons)
  game.settings.register('shared-control', 'showOverlayControls', {
    name: game.i18n.localize('shared-control.settings.showOverlayControls.name'),
    hint: game.i18n.localize('shared-control.settings.showOverlayControls.hint'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
    onChange: value => {
      if (game.sharedControl?.overlayControls) {
        if (value) {
          game.sharedControl.overlayControls.show();
        } else {
          game.sharedControl.overlayControls.hide();
        }
      }
    }
  });

  // User setting: Overlay button size
  game.settings.register('shared-control', 'overlayButtonSize', {
    name: game.i18n.localize('shared-control.settings.overlayButtonSize.name'),
    hint: game.i18n.localize('shared-control.settings.overlayButtonSize.hint'),
    scope: 'client',
    config: true,
    type: Number,
    default: 50,
    range: {
      min: 30,
      max: 80,
      step: 5
    },
    onChange: value => {
      if (game.sharedControl?.overlayControls) {
        game.sharedControl.overlayControls.updateButtonSize(value);
      }
    }
  });

  // User setting: Overlay position
  game.settings.register('shared-control', 'overlayPosition', {
    name: game.i18n.localize('shared-control.settings.overlayPosition.name'),
    hint: game.i18n.localize('shared-control.settings.overlayPosition.hint'),
    scope: 'client',
    config: true,
    type: String,
    default: 'left-center',
    choices: {
      'left-top': game.i18n.localize('shared-control.settings.overlayPosition.leftTop'),
      'left-center': game.i18n.localize('shared-control.settings.overlayPosition.leftCenter'),
      'left-bottom': game.i18n.localize('shared-control.settings.overlayPosition.leftBottom'),
      'right-top': game.i18n.localize('shared-control.settings.overlayPosition.rightTop'),
      'right-center': game.i18n.localize('shared-control.settings.overlayPosition.rightCenter'),
      'right-bottom': game.i18n.localize('shared-control.settings.overlayPosition.rightBottom')
    },
    onChange: value => {
      if (game.sharedControl?.overlayControls) {
        game.sharedControl.overlayControls.updatePosition(value);
      }
    }
  });
}
