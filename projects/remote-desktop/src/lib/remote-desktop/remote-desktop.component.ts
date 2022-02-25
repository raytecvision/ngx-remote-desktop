import {animate, state, style, transition, trigger,} from '@angular/animations';
import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ElementRef,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import {BehaviorSubject, Subscription, timer} from 'rxjs';
import * as screenfull from 'screenfull';

import {RemoteDesktopService} from '../remote-desktop.service';
import {ConnectingMessageComponent} from '../messages/connecting-message.component';
import {DisconnectedMessageComponent} from '../messages/disconnected-message.component';
import {ErrorMessageComponent} from '../messages/error-message.component';
import {FileManagerComponent} from '../file-manager/file-manager.component';
import {finalize, takeWhile} from 'rxjs/operators';
import {ManagedFilesystemService} from '../managed-filesystem.service';

/**
 * The main component for displaying a remote desktop
 */
@Component({
  selector: 'ngx-remote-desktop',
  template: `
    <div class="ngx-remote-desktop" #container>
      <!-- Toolbar items template -->
      <ng-template #toolbarItems>
        <ul class="ngx-remote-desktop-toolbar-items">
          <ng-content
            select="ngx-remote-desktop-toolbar-item[align=left]"
          ></ng-content>
        </ul>
        <ul class="ngx-remote-desktop-toolbar-items">
          <ng-content
            select="ngx-remote-desktop-toolbar-item[align=right]"
          ></ng-content>
        </ul>
      </ng-template>

      <!-- Normal toolbar -->
      <nav class="ngx-remote-desktop-toolbar" *ngIf="!remoteDesktopService.isFullScreen()">
        <template [ngTemplateOutlet]="toolbarItems"></template>
      </nav>

      <!-- Full screen toolbar -->
      <nav
        class="ngx-remote-desktop-toolbar ngx-remote-desktop-toolbar-fullscreen"
        *ngIf="remoteDesktopService.isFullScreen()"
        [@toolbarAnimation]="toolbarVisible"
        #toolbar
      >
        <template [ngTemplateOutlet]="toolbarItems"></template>
      </nav>

      <section class="ngx-remote-desktop-container">
        <!-- Connecting message -->
        <div *ngIf="(state | async) === states.CONNECTING">
          <div class="ngx-remote-desktop-message" *ngIf="connectingMessage">
            <ng-content
              select="ngx-remote-desktop-connecting-message"
            ></ng-content>
          </div>
          <ngx-remote-desktop-message
            *ngIf="!connectingMessage"
            title="Connecting to remote desktop"
            message="Attempting to connect to the remote desktop. Waiting for response..."
            type="success"
          >
          </ngx-remote-desktop-message>
        </div>

        <!-- Disconnected message -->
        <div *ngIf="(state | async) === states.DISCONNECTED">
          <div class="ngx-remote-desktop-message" *ngIf="disconnectedMessage">
            <ng-content
              select="ngx-remote-desktop-disconnected-message"
            ></ng-content>
          </div>
          <ngx-remote-desktop-message
            *ngIf="!disconnectedMessage"
            title="Disconnected"
            message="The connection to the remote desktop terminated successfully"
            type="error"
          >
            <button
              (click)="remoteDesktopService.onReconnect.next(true)"
              class="ngx-remote-desktop-message-body-btn"
            >
              Reconnect
            </button>
          </ngx-remote-desktop-message>
        </div>

        <!-- Error message -->
        <div *ngIf="(state | async) === states.ERROR">
          <div class="ngx-remote-desktop-message" *ngIf="errorMessage">
            <ng-content select="ngx-remote-desktop-error-message"></ng-content>
          </div>

          <ngx-remote-desktop-message
            *ngIf="!errorMessage"
            title="Connection error"
            message="The remote desktop server is currently unreachable."
            type="error"
          >
            <button
              (click)="remoteDesktopService.onReconnect.next(true)"
              class="ngx-remote-desktop-message-body-btn"
            >
              Connect
            </button>
          </ngx-remote-desktop-message>
        </div>

        <!-- Display -->
        <ngx-remote-desktop-display
          *ngIf="(state | async) === states.CONNECTED"
          [manager]="remoteDesktopService"
          (onMouseMove)="handleDisplayMouseMove($event)"
        >
        </ngx-remote-desktop-display>

        <!-- File manager -->
        <div class="file-manager-dialog" [class.show]="showFileManager">
          <ng-content select="ngx-remote-desktop-file-manager"></ng-content>
        </div>

        <!-- File transfers -->
        <div id="file-transfer-dialog" *ngIf="hasTransfers()">
          <ngx-file-transfer-manager></ngx-file-transfer-manager>
        </div>
      </section>



      <section
        [class.ngx-remote-desktop-status-bar-hidden]="remoteDesktopService.isFullScreen()"
      >

      </section>
    </div>
  `,
  styleUrls: ['./remote-desktop.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Default,
  animations: [
    trigger('toolbarAnimation', [
      state('1', style({transform: 'translateX(0%)'})),
      state('0', style({transform: 'translateX(-100%)'})),
      transition('1 => 0', animate('200ms 200ms ease-out')),
      transition('0 => 1', animate('225ms ease-in')),
    ]),
  ],
})
export class RemoteDesktopComponent implements OnInit, OnDestroy {
  /**
   * Guacamole has more states than the list below however for the component we are only interested
   * in managing four states.
   */
  public states = {
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
    ERROR: 'ERROR',
  };

  /**
   * Manage the component state
   */
  public state: BehaviorSubject<string> = new BehaviorSubject<string>(
    this.states.CONNECTING
  );

  @Input() showFileManager: boolean;

  @ContentChild(ConnectingMessageComponent, {static: true})
  public connectingMessage: ConnectingMessageComponent;

  @ContentChild(DisconnectedMessageComponent, {static: true})
  public disconnectedMessage: DisconnectedMessageComponent;

  @ContentChild(ErrorMessageComponent, {static: true})
  public errorMessage: ErrorMessageComponent;

  @ViewChild('container', {static: true})
  private container: ElementRef;

  @ViewChild('toolbar', {static: true})
  private toolbar: ElementRef;

  @ContentChild(FileManagerComponent)
  private fileManager: FileManagerComponent

  /**
   * Subscriptions
   */
  private subscriptions: Subscription[] = [];

  /**
   * Hide or show elements
   */
  public toolbarVisible: boolean = true;

  /**
   * Whether a drag/drop operation is currently in progress (the user has
   * dragged a file over the Guacamole connection but has not yet dropped it).
   */
  @HostBinding('class.drop-zone-active')
  public dropPending: boolean;

  constructor(
    public remoteDesktopService: RemoteDesktopService,
    private fsService: ManagedFilesystemService,
  ) {
  }

  /**
   * Subscribe to the connection state  and full screen state when the component is initialised
   */
  ngOnInit(): void {
    this.bindSubscriptions();
  }

  /**
   * Remove all subscriptions when the component is destroyed
   */
  ngOnDestroy(): void {
    this.unbindSubscriptions();
  }

  public hasTransfers(): boolean {
    const u = this.remoteDesktopService.getUploads();
    return !!(u && u.length);
  };

  /**
   * Bind the subscriptions
   */
  private bindSubscriptions(): void {
    this.subscriptions.push(
      this.remoteDesktopService.onStateChange.subscribe(this.handleState.bind(this))
    );
    this.subscriptions.push(
      this.remoteDesktopService.onFullScreen.subscribe(this.handleFullScreen.bind(this))
    );
  }

  /**
   * Unbind the subscriptions
   */
  private unbindSubscriptions(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  /**
   * Set the component state to the new guacamole state
   * @param newState
   */
  private setState(newState: string): void {
    this.state.next(newState);
  }

  /**
   * Receive the state from the desktop client and update this components state
   * @param newState - state received from the guacamole client
   */
  private handleState(newState: string) {
    switch (newState) {
      case RemoteDesktopService.STATE.CONNECTED:
        this.setState(this.states.CONNECTED);
        break;
      case RemoteDesktopService.STATE.DISCONNECTED:
        this.exitFullScreen();
        this.setState(this.states.DISCONNECTED);
        break;
      case RemoteDesktopService.STATE.CONNECTING:
      case RemoteDesktopService.STATE.WAITING:
        this.setState(this.states.CONNECTING);
        break;
      case RemoteDesktopService.STATE.CLIENT_ERROR:
      case RemoteDesktopService.STATE.TUNNEL_ERROR:
        this.exitFullScreen();
        this.setState(this.states.ERROR);
        break;
    }
  }

  /**
   * Exit full screen and show the toolbar
   */
  private exitFullScreen(): void {
    if (!screenfull.isEnabled) {
      return
    }

    if (!screenfull.isFullscreen) {
      return;
    }

    screenfull.exit();
  }

  /**
   * Enter full screen mode and auto hide the toolbar
   */
  private enterFullScreen(): void {
    if (!screenfull.isEnabled) {
      return;
    }

    if (screenfull.isFullscreen) {
      return;
    }

    const containerElement = this.container.nativeElement;
    if (screenfull.isEnabled) {
      screenfull.on('change', (change: any) => {
        if (!screenfull.isEnabled) {
          return;
        }
        if (!screenfull.isFullscreen) {
          this.remoteDesktopService.setFullScreen(false);
        }
        this.handleToolbar();
      });
    }
  }

  /**
   * Go in and out of full screen
   */
  private handleFullScreen(newFullScreen: boolean): void {
    if (newFullScreen) {
      this.enterFullScreen();
    } else {
      this.exitFullScreen();
    }
  }

  private handleToolbar(): void {
    this.toolbarVisible = this.remoteDesktopService.isFullScreen() ? false : true;
  }

  /**
   * Handle the display mouse movement
   * @param event Mouse event
   */
  public handleDisplayMouseMove($event: any): void {
    if (!this.remoteDesktopService.isFullScreen()) {
      return;
    }
    const toolbarWidth = this.toolbar.nativeElement.clientWidth;
    if ($event.x >= toolbarWidth) {
      this.toolbarVisible = false;
    }
  }

  @HostListener('document:mousemove', ['$event'])
  private onDocumentMousemove($event: MouseEvent) {
    if (!this.remoteDesktopService.isFullScreen()) {
      return;
    }
    const toolbarWidth = this.toolbar.nativeElement.clientWidth;
    const x = $event.x;
    if (x >= -1 && x <= 0) {
      this.toolbarVisible = true;
    }
    if (x >= toolbarWidth) {
      this.toolbarVisible = false;
    }
  }

  @HostListener('dragenter', ['$event'])
  @HostListener('dragover', ['$event'])
  /**
   * Displays a visual indication that dropping the file currently
   * being dragged is possible. Further propagation and default behavior
   * of the given event is automatically prevented.
   */
  notifyDragStart(e) {

    e.preventDefault();
    e.stopPropagation();

    this.dropPending = true;
  };

  @HostListener('dragleave', ['$event'])
  /**
   * Removes the visual indication that dropping the file currently
   * being dragged is possible. Further propagation and default behavior
   * of the given event is automatically prevented.
   */
  notifyDragEnd(e) {

    e.preventDefault();
    e.stopPropagation();

    this.dropPending = false;
  };

  @HostListener('drop', ['$event'])
  dropFile(e) {
    this.notifyDragEnd(e)

    // Upload each file
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const ul = this.remoteDesktopService.uploadFile(files[i], this.fileManager.fs, this.fileManager.fs.currentDirectory);

      // Refresh filesystem when it's complete
      timer(0, 100).pipe(
        takeWhile(() => !ul.isCompleted()),
        finalize(() => {
          console.log('Refreshing FS')
          this.fsService.refresh(this.fileManager.fs, this.fileManager.fs.currentDirectory).then()
        })
      ).subscribe()
    }
  };
}
