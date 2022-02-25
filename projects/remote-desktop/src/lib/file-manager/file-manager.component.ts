import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {RemoteDesktopService} from '../remote-desktop.service';
import {File, FileType, ManagedFilesystem} from '../managed-filesystem';
import {ManagedFilesystemService} from '../managed-filesystem.service';
import {timer} from 'rxjs';
import {finalize, takeWhile} from 'rxjs/operators';

/**
 * The main file manager UI, kept as an independent component that has to be manually
 * included in the template, so it can be used without a VNC connection
 */
@Component({
  selector: 'ngx-remote-desktop-file-manager',
  templateUrl: './file-manager.component.html',
  styleUrls: ['./file-manager.component.scss']
})
export class FileManagerComponent implements OnInit {
  filesystems: ManagedFilesystem[];
  fs: ManagedFilesystem;

  FileType = FileType;

  @ViewChild('fileInput') fileInput: ElementRef;

  constructor(
    public manager: RemoteDesktopService,
    private fsService: ManagedFilesystemService,
  ) {
  }

  ngOnInit(): void {
    this.filesystems = this.manager.getFilesystems()
    if (this.filesystems.length > 0) {
      this.loadFilesystem(this.filesystems[0]);
    }
  }

  get currentDirFiles(): File[] {
    if (!this.fs.currentDirectory.files) {
      return [];
    } else {
      return Object.keys(this.fs.currentDirectory.files)
        .map(e => this.fs.currentDirectory.files[e])
        .sort((a, b) => a.name > b.name ? 1 : -1);
    }
  }

  loadFilesystem(fs: ManagedFilesystem) {
    this.fs = fs;
    this.cd(this.fs.root)
  }

  cd(f: File) {
    this.fsService.changeDirectory(this.fs, f).catch(err => {
      console.error(err)
    })
  }

  download(f: File) {
    this.fsService.startFileDownload(this.fs, f.streamName);
  }

  selectForUpload() {
    this.fileInput.nativeElement.click();
  }

  handleFileInput(files: FileList) {
    // Upload each file
    for (var i = 0; i < files.length; i++) {
      const ul = this.manager.uploadFile(files[i], this.fs, this.fs.currentDirectory)

      // Refresh filesystem when it's complete
      timer(0, 100).pipe(
        takeWhile(() => !ul.isCompleted()),
        finalize(() => {
          console.log('Refreshing FS')
          this.fsService.refresh(this.fs, this.fs.currentDirectory).then()
        })
      ).subscribe()
    }
  }
}
