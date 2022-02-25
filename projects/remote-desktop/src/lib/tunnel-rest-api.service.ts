import {Inject, Injectable} from '@angular/core';
import {InputStream, OutputStream, Status} from '@raytecvision/guacamole-common-js';
import {DOCUMENT} from '@angular/common';
import {HttpClient} from '@angular/common/http';
import {take} from 'rxjs/operators';

/**
 * The number of milliseconds to wait after a stream download has completed
 * before cleaning up related DOM resources, if the browser does not
 * otherwise notify us that cleanup is safe.
 */
const DOWNLOAD_CLEANUP_WAIT = 5000;

/**
 * Service for operating on the tunnels of in-progress connections (and their
 * underlying objects) via the REST API.
 */
@Injectable({
  providedIn: 'root'
})
export class TunnelRestApiService {
  private apiUrl: string;
  private token: string;
  private window: Window;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private http: HttpClient,
  ) {
    this.window = this.document.defaultView;
  }

  initialize(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  /**
   * Makes a request to the REST API to get the list of all tunnels
   * associated with in-progress connections, returning a promise that
   * provides an array of their UUIDs (strings) if successful.
   *
   * @returns {Promise.<String[]>>}
   *     A promise which will resolve with an array of UUID strings, uniquely
   *     identifying each active tunnel.
   */
  getTunnels() {
    this.checkServiceState();
    return this.http.get(this.apiUrl + '/api/session/tunnels', {
      headers: {'Guacamole-Token': this.token},
    }).pipe(take(1)).toPromise();
  };

  /**
   * Makes a request to the REST API to retrieve the underlying protocol of
   * the connection associated with a particular tunnel, returning a promise
   * that provides a @link{Protocol} object if successful.
   *
   * @param {String} tunnel
   *     The UUID of the tunnel associated with the Guacamole connection
   *     whose underlying protocol is being retrieved.
   *
   * @returns {Promise.<Protocol>}
   *     A promise which will resolve with a @link{Protocol} object upon
   *     success.
   */
  getProtocol(tunnel: string) {
    this.checkServiceState();
    return this.http.get(this.apiUrl + '/api/session/tunnels/' + encodeURIComponent(tunnel) + '/protocol', {
      params: {
        token: this.token
      }
    }).pipe(take(1)).toPromise();
  };

  /**
   * Retrieves the set of sharing profiles that the current user can use to
   * share the active connection of the given tunnel.
   *
   * @param {String} tunnel
   *     The UUID of the tunnel associated with the Guacamole connection
   *     whose sharing profiles are being retrieved.
   *
   * @returns {Promise.<Object.<String, SharingProfile>>}
   *     A promise which will resolve with a map of @link{SharingProfile}
   *     objects where each key is the identifier of the corresponding
   *     sharing profile.
   */
  getSharingProfiles(tunnel: string) {
    this.checkServiceState();
    return this.http.get(this.apiUrl + '/api/session/tunnels/' + encodeURIComponent(tunnel)
      + '/activeConnection/connection/sharingProfiles', {
      headers: {'Guacamole-Token': this.token},
    }).pipe(take(1)).toPromise();
  };

  /**
   * Makes a request to the REST API to generate credentials which have
   * access strictly to the active connection associated with the given
   * tunnel, using the restrictions defined by the given sharing profile,
   * returning a promise that provides the resulting @link{UserCredentials}
   * object if successful.
   *
   * @param {String} tunnel
   *     The UUID of the tunnel associated with the Guacamole connection
   *     being shared.
   *
   * @param {String} sharingProfile
   *     The identifier of the connection object dictating the
   *     semantics/restrictions which apply to the shared session.
   *
   * @returns {Promise.<UserCredentials>}
   *     A promise which will resolve with a @link{UserCredentials} object
   *     upon success.
   */
  getSharingCredentials(tunnel: string, sharingProfile: string) {
    this.checkServiceState();
    return this.http.get(this.apiUrl + '/api/session/tunnels/' + encodeURIComponent(tunnel)
      + '/activeConnection/sharingCredentials/'
      + encodeURIComponent(sharingProfile), {
      headers: {'Guacamole-Token': this.token},
    }).pipe(take(1)).toPromise();
  };

  /**
   * Sanitize a filename, replacing all URL path seperators with safe
   * characters.
   *
   * @param filename
   *     An unsanitized filename that may need cleanup.
   *
   * @returns
   *     The sanitized filename.
   */
  static sanitizeFilename(filename: string) {
    return filename.replace(/[\\\/]+/g, '_');
  };

  /**
   * Makes a request to the REST API to retrieve the contents of a stream
   * which has been created within the active Guacamole connection associated
   * with the given tunnel. The contents of the stream will automatically be
   * downloaded by the browser.
   *
   * WARNING: Like Guacamole's various reader implementations, this function
   * relies on assigning an "onend" handler to the stream object for the sake
   * of cleaning up resources after the stream closes. If the "onend" handler
   * is overwritten after this function returns, resources may not be
   * properly cleaned up.
   *
   * @param {String} tunnelUuid
   *     The UUID of the tunnel associated with the Guacamole connection
   *     whose stream should be downloaded as a file.
   *
   * @param {Guacamole.InputStream} stream
   *     The stream whose contents should be downloaded.
   *
   * @param {String} mimetype
   *     The mimetype of the stream being downloaded. This is currently
   *     ignored, with the download forced by using
   *     "application/octet-stream".
   *
   * @param {String} filename
   *     The filename that should be given to the downloaded file.
   */
  downloadStream(tunnelUuid: string, stream: InputStream, mimetype: string, filename: string) {
    this.checkServiceState();
    const w = this.window;

    // Build download URL
    var url = this.apiUrl
      + '/api/session/tunnels/' + encodeURIComponent(tunnelUuid)
      + '/streams/' + encodeURIComponent(stream.index)
      + '/' + encodeURIComponent(TunnelRestApiService.sanitizeFilename(filename))
      + '?token=' + encodeURIComponent(this.token);

    // Create temporary hidden iframe to facilitate download
    var iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.border = 'none';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.left = '-1px';
    iframe.style.top = '-1px';

    // The iframe MUST be part of the DOM for the download to occur
    document.body.appendChild(iframe);

    // Automatically remove iframe from DOM when download completes, if
    // browser supports tracking of iframe downloads via the "load" event
    iframe.onload = function downloadComplete() {
      document.body.removeChild(iframe);
    };

    // Acknowledge (and ignore) any received blobs
    stream.onblob = function acknowledgeData() {
      stream.sendAck('OK', Status.Code.SUCCESS);
    };

    // Automatically remove iframe from DOM a few seconds after the stream
    // ends, in the browser does NOT fire the "load" event for downloads
    stream.onend = function downloadComplete() {
      w.setTimeout(function cleanupIframe() {
        if (iframe.parentElement) {
          document.body.removeChild(iframe);
        }
      }, DOWNLOAD_CLEANUP_WAIT);
    };

    // Begin download
    iframe.src = url;
  }

  /**
   * Makes a request to the REST API to send the contents of the given file
   * along a stream which has been created within the active Guacamole
   * connection associated with the given tunnel. The contents of the file
   * will automatically be split into individual "blob" instructions, as if
   * sent by the connected Guacamole client.
   *
   * @param {String} tunnel
   *     The UUID of the tunnel associated with the Guacamole connection
   *     whose stream should receive the given file.
   *
   * @param {Guacamole.OutputStream} stream
   *     The stream that should receive the given file.
   *
   * @param {File} file
   *     The file that should be sent along the given stream.
   *
   * @param {Function} [progressCallback]
   *     An optional callback which, if provided, will be invoked as the
   *     file upload progresses. The current position within the file, in
   *     bytes, will be provided to the callback as the sole argument.
   *
   * @return {Promise}
   *     A promise which resolves when the upload has completed, and is
   *     rejected with an Error if the upload fails. The Guacamole protocol
   *     status code describing the failure will be included in the Error if
   *     available. If the status code is available, the type of the Error
   *     will be STREAM_ERROR.
   */
  uploadToStream(tunnel: string, stream: OutputStream, file: File, progressCallback: (a: any) => void) {
    return new Promise<void>((resolve, reject) => {

      // Build upload URL
      var url = this.apiUrl
        + '/api/session/tunnels/' + encodeURIComponent(tunnel)
        + '/streams/' + encodeURIComponent(stream.index)
        + '/' + encodeURIComponent(TunnelRestApiService.sanitizeFilename(file.name))
        + '?token=' + encodeURIComponent(this.token);

      var xhr = new XMLHttpRequest();

      // Invoke provided callback if upload tracking is supported
      if (progressCallback && xhr.upload) {
        xhr.upload.addEventListener('progress', function updateProgress(e) {
          progressCallback(e.loaded);
        });
      }

      // Resolve/reject promise once upload has stopped
      xhr.onreadystatechange = function uploadStatusChanged() {

        // Ignore state changes prior to completion
        if (xhr.readyState !== 4)
          return;

        // Resolve if HTTP status code indicates success
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        }
        // Parse and reject with resulting JSON error
        else if (xhr.getResponseHeader('Content-Type') === 'application/json') {
          reject(JSON.parse(xhr.responseText));
        }
        // Warn of lack of permission of a proxy rejects the upload
        else if (xhr.status >= 400 && xhr.status < 500) {
          reject({
            'type': 'STREAM_ERROR',
            'statusCode': Status.Code.CLIENT_FORBIDDEN,
            'message': 'HTTP ' + xhr.status
          });
        }
        // Assume internal error for all other cases
        else {
          reject({
            'type': 'STREAM_ERROR',
            'statusCode': Status.Code.INTERNAL_ERROR,
            'message': 'HTTP ' + xhr.status
          });
        }
      };

      // Perform upload
      xhr.open('POST', url, true);
      xhr.send(file);
    });
  };

  private checkServiceState() {
    if (!this.apiUrl) {
      throw new Error('TunnelRestApiService not initialized yet');
    }
    if (!this.token) {
      throw new Error('Token not yet set in TunnelRestApiService')
    }
  }
}
