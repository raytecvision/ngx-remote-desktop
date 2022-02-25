import {Injectable} from '@angular/core';
import {Client, JSONReader, Object, Status, Tunnel} from '@raytecvision/guacamole-common-js';
import {File, FileType, ManagedFilesystem} from './managed-filesystem';
import {TunnelRestApiService} from './tunnel-rest-api.service';

@Injectable({
  providedIn: 'root'
})
export class ManagedFilesystemService {

  constructor(
    private tunnelService: TunnelRestApiService,
  ) {
  }

  /**
   * Creates a new ManagedFilesystem instance from the given Guacamole.Object
   * and human-readable name. Upon creation, a request to populate the
   * contents of the root directory will be automatically dispatched.
   *
   * @param tunnel
   * @param client
   *     The client that originally received the "filesystem" instruction
   *     that resulted in the creation of this ManagedFilesystem.
   *
   * @param object
   *     The Guacamole.Object defining the filesystem.
   *
   * @param name
   *     A human-readable name for the filesystem.
   *
   * @returns
   *     The newly-created ManagedFilesystem.
   */
  async createInstance(
    tunnel: Tunnel,
    client: Client,
    object: Object,
    name: string,
  ): Promise<ManagedFilesystem> {
    const fs = new ManagedFilesystem({
      tunnel: tunnel,
      client: client,
      object: object,
      name: name,
      root: new File({
        mimetype: Object.STREAM_INDEX_MIMETYPE,
        streamName: Object.ROOT_STREAM,
        type: FileType.DIRECTORY
      }),
    });

    await this.refresh(fs, fs.root);
    return fs;
  }


  /**
   * Refreshes the contents of the given file, if that file is a directory.
   * Only the immediate children of the file are refreshed. Files further
   * down the directory tree are not refreshed.
   *
   * @param fs
   *     The filesystem associated with the file being refreshed.
   *
   * @param file
   *     The file being refreshed.
   */
  async refresh(fs: ManagedFilesystem, file: File) {
    return new Promise<void>((resolve, reject) => {
      // Do not attempt to refresh the contents of directories (you mean files? misleading comment?)
      if (file.mimetype !== Object.STREAM_INDEX_MIMETYPE) {
        reject(new Error('mimetype of requested file is not STREAM_INDEX_MIMETYPE'));
      }

      // Request contents of given file
      fs.object.requestInputStream(file.streamName, function handleStream(stream, mimetype) {

        // Ignore stream if mimetype is wrong
        if (mimetype !== Object.STREAM_INDEX_MIMETYPE) {
          stream.sendAck('Unexpected mimetype', Status.Code.UNSUPPORTED);
          reject(new Error('mimetype of returned file is not STREAM_INDEX_MIMETYPE'));
        }

        // Signal server that data is ready to be received
        stream.sendAck('Ready', Status.Code.SUCCESS);

        // Read stream as JSON
        var reader = new JSONReader(stream);

        // Acknowledge received JSON blobs
        reader.onprogress = function onprogress() {
          stream.sendAck('Received', Status.Code.SUCCESS);
        };

        // Reset contents of directory
        reader.onend = function jsonReady() {
          file.files = {};

          // Determine the expected filename prefix of each stream
          var expectedPrefix = file.streamName;
          if (expectedPrefix.charAt(expectedPrefix.length - 1) !== '/')
            expectedPrefix += '/';

          // For each received stream name
          var mimetypes = reader.getJSON();
          for (var name in mimetypes) {

            // Assert prefix is correct
            if (name.substring(0, expectedPrefix.length) !== expectedPrefix)
              continue;

            // Extract filename from stream name
            var filename = name.substring(expectedPrefix.length);

            // Deduce type from mimetype
            var type = FileType.NORMAL;
            if (mimetypes[name] === Object.STREAM_INDEX_MIMETYPE)
              type = FileType.DIRECTORY;

            // Add file entry
            file.files[filename] = new File({
              mimetype: mimetypes[name],
              streamName: name,
              type: type,
              parent: file,
              name: filename
            });
          }

          resolve();
        };
      })
    });
  }

  /**
   * Downloads the given file from the server using the given Guacamole
   * client and filesystem. The browser will automatically start the
   * download upon completion of this function.
   *
   * @param fs
   *     The ManagedFilesystem from which the file is to be downloaded. Any
   *     path information provided must be relative to this filesystem.
   *
   * @param path
   *     The full, absolute path of the file to download, retrieved from file.streamName.
   */
  startFileDownload(fs: ManagedFilesystem, path: string) {
    // Request download
    const tunnel = fs.tunnel;
    const tunnelService = this.tunnelService;
    fs.object.requestInputStream(path, function downloadStreamReceived(stream, mimetype) {

      // Parse filename from string
      var filename = path.match(/(.*[\\/])?(.*)/)[2];

      // Start download
      tunnelService.downloadStream(tunnel.uuid, stream, mimetype, filename);
    });
  }

  /**
   * Changes the current directory of the given filesystem, automatically
   * refreshing the contents of that directory.
   *
   * @param fs
   *     The filesystem whose current directory should be changed.
   *
   * @param file
   *     The directory to change to.
   */
  async changeDirectory(fs: ManagedFilesystem, file: File) {
    // Refresh contents
    await this.refresh(fs, file);

    // Set current directory
    fs.currentDirectory = file;
  }
}
