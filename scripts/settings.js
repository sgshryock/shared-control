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
}
