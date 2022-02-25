import {Component, Input, OnInit} from '@angular/core';
import {ManagedFileUpload, StreamState} from '../managed-file-upload';

@Component({
  selector: 'ngx-file-transfer',
  templateUrl: './file-transfer.component.html',
  styleUrls: ['./file-transfer.component.scss']
})
export class FileTransferComponent implements OnInit {
  /**
   * The file transfer to display.
   */
  @Input() transfer: ManagedFileUpload;

  constructor() {
  }

  ngOnInit(): void {
  }

  /**
   * Returns the unit string that is most appropriate for the
   * number of bytes transferred thus far - either 'GB', 'MB', 'KB',
   * or 'B'.
   *
   * @returns {String}
   *     The unit string that is most appropriate for the number of
   *     bytes transferred thus far.
   */
  getProgressUnit() {
    var bytes = this.transfer.progress;

    // Gigabytes
    if (bytes > 1000000000)
      return 'GB';

    // Megabytes
    if (bytes > 1000000)
      return 'MB';

    // Kilobytes
    if (bytes > 1000)
      return 'KB';

    // Bytes
    return 'B';

  };

  /**
   * Returns the amount of data transferred thus far, in the units
   * returned by getProgressUnit().
   *
   * @returns {Number}
   *     The amount of data transferred thus far, in the units
   *     returned by getProgressUnit().
   */
  getProgressValue() {
    var bytes = this.transfer.progress;
    if (!bytes)
      return bytes;

    // Convert bytes to necessary units
    switch (this.getProgressUnit()) {

      // Gigabytes
      case 'GB':
        return (bytes / 1000000000).toFixed(1);

      // Megabytes
      case 'MB':
        return (bytes / 1000000).toFixed(1);

      // Kilobytes
      case 'KB':
        return (bytes / 1000).toFixed(1);

      // Bytes
      case 'B':
      default:
        return bytes;

    }

  };

  /**
   * Returns the percentage of bytes transferred thus far, if the
   * overall length of the file is known.
   *
   * @returns {Number}
   *     The percentage of bytes transferred thus far, if the
   *     overall length of the file is known.
   */
  getPercentDone() {
    return this.transfer.progress / this.transfer.length * 100;
  };

  /**
   * Determines whether the associated file transfer is in progress.
   *
   * @returns {Boolean}
   *     true if the file transfer is in progress, false othherwise.
   */
  isInProgress() {

    // Not in progress if there is no transfer
    if (!this.transfer)
      return false;

    // Determine in-progress status based on stream state
    switch (this.transfer.transferState.streamState) {

      // IDLE or OPEN file transfers are active
      case StreamState.IDLE:
      case StreamState.OPEN:
        return true;

      // All others are not active
      default:
        return false;

    }

  };

  /**
   * Returns whether an error has occurred. If an error has occurred,
   * the transfer is no longer active, and the text of the error can
   * be read from getErrorText().
   *
   * @returns {Boolean}
   *     true if an error has occurred during transfer, false
   *     otherwise.
   */
  hasError() {
    return this.transfer.transferState.streamState === StreamState.ERROR;
  };

  /**
   * Returns the text of the current error as a translation string.
   *
   * @returns {String}
   *     The name of the translation string containing the text
   *     associated with the current error.
   */
  getErrorText() {

    // Determine translation name of error
    var status = this.transfer.transferState.statusCode;
    var errorName = (status in UPLOAD_ERRORS) ? status.toString(16).toUpperCase() : "DEFAULT";

    // Return translation string
    return ERROR_DESCRIPTIONS[errorName];

  };
}

/**
 * All upload error codes handled and passed off for translation.
 * Any error code not present in this list will be represented by
 * the "DEFAULT" translation.
 */
var UPLOAD_ERRORS = {
  0x0100: true,
  0x0201: true,
  0x0202: true,
  0x0203: true,
  0x0204: true,
  0x0205: true,
  0x0301: true,
  0x0303: true,
  0x0308: true,
  0x031D: true
};

var ERROR_DESCRIPTIONS = {
  "100"     : "File transfer is either not supported or not enabled. Please contact your system administrator, or check your system logs.",
  "201"     : "Too many files are currently being transferred. Please wait for existing transfers to complete, and then try again.",
  "202"     : "The file cannot be transferred because the remote desktop server is taking too long to respond. Please try again or contact your system administrator.",
  "203"     : "The remote desktop server encountered an error during transfer. Please try again or contact your system administrator.",
  "204"     : "The destination for the file transfer does not exist. Please check that the destination exists and try again.",
  "205"     : "The destination for the file transfer is currently locked. Please wait for any in-progress tasks to complete and try again.",
  "301"     : "You do not have permission to upload this file because you are not logged in. Please log in and try again.",
  "303"     : "You do not have permission to upload this file. If you require access, please check your system settings, or check with your system administrator.",
  "308"     : "The file transfer has stalled. This is commonly caused by network problems, such as spotty wireless signal, or simply very slow network speeds. Please check your network and try again.",
  "31D"     : "Too many files are currently being transferred. Please wait for existing transfers to complete, and then try again.",
  "DEFAULT" : "An internal error has occurred within the Guacamole server, and the connection has been terminated. If the problem persists, please notify your system administrator, or check your system logs.",
}
