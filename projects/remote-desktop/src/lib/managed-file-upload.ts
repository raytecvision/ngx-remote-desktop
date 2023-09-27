/**
 * Object which serves as a surrogate interface, encapsulating a Guacamole
 * file upload while it is active, allowing it to be detached and
 * reattached from different client views.
 *
 * @constructor
 * @param [template={}]
 *     The object whose properties should be copied within the new
 *     ManagedFileUpload.
 */
import {Status} from 'guacamole-common-ts';

export class ManagedFileUpload {
  /**
   * The mimetype of the file being transferred.
   */
  mimetype: string;

  /**
   * The filename of the file being transferred.
   */
  filename: string;

  /**
   * The number of bytes transferred so far.
   */
  progress: number;

  /**
   * The total number of bytes in the file.
   */
  length: number;

  /**
   * The current state of the file transfer stream.
   */
  transferState: ManagedFileTransferState;

  constructor(template: Partial<ManagedFileUpload>) {
    template = template || {};
    this.mimetype = template.mimetype;
    this.filename = template.filename;
    this.progress = template.progress;
    this.length = template.length;
    this.transferState = template.transferState || new ManagedFileTransferState(null);
  }

  isCompleted(): boolean {
    return this.transferState?.streamState === StreamState.CLOSED;
  }
}

/**
 * Object which represents the state of a Guacamole stream, including any
 * error conditions.
 *
 * @constructor
 * @param [template={}]
 *     The object whose properties should be copied within the new
 *     ManagedFileTransferState.
 */
export class ManagedFileTransferState {
  /**
   * The current stream state. Valid values are described by StreamState.
   * @default StreamState.IDLE
   */
  streamState: string;

  /**
   * The status code of the current error condition, if streamState
   * is ERROR. For all other streamState values, this will be
   * @link{Guacamole.Status.Code.SUCCESS}.
   *
   * @default Guacamole.Status.Code.SUCCESS
   */
  statusCode: number;

  constructor(template: Partial<ManagedFileTransferState>) {
    template = template || {};
    this.streamState = template.streamState || StreamState.IDLE;
    this.statusCode = template.statusCode || Status.Code.SUCCESS;
  }

  /**
   * Sets the current transfer state and, if given, the associated status
   * code. If an error is already represented, this function has no effect.
   *
   * @param streamState
   *     The stream state to assign to the given ManagedFileTransferState, as
   *     listed within StreamState.
   *
   * @param [statusCode]
   *     The status code to assign to the given ManagedFileTransferState, if
   *     any, as listed within Guacamole.Status.Code. If no status code is
   *     specified, the status code of the ManagedFileTransferState is not
   *     touched.
   */
  setStreamState(streamState: string, statusCode: number) {

    // Do not set state after an error is registered
    if (this.streamState === StreamState.ERROR)
      return;

    // Update stream state
    this.streamState = streamState;

    // Set status code, if given
    if (statusCode)
      this.statusCode = statusCode;

  };
}

/**
 * Valid stream state strings. Each state string is associated with a
 * specific state of a Guacamole stream.
 */
export const StreamState = {
  /**
   * The stream has not yet been opened.
   *
   * @type String
   */
  IDLE: 'IDLE',

  /**
   * The stream has been successfully established. Data can be sent or
   * received.
   *
   * @type String
   */
  OPEN: 'OPEN',

  /**
   * The stream has terminated successfully. No errors are indicated.
   *
   * @type String
   */
  CLOSED: 'CLOSED',

  /**
   * The stream has terminated due to an error. The associated error code
   * is stored in statusCode.
   *
   * @type String
   */
  ERROR: 'ERROR'
}
