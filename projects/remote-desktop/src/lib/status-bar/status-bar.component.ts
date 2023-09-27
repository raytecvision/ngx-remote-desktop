import {Component} from '@angular/core';

@Component({
  selector: 'guacamole-remote-desktop-status-bar',
  template: `<ng-content
    select="guacamole-remote-desktop-status-bar-item"
  ></ng-content>`,
  host: {
    class: 'guacamole-remote-desktop-status-bar',
  },
})
export class StatusBarComponent {}
