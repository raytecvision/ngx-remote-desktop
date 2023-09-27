import {Injectable} from '@angular/core';
import {HttpParams} from '@angular/common/http';
import {Client, InputStream, Object, Status, StringReader, Tunnel} from 'guacamole-common-ts';
import {BehaviorSubject, ReplaySubject, Subject, Observable} from 'rxjs';
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

  private subjectFilesystems = new ReplaySubject<ManagedFilesystem>();

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
  public getFilesystems(): Observable<ManagedFilesystem> {
    return this.subjectFilesystems.asObservable();
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
  public connect(parameters: guac_params | {} = {}): void {
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
    this.filesystemService.createInstance(this.tunnel, this.client, object, name).then(fs => {
      this.filesystems.push(fs);
      this.subjectFilesystems.next(fs);
    }).catch(err => this.handleTunnelError(err.message))
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
   * @param parameters guacamole-lite-ts format
   *
   */
  private buildParameters(parameters: guac_params | {} = {}): string {
    var unencryptedSettings = {}
    //Need to parse out the specific connection type parameters
    for (let type of connection_types) {
      if (parameters[type]) {
        unencryptedSettings = parameters[type]
      }
    }
    parameters = { ...parameters, ...unencryptedSettings }

    let params = new HttpParams({ fromObject: parameters });
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
        this.onTunnelInstruction.next({ opcode, parameters });
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


export type connection_options = vnc_connection | rdp_connection | ssh_connection | telnet_connection | kubernetes_connection;
export type connection_type = "rdp" | "vnc" | "ssh" | "telnet" | "kubernetes"
export const connection_types: connection_type[] = ["rdp", "vnc", "ssh", "telnet", "kubernetes"]

export interface vnc_settings extends common_setting, vnc_unencrypted_settings {
  /**
   * The hostname or IP address of the VNC server Guacamole should connect to.
   */
  hostname: string;
  /**
   * The username to use when attempting authentication, if any. This parameter is optional.
   */
  username?: string;
  /**
   * The password to use when attempting authentication, if any. This parameter is optional.
   */
  password?: string;
  /**
   * The port the VNC server is listening on, usually 5900 or 5900 + display number. For example, if your VNC server is serving display number 1 (sometimes written as :1), your port number here would be 5901.
   */
  port: string;
  /**
   * The destination port to request when connecting to a VNC proxy such as UltraVNC Repeater. This is only necessary if the VNC proxy in use requires the connecting user to specify which VNC server to connect to. If the VNC proxy automatically connects to a specific server, this parameter is not necessary.
   */
  "dest-port"?: number | string;
}

export interface rdp_settings extends common_setting, rdp_unencrypted_settings  {
  /**
   * The hostname or IP address of the RDP server Guacamole should connect to.
  */
  hostname: string;
  /**
   * The port the RDP server is listening on. This parameter is optional. If this is not specified, the standard port for RDP (3389) or Hyper-V’s default port for VMConnect (2179) will be used, depending on the security mode selected.
  */
  port?: string;
  /**
* The username to use when attempting authentication, if any. This parameter is optional.
*/
  username?: string;
  /**
   * The password to use when attempting authentication, if any. This parameter is optional.
   */
  password?: string;
  /**
   * The domain to use when attempting authentication, if any. This parameter is optional.
   */
  dommain?: string;
  /**
   * The security mode to use for the RDP connection. This mode dictates how data will be encrypted and what type of authentication will be performed, if any. By default, a security mode is selected based on a negotiation process which determines what both the client and the server support.

      Possible values are:

      any
      Automatically select the security mode based on the security protocols supported by both the client and the server. This is the default.

      nla
      Network Level Authentication, sometimes also referred to as “hybrid” or CredSSP (the protocol that drives NLA). This mode uses TLS encryption and requires the username and password to be given in advance. Unlike RDP mode, the authentication step is performed before the remote desktop session actually starts, avoiding the need for the Windows server to allocate significant resources for users that may not be authorized.

      If the versions of guacd and Guacamole Client in use support prompting and the username, password, and domain are not specified, the user will be interactively prompted to enter credentials to complete NLA and continue the connection. Otherwise, when prompting is not supported and credentials are not provided, NLA connections will fail.

      nla-ext
      Extended Network Level Authentication. This mode is identical to NLA except that an additional “Early User Authorization Result” is required to be sent from the server to the client immediately after the NLA handshake is completed.

      tls
      RDP authentication and encryption implemented via TLS (Transport Layer Security). Also referred to as RDSTLS, the TLS security mode is primarily used in load balanced configurations where the initial RDP server may redirect the connection to a different RDP server.

      vmconnect
      Automatically select the security mode based on the security protocols supported by both the client and the server, limiting that negotiation to only the protocols known to be supported by Hyper-V / VMConnect.

      rdp
      Legacy RDP encryption. This mode is generally only used for older Windows servers or in cases where a standard Windows login screen is desired. Newer versions of Windows have this mode disabled by default and will only accept NLA unless explicitly configured otherwise.
      * 
      */
  security?: "any" | "nla" | "nla-ext" | "tls" | "vmconnect" | "rdp";
  /**
   *  If set to “true”, the certificate returned by the server will be ignored, even if that certificate cannot be validated. This is useful if you universally trust the server and your connection to the server, and you know that the server’s certificate cannot be validated (for example, if it is self-signed)
   */
  "ignore-cert"?: boolean;
  /**
   * If set to “true”, authentication will be disabled. Note that this refers to authentication that takes place while connecting. Any authentication enforced by the server over the remote desktop session (such as a login dialog) will still take place. By default, authentication is enabled and only used when requested by the server.

      If you are using NLA, authentication must be enabled by definition.
      * 
      */
  "disable-auth"?: boolean;
  /**
   * When connecting to the RDP server, Guacamole will normally provide its own hostname as the name of the client. If this parameter is specified, Guacamole will use its value instead.

      On Windows RDP servers, this value is exposed within the session as the CLIENTNAME environment variable.
      */
  "client-name"?: string;
  /**
   * If set to “true”, you will be connected to the console (admin) session of the RDP server.
   */
  console?: boolean;
  
  /**
  * The name of the redirected printer device that is passed through to the RDP session. This is the name that the user will see in, for example, the Devices and Printers control panel.
  * 
  * If printer redirection is not enabled, this option has no effect.
  */
  "printer-name"?: string;
  
  /**
   * The name of the filesystem used when passed through to the RDP session. This is the name that users will see in their Computer/My Computer area along with client name (for example, “Guacamole on Guacamole RDP”), and is also the name of the share when accessing the special \\tsclient network location.
   *
   * If file transfer is not enabled, this parameter is ignored.
  */
  "drive-name"?: string;
  /**
   * The directory on the Guacamole server in which transferred files should be stored. This directory must be accessible by guacd and both readable and writable by the user that runs guacd. This parameter does not refer to a directory on the RDP server.
   * 
   * If file transfer is not enabled, this parameter is ignored.
  */
  "drive-path"?: string;
  /**
   * If set to “true”, and file transfer is enabled, the directory specified by the drive-path parameter will automatically be created if it does not yet exist. Only the final directory in the path will be created - if other directories earlier in the path do not exist, automatic creation will fail, and an error will be logged.
   * 
   * By default, the directory specified by the drive-path parameter will not automatically be created, and attempts to transfer files to a non-existent directory will be logged as errors.
   * 
   * If file transfer is not enabled, this parameter is ignored.
  */
  "create-drive-path"?: boolean;
  /**
   * If set to “true”, audio will be explicitly enabled in the console (admin) session of the RDP server. Setting this option to “true” only makes sense if the console parameter is also set to “true”.
  */
  "console-audio"?: boolean;
  /**
   * A comma-separated list of static channel names to open and expose as pipes. If you wish to communicate between an application running on the remote desktop and JavaScript, this is the best way to do it. Guacamole will open an outbound pipe with the name of the static channel. If JavaScript needs to communicate back in the other direction, it should respond by opening another pipe with the same name.
   * 
   * Guacamole allows any number of static channels to be opened, but protocol restrictions of RDP limit the size of each channel name to 7 characters.
  */
  "static-channels"?: string;
  /**
   * The numeric ID of the RDP source. This is a non-negative integer value dictating which of potentially several logical RDP connections should be used. This parameter is optional, and is only required if the RDP server is documented as requiring it. If using Hyper-V, this should be left blank.
   */
  "preconnection-id"?: string;
  /**
   * An arbitrary string which identifies the RDP source - one of potentially several logical RDP connections hosted by the same RDP server. This parameter is optional, and is only required if the RDP server is documented as requiring it, such as Hyper-V. In all cases, the meaning of this parameter is opaque to the RDP protocol itself and is dictated by the RDP server. For Hyper-V, this will be the ID of the destination virtual machine.
   */
  "preconnection-blob"?: string;
  /**
   * The hostname of the remote desktop gateway that should be used as an intermediary for the remote desktop connection. If omitted, a gateway will not be used.
  */
  "gateway-hostname"?: string;

  /**
  * The port of the remote desktop gateway that should be used as an intermediary for the remote desktop connection. By default, this will be “443”.
  */
  "gateway-port"?: number;

  /**
  * The username of the user authenticating with the remote desktop gateway, if a gateway is being used. This is not necessarily the same as the user actually using the remote desktop connection.
  */
  "gateway-username"?: string;
  /**
  * The password to provide when authenticating with the remote desktop gateway, if a gateway is being used.
  */
  "gateway-password"?: string;
  /** 
  * The domain of the user authenticating with the remote desktop gateway, if a gateway is being used. This is not necessarily the same domain as the user actually using the remote desktop connection.
  */
  "gateway-domain"?: string;
  /**
  * The load balancing information or cookie which should be provided to the connection broker. If no connection broker is being used, this should be left blank.
  */
  "load-balance-info"?: string;
  /**
   * Specifies the RemoteApp to start on the remote desktop. If supported by your remote desktop server, this application, and only this application, will be visible to the user.
   * 
   * Windows requires a special notation for the names of remote applications. The names of remote applications must be prefixed with two vertical bars. For example, if you have created a remote application on your server for notepad.exe and have assigned it the name “notepad”, you would set this parameter to: “||notepad”.
  */
  "remote-app"?: string;
  /**
   * The working directory, if any, for the remote application. This parameter has no effect if RemoteApp is not in use.
  */
  "remote-app-dir"?: string;
  /**
   * The command-line arguments, if any, for the remote application. This parameter has no effect if RemoteApp is not in use.
  */
  "remote-app-args"?: string;
}

export interface ssh_settings extends common_setting, ssh_unencrypted_settings {
  /**
   * The hostname or IP address of the SSH server Guacamole should connect to.
   */
  hostname: string;
  /**
   * The port the SSH server is listening on, usually 22. This parameter is optional. If this is not specified, the default of 22 will be used.
   */
  port?: number

  /**
   * The known hosts entry for the SSH server. This parameter is optional, and, if not provided, no verification of host identity will be done. If the parameter is provided the identity of the server will be checked against the data.
   * 
   * The format of this parameter is that of a single entry from an OpenSSH known_hosts file.
   * 
   * For more information, please see SSH Host Verification.
  */
  "host-key"?: string;
  /**
   * By default the SSH client does not send keepalive requests to the server. This parameter allows you to configure the the interval in seconds at which the client connection sends keepalive packets to the server. The default is 0, which disables sending the packets. The minimum value is 2.
  */
  "server-alive-interval"?: number;
  /**
   * The username to use to authenticate, if any. This parameter is optional. If not specified, you will be prompted for the username upon connecting.
  */
  username?: string;
  /**
   * The password to use when attempting authentication, if any. This parameter is optional. If not specified, you will be prompted for your password upon connecting.
  */
  password?: string;
  /**
   * The entire contents of the private key to use for public key authentication. If this parameter is not specified, public key authentication will not be used. The private key must be in OpenSSH format, as would be generated by the OpenSSH ssh-keygen utility.
  */
  "private-key"?: string;
  /**
   * The passphrase to use to decrypt the private key for use in public key authentication. This parameter is not needed if the private key does not require a passphrase. If the private key requires a passphrase, but this parameter is not provided, the user will be prompted for the passphrase upon connecting.
  */
  passphrase?: string;
  /**
   * The command to execute over the SSH session, if any. This parameter is optional. If not specified, the SSH session will use the user’s default shell.
  */
  command?: string;
  
  /**
   * The directory to expose to connected users via Guacamole’s file browser. If omitted, the root directory will be used by default.
  */
  "sftp-root-directory"?: string;

}

export interface telnet_settings extends common_setting, telnet_unencrypted_settings {
  /**
   * The hostname or IP address of the telnet server Guacamole should connect to.
   */
  hostname: string;
  /**
   * The port the telnet server is listening on, usually 23. This parameter is optional. If this is not specified, the default of 23 will be used.
  */
  port?: number;
  /**
   * The username to use to authenticate, if any. This parameter is optional. If not specified, or not supported by the telnet server, the login process on the telnet server will prompt you for your credentials. For this to work, your telnet server must support the NEW-ENVIRON option, and the telnet login process must pay attention to the USER environment variable. Most telnet servers satisfy this criteria.
  */
  username?: string;
  /**
   * The password to use when attempting authentication, if any. This parameter is optional. If specified, your password will be typed on your behalf when the password prompt is detected.
  */
  password?: string;
  /**
   * The regular expression to use when waiting for the username prompt. This parameter is optional. If not specified, a reasonable default built into Guacamole will be used. The regular expression must be written in the POSIX ERE dialect (the dialect typically used by egrep).
  */
  "username-regex"?: string;
  /**
   * The regular expression to use when waiting for the password prompt. This parameter is optional. If not specified, a reasonable default built into Guacamole will be used. The regular expression must be written in the POSIX ERE dialect (the dialect typically used by egrep).
  */
  "password-regex"?: string;
  /**
   * The regular expression to use when detecting that the login attempt has succeeded. This parameter is optional. If specified, the terminal display will not be shown to the user until text matching this regular expression has been received from the telnet server. The regular expression must be written in the POSIX ERE dialect (the dialect typically used by egrep).
  */
  "login-success-regex"?: string;
  /**
   * The regular expression to use when detecting that the login attempt has failed. This parameter is optional. If specified, the connection will be closed with an explicit login failure error if text matching this regular expression has been received from the telnet server. The regular expression must be written in the POSIX ERE dialect (the dialect typically used by egrep).
   */
  "login-failure-regex"?: string;
}

export interface kubernetes_settings extends common_setting, kubernetes_unencrypted_settings {
  /**
   * The hostname or IP address of the Kubernetes server that Guacamole should connect to.
   */
  hostname: string;
  /**
   * The port the Kubernetes server is listening on for API connections. This parameter is optional. If omitted, port 8080 will be used by default.
  */
  port: number;
  /**
   * The name of the Kubernetes pod containing with the container being attached to.
  */
  pod?: string;
  /**
   * The name of the container to attach to. This parameter is optional. If omitted, the first container in the pod will be used.
  */
  container?: string
  /**
   * The command to run within the container, with input and output attached to this command’s process. This parameter is optional. If omitted, no command will be run, and input/output will instead be attached to the main process of the container.
   *
   * When this parameter is specified, the behavior of the connection is analogous to running kubectl exec. When omitted, the behavior is analogous to running kubectl attach.
  */
  "exec-command"?: string;
  /**
   * If set to “true”, SSL/TLS will be used to connect to the Kubernetes server. This parameter is optional. By default, SSL/TLS will not be used.
  */
  "use-ssl"?: boolean;
  /**
   * The certificate to use if performing SSL/TLS client authentication to authenticate with the Kubernetes server, in PEM format. This parameter is optional. If omitted, SSL client authentication will not be performed.
  */
  "client-cert"?: string;
  /**
   * The key to use if performing SSL/TLS client authentication to authenticate with the Kubernetes server, in PEM format. This parameter is optional. If omitted, SSL client authentication will not be performed.
  */
  "client-key"?: string;
  /**
   * The certificate of the certificate authority that signed the certificate of the Kubernetes server, in PEM format. This parameter is optional. If omitted, verification of the Kubernetes server certificate will use only system-wide certificate authorities.
  */
  "ca-cert"?: string;
  /**
   * If set to “true”, the validity of the SSL/TLS certificate used by the Kubernetes server will be ignored if it cannot be validated. This parameter is optional. By default, SSL/TLS certificates are validated.
  */
  "ignore-cert"?: boolean;
}

export interface common_setting {
  /**
       Guacamole provides bidirectional access to the clipboard by default for all supported protocols. 
      For protocols that don’t inherently provide a clipboard, Guacamole implements its own clipboard. 
      This behavior can be overridden on a per-connection basis with the disable-copy and disable-paste parameters.
  */

  /**
   * If set to “true”, text copied within the remote desktop session will not be accessible by the user at the browser side of the Guacamole session, and will be usable only within the remote desktop. This parameter is optional. By default, the user will be given access to the copied text.
  */
  "disable-copy"?: boolean;
  /**
   * If set to “true”, text copied at the browser side of the Guacamole session will not be accessible within the remote ddesktop session. This parameter is optional. By default, the user will be able to paste data from outside the browser within the remote desktop session.
   * */
  "disable-paste"?: boolean;

  /**
  
      Guacamole can provide file transfer over SFTP even when the remote desktop is otherwise being accessed through a different protocol, 
      like VNC or RDP. If SFTP is enabled on a Guacamole RDP connection, users will be able to upload and download files as described in Using 
      Guacamole.

      This support is independent of the file transfer that may be provided by the protocol in use, like RDP’s own “drive redirection” (RDPDR), 
      and is particularly useful for remote desktop servers which do not support file transfer features.

  */


  /**
   * Whether file transfer should be enabled. If set to “true”, the user will be allowed to upload or download files from the specified server using SFTP. If omitted, SFTP will be disabled.
  */
  "enable-sftp"?: boolean;
  /**
   * The hostname or IP address of the server hosting SFTP. This parameter is optional. If omitted, the hostname of the remote desktop server associated with the connection will be used.
  */
  "sftp-hostname"?: string;
  /**
   * The port the SSH server providing SFTP is listening on, usually 22. This parameter is optional. If omitted, the standard port of 22 will be used.
  */
  "sftp-port"?: number;
  /**
   * The known hosts entry for the SFTP server. This parameter is optional, and, if not provided, no verification of SFTP host identity will be done. If the parameter is provided the identity of the server will be checked against the data.
   *
   * The format of this parameter is that of a single entry from an OpenSSH known_hosts file.
   * For more information, please see [SSH Host Verification](https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#ssh-host-verification).
  */
  "sftp-host-key"?: string;
  /**
   * The username to authenticate as when connecting to the specified SSH server for SFTP. This parameter is optional if a username is specified for the remote desktop connection. If omitted, the username specified for the remote desktop connection will be used.
  */
  "sftp-username"?: string;
  /**
   * The password to use when authenticating with the specified SSH server for SFTP.
  */
  "sftp-password"?: string;
  /**
   * The entire contents of the private key to use for public key authentication. If this parameter is not specified, public key authentication will not be used. The private key must be in OpenSSH format, as would be generated by the OpenSSH ssh-keygen utility.
  */
  "sftp-private-key"?: string;
  /**
   * The passphrase to use to decrypt the private key for use in public key authentication. This parameter is not needed if the private key does not require a passphrase.
  */
  "sftp-passphrase"?: string;
  /**
   * The directory to upload files to if they are simply dragged and dropped, and thus otherwise lack a specific upload location. This parameter is optional. If omitted, the default upload location of the SSH server providing SFTP will be used.
  */
  "sftp-directory"?: string;
  /**
   * The directory to expose to connected users via Guacamole’s [Using the file browser](https://guacamole.incubator.apache.org/doc/gug/using-guacamole.html#file-browser). If omitted, the root directory will be used by default.
  */
  "sftp-root-directory"?: string;
  /**
   * The interval in seconds at which to send keepalive packets to the SSH server for the SFTP connection. This parameter is optional. If omitted, the default of 0 will be used, disabling sending keepalive packets. The minimum value is 2.
  */
  "sftp-server-alive-interval"?: number;
  /**
   * If set to true downloads from the remote system to the client (browser) will be disabled. The default is false, which means that downloads will be enabled.
   * If sftp is not enabled, this parameter will be ignored.
  */
  "sftp-disable-download"?: boolean;
  /**
   * If set to true uploads from the client (browser) to the remote system will be disabled. The default is false, which means that uploads will be enabled.
   * If sftp is not enabled, this parameter will be ignored.
   * */
  "sftp-disable-upload"?: boolean;

  /** 
      Sessions of all supported protocols can be recorded graphically. These recordings take the form of Guacamole protocol dumps and are 
      recorded automatically to a specified directory. Recordings can be subsequently played back directly in the browser from the connection 
      history screen or translated to a normal video stream using the guacenc utility provided with guacamole-server.
      
      For example, to produce a video called NAME.m4v from the recording “NAME”, you would run:

      ```console
          guacenc /path/to/recording/NAME
          The guacenc utility has additional options for overriding default behavior, including tweaking the output format, which are documented in 
          detail within the manpage:
      ```

      ```console
          man guacenc
      ```
      If recording of key events is explicitly enabled using the recording-include-keys parameter, recordings can also be translated into 
      human-readable interpretations of the keys pressed during the session using the guaclog utility. The usage of guaclog is analogous to 
      guacenc, and results in the creation of a new text file containing the interpreted events:

      ```console
          guaclog /path/to/recording/NAME
          guaclog: INFO: Guacamole input log interpreter (guaclog) version 1.5.3
          guaclog: INFO: 1 input file(s) provided.
          guaclog: INFO: Writing input events from "/path/to/recording/NAME" to "/path/to/recording/NAME.txt" ...
          guaclog: INFO: All files interpreted successfully.
      ```
      
      Guacamole will never overwrite an existing recording. If necessary, a numeric suffix like “.1”, “.2”, “.3”, etc. will be appended to to 
      avoid overwriting an existing recording. If even appending a numeric suffix does not help, the session will simply not be recorded.
  */

  /**
   * The directory in which screen recording files should be created. If a graphical recording needs to be created, then this parameter is required. Specifying this parameter enables graphical screen recording. If this parameter is omitted, no graphical recording will be created.
  */
  "recording-path"?: string;
  /**
   * If set to “true”, the directory specified by the recording-path parameter will automatically be created if it does not yet exist. Only the final directory in the path will be created - if other directories earlier in the path do not exist, automatic creation will fail, and an error will be logged.
   *
   * This parameter is optional. By default, the directory specified by the recording-path parameter will not automatically be created, and attempts to create recordings within a non-existent directory will be logged as errors.
   *
   * This parameter only has an effect if graphical recording is enabled. If the recording-path is not specified, graphical session recording will be disabled, and this parameter will be ignored.
  */
  "create-recording-path"?: boolean;
  /**
   * The filename to use for any created recordings. This parameter is optional. If omitted, the value “recording” will be used instead.
   *
   * This parameter only has an effect if graphical recording is enabled. If the recording-path is not specified, graphical session recording will be disabled, and this parameter will be ignored.
  */
  "recording-name"?: string;
  /**
   * If set to “true”, graphical output and other data normally streamed from server to client will be excluded from the recording, producing a recording which contains only user input events. This parameter is optional. If omitted, graphical output will be included in the recording.
   *
   * This parameter only has an effect if graphical recording is enabled. If the recording-path is not specified, graphical session recording will be disabled, and this parameter will be ignored.
  */
  "recording-exclude-output"?: boolean;
  /**
   * If set to “true”, user mouse events will be excluded from the recording, producing a recording which lacks a visible mouse cursor. This parameter is optional. If omitted, mouse events will be included in the recording.
   *
   * This parameter only has an effect if graphical recording is enabled. If the recording-path is not specified, graphical session recording will be disabled, and this parameter will be ignored.
  */
  "recording-exclude-mouse"?: boolean;
  /**
   * If set to “true”, user key events will be included in the recording. The recording can subsequently be passed through the guaclog utility to produce a human-readable interpretation of the keys pressed during the session. This parameter is optional. If omitted, key events will be not included in the recording.
   *
   * This parameter only has an effect if graphical recording is enabled. If the recording-path is not specified, graphical session recording will be disabled, and this parameter will be ignored.
   *
   */
  "recording-include-keys"?: boolean;

  /**
      The full, raw text content of SSH sessions, including timing information, can be recorded automatically to a specified directory. 
      This recording, also known as a “typescript”, will be written to two files within the directory specified by typescript-path: NAME, 
      which contains the raw text data, and NAME.timing, which contains timing information, where NAME is the value provided for the 
      typescript-name parameter.

      This format is compatible with the format used by the standard UNIX script command, and can be replayed using scriptreplay (if installed). 
      For example, to replay a typescript called “NAME”, you would run:

      ```console
      scriptreplay NAME.timing NAME
      ```

      Important
      Guacamole will never overwrite an existing recording. If necessary, a numeric suffix like “.1”, “.2”, “.3”, etc. will be appended to 
      NAME to avoid overwriting an existing recording. If even appending a numeric suffix does not help, the session will simply not be recorded.
  */

  /**
   * The directory in which typescript files should be created. If a typescript needs to be recorded, this parameter is required. Specifying this parameter enables typescript recording. If this parameter is omitted, no typescript will be recorded.
  */
  "typescript-path"?: string;
  /**
   * If set to “true”, the directory specified by the typescript-path parameter will automatically be created if it does not yet exist. Only the final directory in the path will be created - if other directories earlier in the path do not exist, automatic creation will fail, and an error will be logged.
   *
   * This parameter is optional. By default, the directory specified by the typescript-path parameter will not automatically be created, and attempts to record typescripts in a non-existent directory will be logged as errors.
   *
   * This parameter only has an effect if typescript recording is enabled. If the typescript-path is not specified, recording of typescripts will be disabled, and this parameter will be ignored.
  */
  "create-typescript-path"?: boolean;
  /**
   * The base filename to use when determining the names for the data and timing files of the typescript. This parameter is optional. If omitted, the value “typescript” will be used instead.
   *
   * Each typescript consists of two files which are created within the directory specified by typescript-path: NAME, which contains the raw text data, and NAME.timing, which contains timing information, where NAME is the value provided for the typescript-name parameter.
   *
   * This parameter only has an effect if typescript recording is enabled. If the typescript-path is not specified, recording of typescripts will be disabled, and this parameter will be ignored.
  */
  "typescript-name"?: string;

  /**
      In most cases, the default behavior for a terminal works without modification. However, when connecting to certain systems, 
      particularly operating systems other than Linux, the terminal behavior may need to be tweaked to allow it to operate properly. 
      The settings in this section control that behavior.
  */


  /**
   * This parameter controls the ASCII code that the backspace key sends to the remote system. Under most circumstances this should not need to be adjusted; however, if, when pressing the backspace key, you see control characters (often either ^? or ^H) instead of seeing the text erased, you may need to adjust this parameter. By default the terminal sends ASCII code 127 (Delete) if this option is not set.
  */
  backspace?: string;
  /**
   * This parameter sets the terminal emulator type string that is passed to the server. This parameter is optional. If not specified, “linux” is used as the terminal emulator type by default.
  */
  "terminal-type"?: string;

  /**
  
      If Guacamole is being used in part to automate an SSH, telnet, or other terminal session, it can be useful to provide 
      input directly from JavaScript as a raw stream of data, rather than attempting to translate data into keystrokes. 
      This can be done through opening a pipe stream named “STDIN” within the connection using the createPipeStream() 
      function of Guacamole.Client:

      ```
      var outputStream = client.createPipeStream('text/plain', 'STDIN');
      ```

      The resulting Guacamole.OutputStream can then be used to stream data directly to the input of the terminal session, as if typed by the user:

      ```
      // Wrap output stream in writer
      var writer = new Guacamole.StringWriter(outputStream);

      // Send text
      writer.sendText("hello");

      // Send more text
      writer.sendText("world");

      // Close writer and stream
      writer.sendEnd();
      ```
  */

  /**
   * The color scheme to use for the terminal session. It consists of a semicolon-separated series of name-value pairs. Each name-value pair is separated by a colon and assigns a value to a color in the terminal emulator palette. For example, to use blue text on white background by default, and change the red color to a purple shade, you would specify:
   *
   * 
   *   ```
   *   foreground: rgb:00/00/ff;
   *   background: rgb:ff/ff/ff;
   *   color9: rgb:80/00/80
   *   ```
   * This format is similar to the color configuration format used by Xterm, so Xterm color configurations can be easily adapted for Guacamole. This parameter is optional. If not specified, Guacamole will render text as gray over a black background.
   * 
   * Possible color names are:
   *   foreground
   *   Set the default foreground color.
   *
   *   background
   *   Set the default background color.
   *
   *   colorN
   *   Set the color at index N on the Xterm 256-color palette. For example, color9 refers to the red color.
   *
   *   Possible color values are:
   *
   *       rgb:RR/GG/BB
   *       Use the specified color in RGB format, with each component in hexadecimal. For example, rgb:ff/00/00 specifies the color red. Note that each hexadecimal component can be one to four digits, but the effective values are always zero-extended or truncated to two digits; for example, rgb:f/8/0, rgb:f0/80/00, and rgb:f0f/808/00f all refer to the same effective color.
   *
   *       colorN
   *       Use the color currently assigned to index N on the Xterm 256-color palette. For example, color9 specifies the current red color. Note that the color value is used rather than the color reference, so if color9 is changed later in the color scheme configuration, that new color will not be reflected in this assignment.
   *
   *   For backward compatibility, Guacamole will also accept four special values as the color scheme parameter:
   *
   *   black-white
   *   Black text over a white background.
   *
   *   gray-black
   *   Gray text over a black background. This is the default color scheme.
   *
   *   green-black
   *   Green text over a black background.
   *
   *   white-black
   *   White text over a black background.
   */
  "color-scheme"?: string;

  /**
   * The name of the font to use. This parameter is optional. If not specified, the default of “monospace” will be used instead.
  */
  "font-name"?: string;
  /**
   * The size of the font to use, in points. This parameter is optional. If not specified, the default of 12 will be used instead.
  */
  "font-size"?: number;
  /**
   * The maximum number of rows to allow within the terminal scrollback buffer. This parameter is optional. If not specified, the scrollback buffer will be limited to a maximum of 1000 rows.
  */
  scrollback?: number;
  /**
  Guacamole implements the support to send a “magic wake-on-lan packet” to a remote host prior to attempting to establish a connection with the host. The below parameters control the behavior of this functionality, which is disabled by default.
  
  Important
  There are several factors that can impact the ability of Wake-on-LAN (WoL) to function correctly, many of which are outside the scope of Guacamole configuration. If you are configuring WoL within Guacamole you should also be familiar with the other components that need to be configured in order for it to function correctly.
  */

  /**
   * If set to “true”, Guacamole will attempt to send the Wake-On-LAN packet prior to establishing a connection. This parameter is optional. By default, Guacamole will not send the WoL packet. Enabling this option requires that the wol-mac-addr parameter also be configured, otherwise the WoL packet will not be sent.
  */
  "wol-send-packet"?: boolean;
  /**
   * This parameter configures the MAC address that Guacamole will use in the magic WoL packet to attempt to wake the remote system. If wol-send-packet is enabled, this parameter is required or else the WoL packet will not be sent.
  */
  "wol-mac-addr"?: string;
  /**
   * This parameter configures the IPv4 broadcast address or IPv6 multicast address that Guacamole will send the WoL packet to in order to wake the host. This parameter is optional. If no value is provided, the default local IPv4 broadcast address (255.255.255.255) will be used.
  */
  "wol-broadcast-addr"?: string;
  /**
   * This parameter configures the UDP port that will be set in the WoL packet. In most cases the UDP port isn’t processed by the system that will be woken up; however, there are certain cases where it is useful for the port to be set, as in situations where a router is listening for the packet and can make routing decisions depending upon the port that is used. If not configured the default UDP port 9 will be used.
  */
  "wol-udp-port"?: number;
  /**
   * By default after the WoL packet is sent Guacamole will attempt immediately to connect to the remote host. It may be desirable in certain scenarios to have Guacamole wait before the initial connection in order to give the remote system time to boot. Setting this parameter to a positive value will cause Guacamole to wait the specified number of seconds before attempting the initial connection. This parameter is optional.
  */
  "wol-wait-time"?: number;
}

export interface vnc_unencrypted_settings {
  /**
 * The number of times to retry connecting before giving up and returning an error. In the case of a reverse connection, this is the number of times the connection process is allowed to time out.
 */
  autoretry?: number;
  /**
   * The color depth to request, in bits-per-pixel. This parameter is optional. If specified, this must be either 8, 16, 24, or 32. Regardless of what value is chosen here, if a particular update uses less than 256 colors, Guacamole will always send that update as a 256-color PNG.
   */
  "color-depth"?: 8 | 16 | 24 | 32;
  /**
   * If the colors of your display appear wrong (blues appear orange or red, etc.), it may be that your VNC server is sending image data incorrectly, and the red and blue components of each color are swapped. If this is the case, set this parameter to “true” to work around the problem. This parameter is optional.
   */
  "swap-red-blue"?: boolean;
  /**
   * If set to “remote”, the mouse pointer will be rendered remotely, and the local position of the mouse pointer will be indicated by a small dot. A remote mouse cursor will feel slower than a local cursor, but may be necessary if the VNC server does not support sending the cursor image to the client.
   */
  cursor?: "remote";
  /**
   * A space-delimited list of VNC encodings to use. The format of this parameter is dictated by libvncclient and thus doesn’t really follow the form of other Guacamole parameters. This parameter is optional, and libguac-client-vnc will use any supported encoding by default.

      Beware that this parameter is intended to be replaced with individual, encoding-specific parameters in a future release.
      */
  encodings?: string;
  /**
   * Whether this connection should be read-only. If set to “true”, no input will be accepted on the connection at all. Users will only see the desktop and whatever other users using that same desktop are doing. This parameter is optional.
   */
  "read-only"?: boolean;
  /**
   * Whether this connection should only use lossless compression for graphical updates. If set to “true”, lossy compression will not be used. This parameter is optional. By default, lossy compression will be used when heuristics determine that it would likely outperform lossless compression.
   */
  "force-lossless"?: boolean;
  /**
   * The destination host to request when connecting to a VNC proxy such as UltraVNC Repeater. This is only necessary if the VNC proxy in use requires the connecting user to specify which VNC server to connect to. If the VNC proxy automatically connects to a specific server, this parameter is not necessary.
   */
  "dest-host"?: string;
  /**
   * Whether reverse connection should be used. If set to “true”, instead of connecting to a server at a given hostname and port, guacd will listen on the given port for inbound connections from a VNC server.
   */
  "reverse-connect"?: boolean;
  /**
   * If reverse connection is in use, the maximum amount of time to wait for an inbound connection from a VNC server, in milliseconds. If blank, the default value is 5000 (five seconds).
   */
  "listen-timeout"?: number;
  /**
   * If set to “true”, audio support will be enabled, and a second connection for PulseAudio will be made in addition to the VNC connection. By default, audio support within VNC is disabled.
   */
  "enable-audio"?: boolean;
  /**
   * The name of the PulseAudio server to connect to. This will be the hostname of the computer providing audio for your connection via PulseAudio, most likely the same as the value given for the hostname parameter.

      If this parameter is omitted, the default PulseAudio device will be used, which will be the PulseAudio server running on the same machine as guacd.
      */
  "audio-servername"?: string;
  /**
   * The encoding to assume for the VNC clipboard. This parameter is optional. By default, the standard encoding ISO 8859-1 will be used. Only use this parameter if you are sure your VNC server supports other encodings beyond the standard ISO 8859-1.

      Possible values are:

      ISO8859-1
      ISO 8859-1 is the clipboard encoding mandated by the VNC standard, and supports only basic Latin characters. Unless your VNC server specifies otherwise, this encoding is the only encoding guaranteed to work.

      UTF-8
      UTF-8 - the most common encoding used for Unicode. Using this encoding for the VNC clipboard violates the VNC specification, but some servers do support this. This parameter value should only be used if you know your VNC server supports this encoding.

      UTF-16
      UTF-16 - a 16-bit encoding for Unicode which is not as common as UTF-8, but still widely used. Using this encoding for the VNC clipboard violates the VNC specification. This parameter value should only be used if you know your VNC server supports this encoding.

      CP1252
      Code page 1252 - a Windows-specific encoding for Latin characters which is mostly a superset of ISO 8859-1, mapping some additional displayable characters onto what would otherwise be control characters. Using this encoding for the VNC clipboard violates the VNC specification. This parameter value should only be used if you know your VNC server supports this encoding.
      * 
      */
  "clipboard-encoding"?: "ISO8859-1" | "UTF-8" | "UTF-16" | "CP1252"
}

export interface rdp_unencrypted_settings {
  /**
   * The type of line ending normalization to apply to text within the clipboard, if any. By default, line ending normalization is not applied.

      Possible values are:

      preserve
      Preserve all line endings within the clipboard exactly as they are, performing no normalization whatsoever. This is the default.

      unix
      Automatically transform all line endings within the clipboard to Unix-style line endings (LF). This format of line ending is the format used by both Linux and Mac.

      windows
      Automatically transform all line endings within the clipboard to Windows-style line endings (CRLF).
      */
  "normalize-clipboard"?: "preserve" | "unix" | "windows";
  /**
   * The server-side keyboard layout. This is the layout of the RDP server and has nothing to do with the keyboard layout in use on the client. The Guacamole client is independent of keyboard layout. The RDP protocol, however, is not independent of keyboard layout, and Guacamole needs to know the keyboard layout of the server in order to send the proper keys when a user is typing.

      Possible values are generally in the format LANGUAGE-REGION-VARIANT, where LANGUAGE is the standard two-letter language code for the primary language associated with the layout, REGION is a standard representation of the location that the keyboard is used (the two-letter country code, when possible), and VARIANT is the specific keyboard layout variant (such as “qwerty”, “qwertz”, or “azerty”):

      | Keyboard layout			    | Parameter value   | 
      | ------------------------------| -----------------:|
      | Brazilian (Portuguese)        | pt-br-qwerty      |
      | English (UK)                  | en-gb-qwerty      |
      | English (US)                  | en-us-qwerty      |
      | French                        | fr-fr-azerty      |
      | French (Belgian)              | fr-be-azerty      |
      | French (Swiss)                | fr-ch-qwertz      |
      | German                        | de-de-qwertz      |
      | German (Swiss)                | de-ch-qwertz      |
      | Hungarian                     | hu-hu-qwertz      |
      | Italian                       | it-it-qwerty      |
      | Japanese                      | ja-jp-qwerty      |
      | Norwegian                     | no-no-qwerty      |
      | Spanish                       | es-es-qwerty      |
      | Spanish (Latin American)      | es-latam-qwerty   |
      | Swedish                       | sv-se-qwerty      |
      | Turkish-Q                     | tr-tr-qwerty      |

      If you server’s keyboard layout is not yet supported, and it is not possible to set your server to use a supported layout, the failsafe layout may be used to force Unicode events to be used for all input, however beware that doing so may prevent keyboard shortcuts from working as expected.
      * 
      */
  "server-layout"?: string;
  /**
   * The timezone that the client should send to the server for configuring the local time display of that server. The format of the timezone is in the standard IANA key zone format, which is the format used in UNIX/Linux. This will be converted by RDP into the correct format for Windows.

      The timezone is detected and will be passed to the server during the handshake phase of the connection, and may used by protocols, like RDP, that support it. This parameter can be used to override the value detected and passed during the handshake, or can be used in situations where guacd does not support passing the timezone parameter during the handshake phase (guacd versions prior to 1.3.0).

      Support for forwarding the client timezone varies by RDP server implementation. For example, with Windows, support for forwarding timezones is only present in Windows Server with Remote Desktop Services (RDS, formerly known as Terminal Services) installed. Windows Server installations in admin mode, along with Windows workstation versions, do not allow the timezone to be forwarded. Other server implementations, for example, xrdp, may not implement this feature at all. Consult the documentation for the RDP server to determine whether or not this feature is supported.
      */
  timezone?: string;
  /**
   * The color depth to request, in bits-per-pixel. This parameter is optional. If specified, this must be either 8, 16, 24, or 32. Regardless of what value is chosen here, if a particular update uses less than 256 colors, Guacamole will always send that update as a 256-color PNG.
   */
  "color-depth"?: 8 | 16 | 24 | 32;
  /**
   * The width of the display to request, in pixels. This parameter is optional. If this value is not specified, the width of the connecting client display will be used instead.
   */
  width?: number;
  /**
   * The height of the display to request, in pixels. This parameter is optional. If this value is not specified, the height of the connecting client display will be used instead.
   */
  height?: number;
  /**
   * The desired effective resolution of the client display, in DPI. This parameter is optional. If this value is not specified, the resolution and size of the client display will be used together to determine, heuristically, an appropriate resolution for the RDP session.
   */
  dpi?: number;
  /**
   * The method to use to update the RDP server when the width or height of the client display changes. This parameter is optional. If this value is not specified, no action will be taken when the client display changes size.

      Normally, the display size of an RDP session is constant and can only be changed when initially connecting. As of RDP 8.1, the “Display Update” channel can be used to request that the server change the display size. For older RDP servers, the only option is to disconnect and reconnect with the new size.

      Possible values are:

      display-update
      Uses the “Display Update” channel added with RDP 8.1 to signal the server when the client display size has changed.

      reconnect
      Automatically disconnects the RDP session when the client display size has changed, and reconnects with the new size.
      * 
      */
  "resize-method"?: "display-update" | "reconnect";
  /**
   * Whether this connection should only use lossless compression for graphical updates. If set to “true”, lossy compression will not be used. This parameter is optional. By default, lossy compression will be used when heuristics determine that it would likely outperform lossless compression.
   * 
   */
  "force-lossless"?: boolean;
  /**
   * Audio is enabled by default in both the client and in libguac-client-rdp. If you are concerned about bandwidth usage, or sound is causing problems, you can explicitly disable sound by setting this parameter to “true”.
  */
  "disable-audio"?: boolean;
  /** 
   * If set to “true”, audio input support (microphone) will be enabled, leveraging the standard “AUDIO_INPUT” channel of RDP. By default, audio input support within RDP is disabled.
  */
  "enable-audio-input"?: boolean;
  /**
   * If set to “true”, support for multi-touch events will be enabled, leveraging the standard “RDPEI” channel of RDP. By default, direct RDP support for multi-touch events is disabled.
   * 
   * Enabling support for multi-touch allows touch interaction with applications inside the RDP session, however the touch gestures available will depend on the level of touch support of those applications and the OS.
   * 
   * If multi-touch support is not enabled, pointer-type interaction with applications inside the RDP session will be limited to mouse or emulated mouse events.
  */
  "enable-touch"?: boolean;
  /**
   * Printing is disabled by default, but with printing enabled, RDP users can print to a virtual printer that sends a PDF containing the document printed to the Guacamole client. Enable printing by setting this parameter to “true”.
   * 
   * Printing support requires GhostScript to be installed. If guacd cannot find the gs executable when printing, the print attempt will fail.
  */
  "enable-printing"?: boolean;
  /**
  * File transfer is disabled by default, but with file transfer enabled, RDP users can transfer files to and from a virtual drive which persists on the Guacamole server. Enable file transfer support by setting this parameter to “true”.
  * 
  * Files will be stored in the directory specified by the “drive-path” parameter, which is required if file transfer is enabled.
  */
  "enable-drive"?: boolean;
  /**
   * If set to true downloads from the remote server to client (browser) will be disabled. This includes both downloads done via the hidden Guacamole menu, as well as using the special “Download” folder presented to the remote server. The default is false, which means that downloads will be allowed.
  * 
  * If file transfer is not enabled, this parameter is ignored.
  */
  "disable-download"?: boolean;
  /**
   * If set to true, uploads from the client (browser) to the remote server location will be disabled. The default is false, which means uploads will be allowed if file transfer is enabled.
  *
  * If file transfer is not enabled, this parameter is ignored.
  */
  "disable-upload"?: boolean;
  /**
 * If set to “true”, enables rendering of the desktop wallpaper. By default, wallpaper will be disabled, such that unnecessary bandwidth need not be spent redrawing the desktop.
 */
  "enable-wallpaper"?: boolean;
  /**
   * If set to “true”, enables use of theming of windows and controls. By default, theming within RDP sessions is disabled.
  */
  "enable-theming"?: boolean;
  /**
   * If set to “true”, text will be rendered with smooth edges. Text over RDP is rendered with rough edges by default, as this reduces the number of colors used by text, and thus reduces the bandwidth required for the connection.
  */
  "enable-font-smoothing"?: boolean;
  /**
   * If set to “true”, the contents of windows will be displayed as windows are moved. By default, the RDP server will only draw the window border while windows are being dragged.
  */
  "enable-full-window-drag"?: boolean;
  /**
   * If set to “true”, graphical effects such as transparent windows and shadows will be allowed. By default, such effects, if available, are disabled.
  */
  "enable-desktop-composition"?: boolean;
  /*
  * If set to “true”, menu open and close animations will be allowed. Menu animations are disabled by default.
  */
  "enable-menu-animations"?: boolean;
  /**
   * In certain situations, particularly with RDP server implementations with known bugs, it is necessary to disable RDP’s built-in bitmap caching functionality. This parameter allows that to be controlled in a Guacamole session. If set to “true” the RDP bitmap cache will not be used.
  */
  "disable-bitmap-caching"?: boolean;
  /**
   * RDP normally maintains caches of regions of the screen that are currently not visible in the client in order to accelerate retrieval of those regions when they come into view. This parameter, when set to “true,” will disable caching of those regions. This is usually only useful when dealing with known bugs in RDP server implementations and should remain enabled in most circumstances.
  */
  "disable-offscreen-caching"?: boolean;
  /**
   * In addition to screen regions, RDP maintains caches of frequently used symbols or fonts, collectively known as “glyphs.” As with bitmap and offscreen caching, certain known bugs in RDP implementations can cause performance issues with this enabled, and setting this parameter to “true” will disable that glyph caching in the RDP session.
   * 
   * Glyph caching is currently universally disabled, regardless of the value of this parameter, as glyph caching support is not considered stable by FreeRDP as of the FreeRDP 2.0.0 release. See: GUACAMOLE-1191.
  */
  "disable-glyph-caching"?: boolean;
}

export interface ssh_unencrypted_settings {
  /**
   * The specific locale to request for the SSH session. This parameter is optional and may be any value accepted by the LANG environment variable of the SSH server. If not specified, the SSH server’s default locale will be used.
   * 
   * As this parameter is sent to the SSH server using the LANG environment variable, the parameter will only have an effect if the SSH server allows the LANG environment variable to be set by SSH clients.
  */
  locale?: string;
  /**
   * This parameter allows you to control the timezone that is sent to the server over the SSH connection, which will change the way local time is displayed on the server.
   * 
   * The mechanism used to do this over SSH connections is by setting the TZ variable on the SSH connection to the timezone specified by this parameter. This means that the SSH server must allow the TZ variable to be set/overriden - many SSH server implementations have this disabled by default. To get this to work, you may need to modify the configuration of the SSH server and explicitly allow for TZ to be set/overriden.
   * 
   * The available values of this parameter are standard IANA key zone format timezones, and the value will be sent directly to the server in this format.
  */
  timezone?: string;
  /**
   * Whether file transfer should be enabled. If set to “true”, the user will be allowed to upload or download files from the SSH server using SFTP. Guacamole includes the guacctl utility which controls file downloads and uploads when run on the SSH server by the user over the SSH connection.
  */
  "enable-sftp"?: boolean;
  /**
   * If set to true downloads from the remote system to the client (browser) will be disabled. The default is false, which means that downloads will be enabled.
   * 
   * If SFTP is not enabled, this parameter will be ignored.
  */
  "sftp-disable-download"?: boolean;
  /**
   * If set to true uploads from the client (browser) to the remote system will be disabled. The default is false, which means that uploads will be enabled.
   * 
   * If SFTP is not enabled, this parameter will be ignored.
  */
  "sftp-disable-upload"?: boolean;
}

export interface telnet_unencrypted_settings {

}

export interface kubernetes_unencrypted_settings {
  /**
   * The name of the Kubernetes namespace of the pod containing the container being attached to. This parameter is optional. If omitted, the namespace “default” will be used.
  */
    namespace?: string;
}

export interface vnc_connection {
  type: "vnc",
  settings: vnc_settings
}

export interface rdp_connection {
  type: "rdp",
  settings: rdp_settings
}

export interface ssh_connection {
  type: "ssh",
  settings: ssh_settings
}

export interface telnet_connection {
  type: "telnet",
  settings: telnet_settings
}

export interface kubernetes_connection {
  type: "kubernetes",
  settings: kubernetes_settings
}

export interface guac_token_params {
  connection: connection_options;
}

export interface guac_params {
  /** For all custom fields.
   * Typically these fields would be used in the callback function on guacamole-lite-ts server
   */
  [x: string]: any;
  /**
   * "token"" is required and should contain an encrypted string of "guac_token_params" interface you
   * can import that interface from remote-desktop.service.ts
   */
  token: string;
  /** Optional parameters that will NOT be encrypted */
  vnc?: vnc_unencrypted_settings;
  /** Optional parameters that will NOT be encrypted */
  rdp?: rdp_unencrypted_settings;
  /** Optional parameters that will NOT be encrypted */
  ssh?: ssh_unencrypted_settings;
  /** Optional parameters that will NOT be encrypted */
  telnet?: telnet_unencrypted_settings;
  /** Optional parameters that will NOT be encrypted */
  kubernetes?: kubernetes_unencrypted_settings;
}
