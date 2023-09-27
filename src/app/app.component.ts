import { Component, OnInit, ViewEncapsulation } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { WebSocketTunnel } from "guacamole-common-ts";
import * as FileSaver from "file-saver";

import { RemoteDesktopService, TunnelRestApiService } from "remote-desktop";
import { MatDialog } from "@angular/material/dialog";
import { ClipboardModalComponent } from "./components/clipboard-modal.component";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./themes/default.scss", "./app.component.scss"],
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
  public fileManagerVisible: boolean = false;

  constructor(
    private snackBar: MatSnackBar,
    public dialog: MatDialog,
    public remoteDesktopService: RemoteDesktopService,
    public tunnelRestApiService: TunnelRestApiService,
    ) {
  }

  handleTakeScreenshot(): void {
    this.remoteDesktopService.createScreenshot(blob => {
      if (blob) {
        FileSaver.saveAs(blob, `screenshot.png`);
      }
    });
  }

  createModal(classRef) {
    this.remoteDesktopService.setFocused(false);
    let dialogRef = this.dialog.open(classRef, {
      height: "400px",
      width: "400px",
      data: {manager: this.remoteDesktopService, text: ""}
    });
    return dialogRef.afterClosed();
  }

  handleDisconnect(): void {
    this.remoteDesktopService.getClient().disconnect();
  }

  handleEnterFullScreen() {
    this.remoteDesktopService.setFullScreen(true);
  }

  handleExitFullScreen() {
    this.remoteDesktopService.setFullScreen(false);
  }

  handleClipboard(): void {
    const modal = this.createModal(ClipboardModalComponent);
    modal.subscribe((text) => {
      this.remoteDesktopService.setFocused(true);
      if (text) {
        this.remoteDesktopService.sendRemoteClipboardData(text);
        this.snackBar.open("Sent to remote clipboard", "OK", {
          duration: 2000,
        });
      }
    }, () => this.remoteDesktopService.setFocused(true));
  }

  toggleFileManager() {
    this.fileManagerVisible = !this.fileManagerVisible;
  }

  ngOnInit() {
    // Setup connection to API for both the websocket and the ReST service

    // Setup tunnel. The tunnel can be either: WebsocketTunnel, HTTPTunnel or ChainedTunnel
    //const tunnel = new WebSocketTunnel("ws://localhost:4200/be/websocket-tunnel");
    const tunnel = new WebSocketTunnel("ws://localhost:4567/websocket-tunnel")
    this.tunnelRestApiService.initialize("http://localhost:4567")
    this.remoteDesktopService.initialize(tunnel);

    this.connect();
    this.remoteDesktopService.onRemoteClipboardData.subscribe(text => {
      const snackbar = this.snackBar.open("Received from remote clipboard", "OPEN CLIPBOARD", {
        duration: 1500,
      });
      snackbar.onAction().subscribe(() => this.handleClipboard());
    });
    this.remoteDesktopService.onReconnect.subscribe(reconnect => this.connect());
  }

  connect() {
    // You'll want to inject the token and other parameters from your own app
    const token = "ABCDEFGH";
    const parameters = {
      "token": token,
      "hostname": "192.168.1.10",
      "password": "testuser",
      "scheme": "vnc",
      "port": "59000",
      "enable-sftp": "true",
      "sftp-hostname": "192.168.1.10",
      "sftp-port": "2222",
      "sftp-username": "testuser",
      "sftp-password": "testuser"
    };
    this.tunnelRestApiService.setToken(token);
    this.remoteDesktopService.connect(parameters);
  }
}
