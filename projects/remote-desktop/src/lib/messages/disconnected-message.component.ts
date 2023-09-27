import {Component} from '@angular/core';

@Component({
    selector: 'guacamole-remote-desktop-disconnected-message',
    host: { class: 'guacamole-remote-desktop-message'},
    template: `
        <ng-content></ng-content>
    `
})
export class DisconnectedMessageComponent {
}
