import {Injectable} from '@angular/core';
import {HttpParams} from '@angular/common/http';
import {Client, InputStream, Object, Status, StringReader, Tunnel} from '@raytecvision/guacamole-common-js';
import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs';
import {File as ManagedFile, FileType, ManagedFilesystem} from './managed-filesystem';
import {ManagedFilesystemService} from './managed-filesystem.service';
import {ManagedFileTransferState, ManagedFileUpload, StreamState} from './managed-file-upload';
import {TunnelRestApiService} from './tunnel-rest-api.service';

/**
 * Manages the connection to the remote desktop
 */
@Injectable({
  providedIn: 'root',
})
export class RemoteDesktopService {
  static STATE = {
    /**
     * The machine connection has not yet been attempted.
     */
    IDLE: 'IDLE',

    /**
     * The machine connection is being established.
     */
    CONNECTING: 'CONNECTING',

    /**
     * The machine connection has been successfully established, and the
     * client is now waiting for receipt of initial graphical data.
     */
    WAITING: 'WAITING',

    /**
     * The Guacamole connection has been successfully established, and
     * initial graphical data has been received.
     */
    CONNECTED: 'CONNECTED',

    /**
     * The machine connection has terminated successfully. No errors are
     * indicated.
     */
    DISCONNECTED: 'DISCONNECTED',

    /**
     * The machine connection has terminated due to an error reported by
     * the client. The associated error code is stored in statusCode.
     *
     */
    CLIENT_ERROR: 'CLIENT_ERROR',

    /**
     * The machine connection has terminated due to an error reported by
     * the tunnel. The associated error code is stored in statusCode.
     */
    TUNNEL_ERROR: 'TUNNEL_ERROR',
  };

  /**
   * Remote desktop connection state observable
   * Subscribe to this if you want to be notified when the connection state changes
   */
  public onStateChange = new BehaviorSubject(RemoteDesktopService.STATE.IDLE);

  /**
   * Remote desktop clipboard observable.
   * Subscribe to this if you want to be notified if text has been cut/copied within
   * the remote desktop.
   */
  public onRemoteClipboardData = new ReplaySubject(1);

  public onKeyboardReset = new BehaviorSubject<boolean>(true);

  public onFocused = new BehaviorSubject<boolean>(true);

  public onFullScreen = new BehaviorSubject<boolean>(false);

  public onReconnect = new Subject<boolean>();

  /**
   * When an instruction is received from the tunnel
   */
  public onTunnelInstruction = new BehaviorSubject<{
    opcode: string;
    parameters: any;
  }>(null);

  /**
   * The actual underlying remote desktop client
   */
  private client: Client;

  /**
   * The tunnel being used by the underlying remote desktop client
   */
  private tunnel: Tunnel;

  /**
   * All currently-exposed filesystems. When the Guacamole server exposes
   * a filesystem object, that object will be made available as a
   * ManagedFilesystem within this array.
   */
  private filesystems: ManagedFilesystem[] = [];

  /**
   * All uploaded files. As files are uploaded, their progress can be
   * observed through the elements of this array. It is intended that
   * this array be manipulated externally as needed.
   */
  private uploads: ManagedFileUpload[] = [];

  constructor(
    private filesystemService: ManagedFilesystemService,
    private tunnelRestApiService: TunnelRestApiService,
  ) {
  }

  /**
   * Set up the manager
   * @param t  WebsocketTunnel, HTTPTunnel or ChainedTunnel
   */
  public initialize(t: Tunnel) {
    this.tunnel = t;
    this.client = new Client(this.tunnel);
  }

  /**
   * Get the guacamole connection state
   */
  public getState() {
    return this.onStateChange.getValue();
  }

  /**
   * Check to see if the given state equals the current state
   * @param state
   */
  public isState(state: string): boolean {
    return state === this.onStateChange.getValue();
  }

  /**
   * Set the display focus
   * @param newFocused
   */
  public setFocused(newFocused: boolean) {
    this.onFocused.next(newFocused);
  }

  /**
   * Set full screen
   * @param newFullScreen
   */
  public setFullScreen(newFullScreen: boolean) {
    this.onFullScreen.next(newFullScreen);
  }

  /**
   * Is the display full screen?
   */
  public isFullScreen(): boolean {
    return this.onFullScreen.getValue();
  }

  /**
   * Is the tunnel connected?
   */
  public isConnected(): boolean {
    return (
      this.onStateChange.getValue() === RemoteDesktopService.STATE.CONNECTED
    );
  }

  /**
   * Get the guacamole client
   */
  public getClient(): Client {
    return this.client;
  }

  /**
   * Get the guacamole tunnel
   */
  public getTunnel(): Tunnel {
    return this.tunnel;
  }

  /**
   * Get the filesystems published by guacamole
   */
  public getFilesystems(): ManagedFilesystem[] {
    return this.filesystems;
  }

  /**
   * Generate a thumbnail
   * @param {number} width  The width of the thumbnail
   * @param {number} height The height of the thumbnail
   * @returns {string} An image data url
   */
  public createThumbnail(width: number = 340, height: number = 240): string {
    const display = this.client.getDisplay();
    if (display && display.getWidth() > 0 && display.getHeight() > 0) {
      // Get screenshot
      const canvas = display.flatten();
      const scale = Math.min(width / canvas.width, height / canvas.height, 1);

      // Create thumbnail canvas
      const thumbnail = document.createElement('canvas');
      thumbnail.width = canvas.width * scale;
      thumbnail.height = canvas.height * scale;

      // Scale screenshot to thumbnail
      const context = thumbnail.getContext('2d');
      context.drawImage(
        canvas,
        0,
        0,
        canvas.width,
        canvas.height,
        0,
        0,
        thumbnail.width,
        thumbnail.height
      );
      return thumbnail.toDataURL('image/png');
    }
    return null;
  }

  /**
   * Generate a screenshot
   * @param {blob} done Callback with the screenshot blob data
   */
  public createScreenshot(done: any): void {
    const display = this.client.getDisplay();
    if (display && display.getWidth() > 0 && display.getHeight() > 0) {
      const canvas = display.flatten();
      return canvas.toBlob(done);
    }
    done(null);
  }

  /**
   * Send text to the remote clipboard
   * @param {string} text Clipboard text to send
   */
  public sendRemoteClipboardData(text: string) {
    if (text) {
      this.onRemoteClipboardData.next(text);
      this.client.setClipboard(text);
    }
  }

  /**
   * Reset the keyboard
   * This will release all keys
   */
  public resetKeyboard(): void {
    this.onKeyboardReset.next(true);
  }

  /**
   * Disconnect from the remote desktop
   */
  public disconnect(): void {
    this.client.disconnect();
  }

  /**
   * Connect to the remote desktop
   */
  public connect(parameters = {}): void {
    const configuration = this.buildParameters(parameters);
    this.client.connect(configuration);
    this.bindEventHandlers();
  }

  /**
   * Uploads the given file to the server through this client.
   * The file transfer can be monitored through the corresponding entry in
   * the uploads array of the given managedClient.
   *
   * @param file
   *     The file to upload.
   *
   * @param [fs]
   *     The filesystem to upload the file to, if any. If not specified, the
   *     file will be sent as a generic Guacamole file stream.
   *
   * @param [directory=fs.currentDirectory]
   *     The directory within the given filesystem to upload the file to. If
   *     not specified, but a filesystem is given, the current directory of
   *     that filesystem will be used.
   */
  public uploadFile(file: File, fs: ManagedFilesystem, directory: ManagedFile): ManagedFileUpload {
    if (directory.type !== FileType.DIRECTORY) {
      throw new Error('upload destination is not a directory')
    }

    // Use generic Guacamole file streams by default
    let object: Object = null;
    let streamName: string = null;

    // If a filesystem is given, determine the destination object and stream
    if (fs) {
      object = fs.object;
      streamName = (directory || fs.currentDirectory).streamName + '/' + file.name;
    }

    // Start and manage file upload
    const instance = this.createUploadInstance(file, object, streamName)
    this.uploads.push(instance);
    return instance;
  }

  /**
   * Returns the current uploads.
   */
  public getUploads(): ManagedFileUpload[] {
    return this.uploads;
  };

  /**
   * Removes completed or failed uploads from the list.
   */
  public clearCompletedUploads() {
    this.uploads = this.uploads.filter(function isUploadInProgress(upload) {
      return RemoteDesktopService.isTransferInProgress(upload.transferState);
    });
  }

  /**
   * Creates a new ManagedFileUpload which uploads the given file to the
   * server through the given Guacamole client.
   *
   * @param file
   *     The file to upload.
   *
   * @param [object]
   *     The object to upload the file to, if any, such as a filesystem
   *     object.
   *
   * @param [streamName]
   *     The name of the stream to upload the file to. If an object is given,
   *     this must be specified.
   *
   * @return
   *     A new ManagedFileUpload object which can be used to track the
   *     progress of the upload.
   */
  private createUploadInstance(file: File, object: Object, streamName: string): ManagedFileUpload {
    var managedFileUpload = new ManagedFileUpload(null);

    // Open file for writing
    var stream;
    if (!object) {
      stream = this.client.createFileStream(file.type, file.name);
    } else {
      // If object/streamName specified, upload to that instead of a file stream
      stream = object.createOutputStream(file.type, streamName);
    }

    // Init managed upload
    managedFileUpload.filename = file.name;
    managedFileUpload.mimetype = file.type;
    managedFileUpload.progress = 0;
    managedFileUpload.length = file.size;

    // Notify that stream is open
    managedFileUpload.transferState.setStreamState(StreamState.OPEN, null)

    // Begin uploading file once stream is acknowledged
    stream.onack = (status) => {

      // Notify of any errors from the Guacamole server
      if (status.isError()) {
        managedFileUpload.transferState.setStreamState(StreamState.ERROR, status.code)
        stream.sendEnd();
        return;
      }

      // Begin upload
      this.tunnelRestApiService.uploadToStream(
        this.tunnel.uuid,
        stream,
        file,
        (length) => {
          managedFileUpload.progress = length;
        }
      ).then(() => {
          // Upload complete
          managedFileUpload.progress = file.size;
          managedFileUpload.transferState.setStreamState(StreamState.CLOSED, null)
        },

        (error) => {
          if (error.type === 'STREAM_ERROR') {
            // Use provide status code if the error is coming from the stream
            managedFileUpload.transferState.setStreamState(StreamState.ERROR, error.statusCode)
          } else {
            // Fail with internal error for all other causes
            managedFileUpload.transferState.setStreamState(StreamState.ERROR, Status.Code.INTERNAL_ERROR)
          }
        }
      );

      // Ignore all further acks
      stream.onack = null;
    };

    return managedFileUpload;
  }

  /**
   * Set the connection state and emit the new state to any subscribers
   * @param state Connection state
   */
  private setState(state: string): void {
    this.onStateChange.next(state);
  }

  /**
   * Receive clipboard data from the remote desktop and emit an event to the client
   * @param stream
   * @param mimetype
   */
  private handleClipboard(stream: any, mimetype: string): void {
    // If the received data is text, read it as a simple string
    if (/^text\//.exec(mimetype)) {
      const reader = new StringReader(stream);

      // Assemble received data into a single string
      let data = '';
      reader.ontext = (text: string) => (data += text);

      // Set clipboard contents once stream is finished
      reader.onend = () => this.onRemoteClipboardData.next(data);
    }
  }

  /**
   * Receive published filesystems and store them
   * @param object
   * @param name
   * @private
   */
  private handleFilesystem(object: Object, name: string): void {
    this.filesystemService.createInstance(this.tunnel, this.client, object, name).then(fs => this.filesystems.push(fs))
  }

  /**
   * Handle any received file
   * @param stream
   * @param mimetype
   * @param filename
   * @private
   */
  private handleFileReceived(stream: InputStream, mimetype: string, filename: string): void {
    this.tunnelRestApiService.downloadStream(this.tunnel.uuid, stream, mimetype, filename);

  }

  /**
   * Build the URL query parameters to send to the tunnel connection
   */
  private buildParameters(parameters = {}): string {
    let params = new HttpParams({fromObject: parameters});
    return params.toString();
  }

  /**
   * Bind the client and tunnel event handlers
   */
  private bindEventHandlers(): void {
    // console.log('Binding events');
    this.client.onerror = this.handleClientError.bind(this);
    this.client.onstatechange = this.handleClientStateChange.bind(this);
    this.client.onclipboard = this.handleClipboard.bind(this);
    this.client.onfilesystem = this.handleFilesystem.bind(this);
    this.client.onfile = this.handleFileReceived.bind(this);
    this.tunnel.onerror = this.handleTunnelError.bind(this);
    this.tunnel.onstatechange = this.handleTunnelStateChange.bind(this);
    /*
     * Override tunnel instruction message
     */
    this.tunnel.oninstruction = ((oninstruction) => {
      return (opcode: string, parameters: any) => {
        oninstruction(opcode, parameters);
        this.onTunnelInstruction.next({opcode, parameters});
      };
    })(this.tunnel.oninstruction);
  }

  /**
   * Handle any client errors by disconnecting and updating the connection state
   * @param state State received from the client
   */
  private handleClientError(status: any): void {
    // Disconnect if connected
    this.disconnect();
    this.setState(RemoteDesktopService.STATE.CLIENT_ERROR);
  }

  /**
   * Update the connection state when the client state changes
   * @param state State received from the client
   */
  private handleClientStateChange(state: number): void {
    switch (state) {
      // Idle
      case 0:
        this.setState(RemoteDesktopService.STATE.IDLE);
        break;
      // Ignore "connecting" state
      case 1: // Connecting
        break;
      // Connected + waiting
      case 2:
        this.setState(RemoteDesktopService.STATE.WAITING);
        break;
      // Connected
      case 3:
        this.setState(RemoteDesktopService.STATE.CONNECTED);
        break;
      // Update history when disconnecting
      case 4: // Disconnecting
      case 5: // Disconnected
        break;
    }
  }

  /**
   * Handle any tunnel errors by disconnecting and updating the connection state
   * @param status Status received from the tunnel
   * See https://guacamole.apache.org/doc/gug/protocol-reference.html for error reference
   */
  private handleTunnelError(status: any): void {
    this.disconnect();
    this.setState(RemoteDesktopService.STATE.TUNNEL_ERROR);
    console.error('Tunnel error', status);
  }

  /**
   * Update the connection state when the tunnel state changes
   * @param state State received from the tunnel
   */
  private handleTunnelStateChange(state: number): void {
    switch (state) {
      // Connection is being established
      case 1:
        this.setState(RemoteDesktopService.STATE.CONNECTING);
        break;
      // Connection has closed
      case 2:
        this.setState(RemoteDesktopService.STATE.DISCONNECTED);
        break;
    }
  }

  /**
   * Determines whether the given file transfer state indicates an
   * in-progress transfer.
   *
   * @param transferState
   *     The file transfer state to check.
   */
  private static isTransferInProgress(transferState: ManagedFileTransferState): boolean {
    switch (transferState.streamState) {

      // IDLE or OPEN file transfers are active
      case StreamState.IDLE:
      case StreamState.OPEN:
        return true;

      // All others are not active
      default:
        return false;

    }
  };
}
