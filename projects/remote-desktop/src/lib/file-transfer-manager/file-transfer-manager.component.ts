import {Component, OnInit} from '@angular/core';
import {RemoteDesktopService} from '../remote-desktop.service';

@Component({
  selector: 'ngx-file-transfer-manager',
  templateUrl: './file-transfer-manager.component.html',
  styleUrls: ['./file-transfer-manager.component.scss']
})
export class FileTransferManagerComponent implements OnInit {

  constructor(
    public remoteDesktopService: RemoteDesktopService,
  ) {
  }

  ngOnInit(): void {
  }

  /**
   * Returns whether the given client has any associated file transfers,
   * regardless of those file transfers' state.
   */
  public hasTransfers(): boolean  {
    const u = this.remoteDesktopService.getUploads();
    return !!(u && u.length);
  };
}
