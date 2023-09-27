import {Client, Object, Tunnel} from 'guacamole-common-ts';

/**
 * Object which serves as a surrogate interface, encapsulating a Guacamole
 * filesystem object while it is active, allowing it to be detached and
 * reattached from different client views.
 *
 * @param [template={}]
 *     The object whose properties should be copied within the new
 *     ManagedFilesystem.
 */
export class ManagedFilesystem {
  /**
   * The client that originally received the "filesystem" instruction
   * that resulted in the creation of this ManagedFilesystem.
   */
  client: Client | undefined;

  tunnel: Tunnel | undefined

  /**
   * The Guacamole filesystem object, as received via a "filesystem"
   * instruction.
   */
  object: Object | undefined;

  /**
   * The declared, human-readable name of the filesystem
   *
   * @type String
   */
  name: string | undefined;

  /**
   * The root directory of the filesystem.
   */
  root: File | undefined;

  /**
   * The current directory being viewed or manipulated within the
   * filesystem.
   */
  currentDirectory: File | undefined;

  constructor(template: Partial<ManagedFilesystem>) {
    template = template || {};
    this.tunnel = template.tunnel;
    this.client = template.client;
    this.object = template.object;
    this.name = template.name;
    this.root = template.root;
    this.currentDirectory = template.currentDirectory;
  }
}

/**
 * A file within a ManagedFilesystem. Each ManagedFilesystem.File provides
 * sufficient information for retrieval or replacement of the file's
 * contents, as well as the file's name and type.
 *
 * @param [template={}]
 *     The object whose properties should be copied within the new
 *     ManagedFilesystem.File.
 */
export class File {
  /**
   * The mimetype of the data contained within this file.
   */
  mimetype: string;

  /**
   * The name of the stream representing this files contents within its
   * associated filesystem object.
   */
  streamName: string;

  /**
   * The type of this file. All legal file type strings are defined
   * within FileType.
   */
  type: string;

  /**
   * The name of this file.
   */
  name: string;

  /**
   * The parent directory of this file. In the case of the root
   * directory, this will be null.
   */
  parent: File;

  /**
   * Map of all known files containined within this file by name. This is
   * only applicable to directories.
   */
  files: { [key: string]: File };

  constructor(template: Partial<File>) {
    this.mimetype = template.mimetype;
    this.streamName = template.streamName;
    this.type = template.type;
    this.name = template.name;
    this.parent = template.parent;
    this.files = template.files;
  }
}

export const FileType = {

  /**
   * A normal file. As ManagedFilesystem does not currently represent any
   * other non-directory types of files, like symbolic links, this type
   * string may be used for any non-directory file.
   *
   * @type String
   */
  NORMAL: 'NORMAL',

  /**
   * A directory.
   *
   * @type String
   */
  DIRECTORY: 'DIRECTORY'

};
