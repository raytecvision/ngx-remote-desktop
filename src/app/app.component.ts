import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WebSocketTunnel } from '@raytecvision/guacamole-common-js';
import * as FileSaver from 'file-saver';

import { RemoteDesktopService } from 'remote-desktop';
import {MatDialog} from '@angular/material/dialog';
import { ClipboardModalComponent } from './components/clipboard-modal.component';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./themes/default.scss', './app.component.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
    public manager: RemoteDesktopService;

    constructor(private snackBar: MatSnackBar, public dialog: MatDialog) {}

    handleScreenshot(): void {
        this.manager.createScreenshot(blob => {
            if (blob) {
                FileSaver.saveAs(blob, `screenshot.png`);
            }
        });
    }

    createModal(classRef) {
        this.manager.setFocused(false);
        let dialogRef = this.dialog.open(classRef, {
            height: '400px',
            width: '400px',
            data: { manager: this.manager, text: ""}
          });
          return dialogRef.afterClosed();
    }

    handleDisconnect(): void {
        this.manager.getClient().disconnect();
    }

    handleEnterFullScreen() {
        this.manager.setFullScreen(true);
    }

    handleExitFullScreen() {
        this.manager.setFullScreen(false);
    }

    handleClipboard(): void {
        const modal = this.createModal(ClipboardModalComponent);
        modal.subscribe((text) => {
            this.manager.setFocused(true);
            if (text) {
                this.manager.sendRemoteClipboardData(text);
                this.snackBar.open('Sent to remote clipboard', 'OK', {
                    duration: 2000,
                });
            }
        }, () => this.manager.setFocused(true));
    }

    handleConnect() {
        const parameters = {
            scheme: 'telnet',
            hostname: 'towel.blinkenlights.nl',
            image: 'image/png',
            audio: 'audio/L16',
            dpi: 96,
            width: window.screen.width,
            height: window.screen.height
        };
        /*
         * The manager will establish a connection to: 
         * ws://localhost:8080?ws?ip={address}&image=image/png&audio=audio/L16&dpi=96&width=n&height=n
         */
        this.manager.connect(parameters);
    }

    ngOnInit() {
        // Setup tunnel. The tunnel can be either: WebsocketTunnel, HTTPTunnel or ChainedTunnel
        const tunnel = new WebSocketTunnel('ws://localhost:8080/websocket-tunnel');
        /**
         *  Create an instance of the remote desktop manager by 
         *  passing in the tunnel
         */
        this.manager = new RemoteDesktopService(tunnel);
        this.handleConnect();
        this.manager.onRemoteClipboardData.subscribe(text => {
            const snackbar = this.snackBar.open('Received from remote clipboard', 'OPEN CLIPBOARD', {
                duration: 1500,
            });
            snackbar.onAction().subscribe(() => this.handleClipboard());
        });
        this.manager.onReconnect.subscribe(reconnect => this.handleConnect());
    }

}
