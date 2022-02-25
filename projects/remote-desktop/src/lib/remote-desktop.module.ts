import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';

import {HttpClientModule} from '@angular/common/http';

import {RemoteDesktopComponent} from './remote-desktop/remote-desktop.component';
import {StatusBarComponent} from './status-bar/status-bar.component';
import {MessageComponent} from './message/message.component';
import {StatusBarItemComponent} from './status-bar-item/status-bar-item.component';
import {DisplayComponent} from './display/display.component';
import {ErrorMessageComponent} from './messages/error-message.component';
import {DisconnectedMessageComponent} from './messages/disconnected-message.component';
import {ConnectingMessageComponent} from './messages/connecting-message.component';
import {ToolbarItemComponent} from './toolbar-item/toolbar-item.component';
import {FileManagerComponent} from './file-manager/file-manager.component';
import {FileTransferManagerComponent} from './file-transfer-manager/file-transfer-manager.component';
import {FileTransferComponent} from './file-transfer/file-transfer.component';

@NgModule({
  declarations: [
    RemoteDesktopComponent,
    ToolbarItemComponent,
    MessageComponent,
    DisplayComponent,
    ErrorMessageComponent,
    DisconnectedMessageComponent,
    ConnectingMessageComponent,
    StatusBarComponent,
    StatusBarItemComponent,
    FileManagerComponent,
    FileTransferManagerComponent,
    FileTransferComponent,
  ],
  imports: [CommonModule, BrowserAnimationsModule, HttpClientModule],
  exports: [
    RemoteDesktopComponent,
    ToolbarItemComponent,
    ErrorMessageComponent,
    DisconnectedMessageComponent,
    ConnectingMessageComponent,
    StatusBarComponent,
    StatusBarItemComponent,
    FileManagerComponent,
  ],
})
export class RemoteDesktopModule {}
