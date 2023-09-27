import {Component} from '@angular/core';

/**
 * Status bar item component
 */
@Component({
  selector: 'guacamole-remote-desktop-status-bar-item',
  template: `<ng-content></ng-content>`,
  host: {
    class: 'guacamole-remote-desktop-status-bar-item',
  },
})
export class StatusBarItemComponent {}
